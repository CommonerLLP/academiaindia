"""Per-position extractor.

Reads corpus/parsed/{pdf}.json (structured sections produced by
parse_pdf_structured.py) and emits corpus/extracted/{pdf}.json
containing one record per (department, discipline) pair the PDF
advertises. The output is what inject_extracted_into_current.py
merges onto ad records in docs/data/current.json.

Strategy is structure-walking, not regex-on-flat-text:

  1. Concatenate same-shape table fragments across pages (an IIT
     rolling-advt's main table spans pages 7–22; pdfplumber returns
     it as 15 fragments but they share column structure).
  2. Identify the "main" table by header signature: must contain
     a department/discipline column AND an areas/specialisation
     column.
  3. For each row of the main table, the first column is the
     department; the areas column is free text containing one or
     more sub-discipline blocks of the form `<Sub>:<description>`.
     Split that cell into per-sub-discipline blocks; each block
     becomes one position record.
  4. The criteria column (when present) becomes qualifications_text.
  5. Reservation tables (columns matching {UR, SC, ST, OBC, EWS,
     PwBD}) are detected separately and merged onto matching
     positions by department name.

Output schema (corpus/extracted/{pdf}.json):

  {
    "pdf_filename": str,
    "extracted_at": ISO-8601,
    "extraction_method": "structured-walker-v1",
    "positions": [
      {
        "department":         str,
        "discipline":         str,
        "areas_text":         str,
        "qualifications_text": str|null,
        "reservation_breakdown": {UR/SC/ST/OBC/EWS/PwBD: int|null},
        "number_of_posts":    int|null,
        "raw_section_text":   str,
        "extraction_confidence": float
      }
    ]
  }

Fields not extracted here (methods_preference, approach, contract,
rank) come from per-text inspection downstream when reliable; null
otherwise.

Run:
  .venv/bin/python scripts/extract_positions_from_structured.py [--limit N]
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PARSED_DIR = ROOT / "corpus" / "parsed"
OUT_DIR = ROOT / "corpus" / "extracted"

# Column-header keywords used to identify the "main" position table.
DEPT_COLS = {
    "academic unit", "department", "discipline", "position",
    "department/centre/school", "centre", "school",
}
AREAS_COLS = {
    "areas", "area", "areas of specialization", "areas of specialisation",
    "areas of recruitment", "specialization", "specialisation",
    "research areas",
}
CRITERIA_COLS = {
    "additional criteria", "criteria", "additional criteria for shortlisting",
    "qualifications", "qualification", "eligibility",
}
RESERVATION_COLS = {"ur", "sc", "st", "obc", "ews", "pwbd", "pwd", "total"}

# Sub-discipline header within an Areas cell: a short capitalised
# phrase ending with ":". E.g. "Construction Engineering and Management:"
SUB_DISCIPLINE_RE = re.compile(
    r"(?:^|\n|\.\s+)([A-Z][A-Za-z][A-Za-z &/-]{2,80}):\s+(?=[A-Z(])",
)

# Per-cell whitespace cleanup: pdfplumber preserves linebreaks within
# cells; collapse them so areas_text reads as prose.
WS_RE = re.compile(r"\s+")


def _norm(s: str) -> str:
    return WS_RE.sub(" ", (s or "")).strip().lower()


def _clean(s: str) -> str:
    return WS_RE.sub(" ", (s or "")).strip()


def col_index(columns: list[str], target_set: set[str]) -> int | None:
    """Find the index of the first column whose header matches any
    name in target_set (case + whitespace insensitive)."""
    for i, c in enumerate(columns):
        if _norm(c) in target_set:
            return i
    return None


def is_main_table(columns: list[str]) -> bool:
    """A main table has both a department column AND an areas column."""
    has_dept = col_index(columns, DEPT_COLS) is not None
    has_areas = col_index(columns, AREAS_COLS) is not None
    return has_dept and has_areas


def is_reservation_table(columns: list[str]) -> bool:
    """A reservation table has at least 3 of {UR, SC, ST, OBC, EWS, PwBD}."""
    matches = sum(1 for c in columns if _norm(c) in RESERVATION_COLS)
    return matches >= 3


def merge_table_fragments(tables: list[dict]) -> list[dict]:
    """pdfplumber emits one table per page-fragment. A multi-page
    table loses its proper header row on subsequent pages — the first
    data row becomes the "columns". When that happens (same column
    COUNT as the running main table, but the "columns" look like
    data), forward-propagate the original headers and treat the
    fragment's columns as a data row.
    """
    if not tables:
        return []
    sorted_t = sorted(tables, key=lambda t: (t["page"], t["y"]))
    merged: list[dict] = []
    main_signature: list[str] | None = None     # column headers of the running main table
    main_idx: int | None = None
    for t in sorted_t:
        cols = t["columns"]
        # A fragment of the SAME main table: same column count, AND we have
        # a running main table, AND the fragment's columns don't look like
        # legitimate headers (no DEPT_COLS / AREAS_COLS / CRITERIA_COLS match).
        is_continuation = (
            main_signature is not None
            and len(cols) == len(main_signature)
            and not is_main_table(cols)              # fragment lacks proper headers
            and main_idx is not None
        )
        if is_continuation:
            # The fragment's "columns" are actually a data row — promote them
            promoted_row = list(cols)
            merged[main_idx]["rows"].append(promoted_row)
            merged[main_idx]["rows"].extend(t["rows"])
            continue
        # Same exact header signature — pure continuation
        if merged and merged[-1]["columns"] == cols:
            merged[-1]["rows"].extend(t["rows"])
            continue
        # New table
        merged.append({**t, "rows": list(t["rows"])})
        if is_main_table(cols):
            main_signature = cols
            main_idx = len(merged) - 1
    return merged


def split_areas_cell(cell: str) -> list[tuple[str, str]]:
    """Split an Areas cell into a list of (sub_discipline, description)
    tuples. The IIT Delhi pattern: "<Sub>: <description> <NextSub>:
    <next description>".

    If no sub-discipline headers are detected, return [(None, cell)]
    so the whole cell becomes one un-titled block.
    """
    cell = _clean(cell)
    if not cell:
        return []
    matches = list(SUB_DISCIPLINE_RE.finditer(cell))
    if not matches:
        return [("", cell)]
    out: list[tuple[str, str]] = []
    for i, m in enumerate(matches):
        name = m.group(1).strip()
        start = m.end()
        end = matches[i + 1].start(1) if i + 1 < len(matches) else len(cell)
        body = _clean(cell[start:end])
        if name and body:
            out.append((name, body))
    return out


def parse_int(s: str) -> int | None:
    s = (s or "").strip()
    if not s or s in ("-", "—"):
        return None
    try:
        return int(re.sub(r"\D", "", s)) if re.search(r"\d", s) else None
    except ValueError:
        return None


def reservation_for_dept(reservation_tables: list[dict], dept_name: str) -> dict[str, int | None]:
    """If any reservation table mentions the department, pull its row."""
    cats = ["UR", "SC", "ST", "OBC", "EWS", "PwBD"]
    blank = {c: None for c in cats}
    if not reservation_tables or not dept_name:
        return blank
    dept_low = _norm(dept_name)
    for table in reservation_tables:
        cols = [_norm(c) for c in table["columns"]]
        # Find the dept-name column (often unnamed / "Department")
        dept_col = None
        for i, c in enumerate(cols):
            if c in {"department", "academic unit", "discipline", "position", ""}:
                dept_col = i
                break
        if dept_col is None:
            dept_col = 0   # last-resort: first column
        for row in table["rows"]:
            if dept_col >= len(row):
                continue
            row_dept = _norm(row[dept_col])
            if not row_dept:
                continue
            if dept_low in row_dept or row_dept in dept_low:
                breakdown = dict(blank)
                for cat in cats:
                    idx = next((i for i, c in enumerate(cols) if c == cat.lower()), None)
                    if idx is not None and idx < len(row):
                        breakdown[cat] = parse_int(row[idx])
                return breakdown
    return blank


def extract_from_parsed(parsed: dict) -> dict:
    sections = parsed["sections"]
    tables = [s for s in sections if s["type"] == "table"]
    main_tables_raw = [t for t in tables if is_main_table(t["columns"])]
    res_tables = [t for t in tables if is_reservation_table(t["columns"])]
    main_tables = merge_table_fragments(main_tables_raw)

    positions: list[dict] = []
    for table in main_tables:
        cols = table["columns"]
        dept_idx = col_index(cols, DEPT_COLS)
        areas_idx = col_index(cols, AREAS_COLS)
        crit_idx = col_index(cols, CRITERIA_COLS)
        posts_idx = next((i for i, c in enumerate(cols) if "post" in _norm(c) or "vacanc" in _norm(c)), None)
        for row in table["rows"]:
            if dept_idx is None or areas_idx is None:
                continue
            dept_raw = row[dept_idx] if dept_idx < len(row) else ""
            areas_raw = row[areas_idx] if areas_idx < len(row) else ""
            crit_raw = row[crit_idx] if (crit_idx is not None and crit_idx < len(row)) else ""
            dept = _clean(dept_raw)
            if not dept or len(dept) < 3:
                continue
            blocks = split_areas_cell(areas_raw)
            for sub_name, body in blocks:
                disc = sub_name or dept   # fall back to dept when no sub-discipline header
                positions.append({
                    "department": dept,
                    "discipline": disc,
                    "areas_text": body,
                    "qualifications_text": _clean(crit_raw) or None,
                    "reservation_breakdown": reservation_for_dept(res_tables, dept),
                    "number_of_posts": parse_int(row[posts_idx]) if posts_idx is not None and posts_idx < len(row) else None,
                    "raw_section_text": (f"{dept} — {disc}: {body}" if sub_name else f"{dept}: {body}")[:1500],
                    "extraction_confidence": 0.85 if sub_name else 0.65,
                })
    return {
        "pdf_filename": parsed["pdf_filename"],
        "extracted_at": datetime.now(timezone.utc).isoformat(),
        "extraction_method": "structured-walker-v1",
        "positions": positions,
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--limit", type=int, default=None)
    parser.add_argument("--pdf", type=str, default=None,
                        help="Process a single named PDF (.json filename in corpus/parsed/)")
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args()

    if not PARSED_DIR.exists():
        print(f"ERROR: {PARSED_DIR} not found — run scripts/parse_pdf_structured.py first",
              file=sys.stderr)
        return 1
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    files = sorted(PARSED_DIR.glob("*.json"))
    if args.pdf:
        files = [PARSED_DIR / (args.pdf if args.pdf.endswith(".json") else args.pdf + ".json")]
        if not files[0].exists():
            print(f"ERROR: {files[0]} not found", file=sys.stderr)
            return 1
    if args.limit:
        files = files[: args.limit]

    print(f"extracting positions from {len(files)} parsed PDF(s)")
    ok = err = skipped = 0
    pos_total = 0
    for f in files:
        out_path = OUT_DIR / f.name
        if out_path.exists() and not args.force:
            skipped += 1
            continue
        try:
            parsed = json.loads(f.read_text())
            extracted = extract_from_parsed(parsed)
            n = len(extracted["positions"])
            out_path.write_text(json.dumps(extracted, indent=2, ensure_ascii=False) + "\n")
            ok += 1
            pos_total += n
            print(f"  ✓ {f.name}  ({n} positions)")
        except Exception as e:
            err += 1
            print(f"  ✗ {f.name}  — {type(e).__name__}: {e}", file=sys.stderr)

    print(f"\nextracted: {ok}  skipped: {skipped}  failed: {err}  positions: {pos_total}")
    return 0 if err == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
