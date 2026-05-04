"""Structured PDF parser using pdfplumber.

Why this exists:
  Flat-text extraction (pdftotext) loses the document structure that
  matters for interpretation. A 28-page IIT rolling advertisement is
  not a paragraph stream — it's a hierarchical document with section
  headers, tables (reservation breakdowns, qualification matrices),
  numbered lists (sub-areas), and per-department subsections. Regex
  on the flat text can't recover that structure reliably; what we
  need is to PARSE the structure first, then walk it.

  This script is the first stage of the new pipeline:

    .cache/job-ad-pdfs/{pdf}              (raw PDFs)
       │  pdfplumber: words+bbox+font, tables
       ▼
    corpus/parsed/{pdf}.json              (THIS — structured sections per page)
       │  deterministic rules: department / discipline / areas / qualifications
       ▼
    corpus/extracted/{pdf}.json           (per-position records, dashboard-ready)
       │
       ▼
    docs/data/current.json                (injected by inject_extracted_into_current.py)

  Step 3 is a separate script. This script (Step 2) is the foundation:
  it doesn't try to interpret what each section MEANS — it just
  identifies WHERE the sections are and what KIND each is (header,
  paragraph, table, list, ...). The interpretation step in stage 3
  walks this structure with simple rules.

  No LLM API. No regex on user-visible content. The structure carries
  the semantics.

Output schema (corpus/parsed/{pdf}.json):

  {
    "pdf_filename": str,
    "extracted_at": ISO-8601 str,
    "extraction_method": "pdfplumber-structured-v1",
    "page_count": int,
    "sections": [
      {
        "type": "header" | "paragraph" | "list" | "table" | "spacer",
        "page": int,                              # 1-indexed page
        "y": float,                               # vertical position (page top = 0)
        # type-specific fields:
        "level":  int,                            # for header: 1 (highest) or 2
        "text":   str,                            # for header / paragraph
        "items":  [str, ...],                    # for list (e.g., "(i) X", "(ii) Y")
        "columns": [str, ...],                    # for table: header row
        "rows":    [[str, ...], ...],             # for table: data rows
      },
      ...
    ]
  }

Run:
  .venv/bin/python scripts/parse_pdf_structured.py [--limit N] [--pdf PATH]
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path
from statistics import median
from typing import Any

import pdfplumber

ROOT = Path(__file__).resolve().parents[1]
PDF_DIR = ROOT / ".cache" / "job-ad-pdfs"
OUT_DIR = ROOT / "corpus" / "parsed"

# Layout heuristics. These can be tuned per-institution-family if
# needed; defaults are calibrated against the IIT/IIM/AIIMS samples
# in the current corpus.
HEADER_FONT_RATIO = 1.10       # font size >= median * this = header candidate
HEADER_LEVEL_BREAK = 1.30      # font size >= median * this = top-level header
LINE_Y_TOLERANCE = 3.5         # pixels; words within this Y are same line
WORD_X_GAP_LIST_MARKER = 4.0   # pixels; gap before list-marker token

# List-marker patterns: parenthesised Roman / arabic / alpha; bare bullet.
LIST_MARKER_RE = re.compile(
    r"^(?:"
    r"\((?:[ivx]{1,4}|[a-z]|\d{1,2})\)"          # (i) (1) (a) (i-iv)
    r"|\d{1,2}\.\s"                              # 1.
    r"|\d{1,2}\)\s"                              # 1)
    r"|[•●▪◦‣⁃]\s"                              # bullets
    r"|[-–—]\s+"                                # dash bullets
    r")",
    re.IGNORECASE,
)

# Header text patterns we always treat as headers regardless of font size.
EXPLICIT_HEADER_RE = re.compile(
    r"^(?:"
    r"Department\s+of\s+[A-Z]"
    r"|School\s+of\s+[A-Z]"
    r"|Centre\s+for\s+[A-Z]"
    r"|Faculty\s+of\s+[A-Z]"
    r"|Annexure\s*[-–\s]*[IVX0-9]"
    r"|[A-Z][a-zA-Z &/-]{3,40}:\s*Application"
    r"|[A-Z][a-zA-Z &/-]{3,40}:\s+Application"
    r")",
)


def words_to_lines(words: list[dict], y_tol: float = LINE_Y_TOLERANCE) -> list[list[dict]]:
    """Group page words into lines by Y position. Within each line,
    sort by X. Returns list of lines; each line is a list of word dicts.
    """
    if not words:
        return []
    sorted_words = sorted(words, key=lambda w: (w["top"], w["x0"]))
    lines: list[list[dict]] = []
    current: list[dict] = [sorted_words[0]]
    current_y = sorted_words[0]["top"]
    for w in sorted_words[1:]:
        if abs(w["top"] - current_y) <= y_tol:
            current.append(w)
        else:
            current.sort(key=lambda x: x["x0"])
            lines.append(current)
            current = [w]
            current_y = w["top"]
    if current:
        current.sort(key=lambda x: x["x0"])
        lines.append(current)
    return lines


def line_text(line: list[dict]) -> str:
    """Reconstruct line text from its words, inserting spaces between
    horizontally-distant tokens."""
    if not line:
        return ""
    parts = [line[0]["text"]]
    for prev, curr in zip(line, line[1:]):
        gap = curr["x0"] - prev["x1"]
        # If gap is bigger than ~half a char width, insert space
        sep = " " if gap > 1.5 else ""
        parts.append(sep + curr["text"])
    return "".join(parts).strip()


def line_font_size(line: list[dict]) -> float:
    """Median font size of words on this line (proxy for header detection)."""
    sizes = [w.get("size") or 0 for w in line if w.get("size")]
    return median(sizes) if sizes else 0.0


def page_median_font(lines: list[list[dict]]) -> float:
    """Median font size across all words on the page."""
    sizes: list[float] = []
    for line in lines:
        for w in line:
            s = w.get("size") or 0
            if s:
                sizes.append(s)
    return median(sizes) if sizes else 10.0


def classify_line(text: str, font: float, page_med: float) -> tuple[str, dict[str, Any]]:
    """Classify a line into (type, meta) where type is one of:
        header / list_item / paragraph / spacer
    Returns ("paragraph", {}) for ordinary text.
    """
    text = text.strip()
    if not text:
        return "spacer", {}
    # Explicit header patterns win over font-size heuristic
    if EXPLICIT_HEADER_RE.match(text):
        level = 1 if font >= page_med * HEADER_LEVEL_BREAK else 2
        return "header", {"level": level}
    # List-marker test
    if LIST_MARKER_RE.match(text):
        return "list_item", {}
    # Font-size heuristic — large = header
    if font and page_med and font >= page_med * HEADER_FONT_RATIO:
        level = 1 if font >= page_med * HEADER_LEVEL_BREAK else 2
        return "header", {"level": level}
    return "paragraph", {}


def collapse_lines_to_sections(
    page_lines: list[tuple[str, dict[str, Any], list[dict]]],
    page_num: int,
    table_y_ranges: list[tuple[float, float]],
) -> list[dict]:
    """Take per-line classification + word data and collapse into
    section records (paragraphs become multi-line, list-items become
    `list` sections, etc.). Tables are spliced in by Y-range so they
    appear in document order alongside text.

    `page_lines` is a list of (type, meta, words) tuples in document
    order. `table_y_ranges` is the list of (y_top, y_bottom) covering
    pdfplumber-detected tables on this page; lines whose y-position
    falls inside a table range are skipped (the table itself is
    emitted as its own section).
    """
    sections: list[dict] = []
    paragraph_buf: list[str] = []
    list_buf: list[str] = []
    paragraph_y: float | None = None
    list_y: float | None = None

    def flush_paragraph():
        nonlocal paragraph_buf, paragraph_y
        if paragraph_buf:
            sections.append({
                "type": "paragraph",
                "page": page_num,
                "y": paragraph_y or 0.0,
                "text": " ".join(paragraph_buf).strip(),
            })
            paragraph_buf = []
            paragraph_y = None

    def flush_list():
        nonlocal list_buf, list_y
        if list_buf:
            sections.append({
                "type": "list",
                "page": page_num,
                "y": list_y or 0.0,
                "items": list_buf,
            })
            list_buf = []
            list_y = None

    def in_table(y: float) -> bool:
        return any(t0 <= y <= t1 for t0, t1 in table_y_ranges)

    for kind, meta, words in page_lines:
        if not words:
            continue
        y = words[0]["top"]
        if in_table(y):
            continue          # table content is emitted by table extraction below
        text = line_text(words)
        if kind == "spacer":
            # Treat as paragraph break
            flush_paragraph()
            flush_list()
            continue
        if kind == "header":
            flush_paragraph()
            flush_list()
            sections.append({
                "type": "header",
                "page": page_num,
                "y": y,
                "level": meta.get("level", 2),
                "text": text,
            })
            continue
        if kind == "list_item":
            flush_paragraph()
            if not list_buf:
                list_y = y
            list_buf.append(text)
            continue
        # paragraph
        flush_list()
        if not paragraph_buf:
            paragraph_y = y
        paragraph_buf.append(text)

    flush_paragraph()
    flush_list()
    return sections


def extract_tables(page) -> list[dict]:
    """Return pdfplumber table extractions as schema-conformant dicts."""
    out: list[dict] = []
    try:
        tables = page.extract_tables()
        finder = page.find_tables()
    except Exception:                              # pdfplumber may raise on weird PDFs
        return out
    finder_list = list(finder) if finder else []
    for table_idx, table in enumerate(tables):
        if not table or len(table) < 2:
            continue
        # Use the matching bbox in document order if available;
        # fall back to a sentinel y based on table_idx.
        y = 0.0
        if table_idx < len(finder_list):
            try:
                y = float(finder_list[table_idx].bbox[1])
            except Exception:
                y = 0.0
        rows = [[(c or "").strip() for c in row] for row in table]
        # First row is the header by convention
        columns = rows[0]
        data = rows[1:]
        out.append({
            "type": "table",
            "page": page.page_number,
            "y": float(y),
            "columns": columns,
            "rows": data,
        })
    return out


def parse_pdf(pdf_path: Path) -> dict:
    """Open a PDF, walk every page, build the structured-sections list."""
    with pdfplumber.open(pdf_path) as pdf:
        all_sections: list[dict] = []
        for page in pdf.pages:
            try:
                words = page.extract_words(
                    extra_attrs=["fontname", "size"],
                    use_text_flow=True,
                )
            except Exception:
                continue
            if not words:
                continue
            lines = words_to_lines(words)
            page_med = page_median_font(lines)
            page_lines: list[tuple[str, dict[str, Any], list[dict]]] = []
            for line in lines:
                text = line_text(line)
                font = line_font_size(line)
                kind, meta = classify_line(text, font, page_med)
                page_lines.append((kind, meta, line))
            tables = extract_tables(page)
            table_y_ranges = [(t["y"], t["y"] + 999) for t in tables]   # rough; pdfplumber bbox is enough
            page_sections = collapse_lines_to_sections(page_lines, page.page_number, table_y_ranges)
            # Splice tables in by y-position
            page_sections.extend(tables)
            page_sections.sort(key=lambda s: s["y"])
            all_sections.extend(page_sections)
        page_count = len(pdf.pages)

    return {
        "pdf_filename": pdf_path.name,
        "extracted_at": datetime.now(timezone.utc).isoformat(),
        "extraction_method": "pdfplumber-structured-v1",
        "page_count": page_count,
        "sections": all_sections,
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--limit", type=int, default=None,
                        help="Process only the first N PDFs")
    parser.add_argument("--pdf", type=str, default=None,
                        help="Process a single named PDF (filename in .cache/job-ad-pdfs/)")
    parser.add_argument("--out", type=Path, default=OUT_DIR,
                        help="Output directory")
    parser.add_argument("--force", action="store_true",
                        help="Re-parse even if output exists")
    args = parser.parse_args()

    if not PDF_DIR.exists():
        print(f"ERROR: {PDF_DIR} not found — run scripts/build_job_pdf_corpus.py first",
              file=sys.stderr)
        return 1
    args.out.mkdir(parents=True, exist_ok=True)

    pdfs = sorted(PDF_DIR.glob("*.pdf"))
    if args.pdf:
        pdfs = [PDF_DIR / args.pdf] if (PDF_DIR / args.pdf).exists() else []
        if not pdfs:
            print(f"ERROR: PDF {args.pdf} not found in {PDF_DIR}", file=sys.stderr)
            return 1
    if args.limit:
        pdfs = pdfs[: args.limit]

    print(f"parsing {len(pdfs)} PDF(s) → {args.out}")
    ok = err = skipped = 0
    for pdf_path in pdfs:
        out_path = args.out / (pdf_path.stem + ".json")
        if out_path.exists() and not args.force:
            skipped += 1
            continue
        try:
            data = parse_pdf(pdf_path)
            out_path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n")
            ok += 1
            n_sec = len(data["sections"])
            print(f"  ✓ {pdf_path.name}  ({n_sec} sections, {data['page_count']} pages)")
        except Exception as e:
            err += 1
            print(f"  ✗ {pdf_path.name}  — {type(e).__name__}: {e}", file=sys.stderr)
    print(f"\nparsed: {ok}  skipped (exists): {skipped}  failed: {err}")
    return 0 if err == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
