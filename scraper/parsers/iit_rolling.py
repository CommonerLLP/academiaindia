"""Generic parser for IIT-style rolling-advertisement listing pages.

Targets institutions that publish a single PDF "Areas of Specialization" + an
optional "Eligibility Criteria" PDF linked from the listing page. Examples:
  - IIT Bombay: /career/apply or /job-vacancy-ad/rolling-advertisement-...
  - IIT Delhi : /jobs-iitd/index.html
  - IIT Madras: facapp.iitm.ac.in

The parser discovers the most recent rolling-ad PDF, splits it into per-unit
blocks, and emits one JobAd per academic unit that the HSS classifier might
plausibly match. We don't try to filter aggressively here — the dashboard's
classifier handles that — we just promote each unit to a structured ad record
with `department`, `discipline`, `raw_text_excerpt`, deadline, and apply-URL
populated.
"""

from __future__ import annotations

import re
from datetime import date, datetime
from pathlib import Path
from typing import Optional
from urllib.parse import urljoin

from bs4 import BeautifulSoup

from pdf_extractor import (
    download_pdf,
    extract_text,
    extract_text_flow,
    find_category_breakdown,
    find_deadline,
    find_general_eligibility,
    find_publications,
    find_reservation_note,
    split_into_units,
    split_into_units_flow,
    UnitBlock,
)
from schema import JobAd, PostType, ContractStatus, CategoryBreakdown


# Per-domain hints that tell us which PDFs on the listing page to fetch and
# where the application portal lives. These are concrete because each IIT
# titles its PDFs differently — but the list is short.
SITE_HINTS = {
    "iitb.ac.in": {
        "areas_pdf": [
            re.compile(r"areas?\s+of\s+specia(li[zs]ation)?", re.I),
        ],
        "eligibility_pdf": [
            re.compile(r"eligibility\s+criteria", re.I),
        ],
        "apply_url": "https://portal.iitb.ac.in/FR/index.php/FAC/FR26/user/account",
        "info_url_keep_path": True,
    },
    "iitd.ac.in": {
        # AP-1 first (Assistant Professor opening — most relevant to early-
        # career applicants). The "AP-?\d" pattern catches the canonical AP
        # PDFs even when filenames have typos like "Rollling" (3 L's). PROF-1
        # is a fallback if AP isn't published.
        "areas_pdf": [
            re.compile(r"AP-?\d", re.I),
            re.compile(r"PROF-?\d", re.I),
        ],
        "eligibility_pdf": [],
        "apply_url": "https://ecampus.iitd.ac.in/IITDFR-0/login",
        "info_url_keep_path": True,
    },
    "iitm.ac.in": {
        # Use the cover Advertisement_RA PDF as the "human-readable" original
        # link (it's the user-facing call letter). The Area_and_Qualification
        # annexure has the per-unit detail but its two-column layout doesn't
        # extract cleanly with -layout — for IITM we therefore also pull a
        # reading-order pass of the SAME PDF and use that for excerpts.
        "areas_pdf": [
            re.compile(r"area_and_qualification", re.I),
            re.compile(r"advertisement[_ -]?ra", re.I),
        ],
        "eligibility_pdf": [],
        "apply_url": "https://facapp.iitm.ac.in/2026ra",
        "info_url_keep_path": True,
        # When set, the parser extracts a reading-order text from the same
        # areas PDF and uses split_into_units_flow to build cleaner per-unit
        # excerpts (column-mash workaround).
        "use_flow_excerpts": True,
        # Override `original_url` on emitted ads to point at this human-readable
        # cover PDF instead of the technical annexure.
        "human_pdf_url": "https://facapp.iitm.ac.in/img/Advertisement_RA-2026.pdf",
    },
}


def _find_pdfs(soup: BeautifulSoup, base_url: str, patterns: list[re.Pattern]) -> list[str]:
    """Return absolute PDF URLs from `<a>` tags whose href OR anchor-text
    matches any of `patterns`. Both surfaces matter: IIT-D files PDFs by
    descriptive filename (the href carries the signal), IIT-B uses opaque
    UUIDs (the anchor text is what we need to match).

    Document order is preserved (BeautifulSoup `find_all` returns in DOM
    order) and duplicates are dropped — the same PDF often shows up twice
    in modal dialogs and inline list views.
    """
    out: list[str] = []
    for a in soup.find_all("a", href=True):
        href = a["href"]
        if not href.lower().endswith(".pdf") and ".pdf" not in href.lower():
            continue
        haystack = f"{href} {a.get_text(' ', strip=True)}"
        if any(p.search(haystack) for p in patterns):
            out.append(urljoin(base_url, href))
    # Preserve order, drop duplicates
    seen, dedup = set(), []
    for u in out:
        if u in seen:
            continue
        seen.add(u)
        dedup.append(u)
    return dedup


def _site_key(url: str) -> Optional[str]:
    """Map a fetched URL to its `SITE_HINTS` entry by hostname-substring.

    A substring check (rather than exact-host match) is intentional: IIT
    Bombay uses both `iitb.ac.in` and `www.iitb.ac.in`, IIT Madras uses
    `facapp.iitm.ac.in` (not `www.iitm.ac.in`), and the fallback-PDF code
    path passes us a raw PDF URL on the same hostnames. All three forms
    should resolve to the same hint key.
    """
    for k in SITE_HINTS:
        if k in url:
            return k
    return None


# Keywords that promote a unit to a worth-emitting ad. We're permissive: the
# dashboard classifier will winnow further. Rationale: it's better to emit too
# many ambiguous-tagged ads than to silently drop an HSS unit.
EMIT_KEYWORDS = re.compile(
    r"\b(humanit|social\s+science|sociolog|anthropolog|policy|design|"
    r"educational?\s+tech|technology\s+alternatives|rural|media|"
    r"learning\s+sciences|cultural|liberal\s+arts|develop)",
    re.I,
)


def _try_parse_html_deadline(html: str) -> Optional[date]:
    """IIT Bombay's listing page exposes 'Application Last Date Thu, 31/12/2026'
    in the page metadata. Strip HTML first so the date isn't masked by markup.
    """
    plain = re.sub(r"<[^>]+>", " ", html)
    plain = re.sub(r"\s+", " ", plain)
    m = re.search(r"(?:Application\s+)?Last Date[^.]{0,80}?(\d{1,2}/\d{1,2}/\d{4})", plain, re.I)
    if not m:
        m = re.search(r"on or before\s+([A-Z][a-z]+\s+\d{1,2},\s+\d{4})", plain, re.I)
        if m:
            try:
                return datetime.strptime(m.group(1), "%B %d, %Y").date()
            except ValueError:
                return None
        return None
    try:
        d, mo, y = m.group(1).split("/")
        return date(int(y), int(mo), int(d))
    except Exception:
        return None


def _parse_pdf_deadline(text: str) -> Optional[date]:
    """Run `find_deadline` on the PDF body text, then parse the captured
    string into a `date`. Returns None if no deadline is found OR if the
    captured string doesn't match any of our known formats — null-vs-bad
    date is treated identically by the dashboard (rolling/unknown).

    The format list mirrors `_parse_iso` in `iim_recruit.py`; we'd
    consolidate but keeping each parser independently importable matters
    more than DRY here.
    """
    raw = find_deadline(text)
    if not raw:
        return None
    raw = raw.strip().rstrip(".")
    for fmt in ("%B %d, %Y", "%b %d, %Y", "%d/%m/%Y", "%d-%m-%Y", "%d.%m.%Y"):
        try:
            return datetime.strptime(raw, fmt).date()
        except ValueError:
            pass
    return None


# For HSS / Liberal-Arts / Management-style mega-units, the body lists each
# advertised sub-discipline with a label of the form `^<Area>:`. Splitting
# those out as separate ads is what makes the dashboard's classifier flag
# Sociology and Technology-in-Society distinctly from Economics (which the
# user excludes). Areas of length 1-3 words, capitalised, ending in `:`.
SUBAREA_RE = re.compile(
    r"(?:^|\n)\s*(?P<name>[A-Z][A-Za-z][A-Za-z\- ]{2,45}?):\s+",
    re.MULTILINE,
)

# Unit name patterns that should trigger sub-area splitting. We're conservative
# — only apply to mega-units that are known to bundle multiple disciplines.
SPLIT_UNITS_RE = re.compile(
    # No trailing \b on "humanit" — the actual unit name has "Humanities" so the
    # word continues past `t` into `ies`, which would fail a literal word-boundary.
    r"\b(humanit\w*|social\s+science|liberal\s+arts|interdisciplina\w*\s+studies)",
    re.I,
)


def _split_subareas(unit: UnitBlock) -> list[tuple[str, str]]:
    """Split a multi-discipline unit body into (subarea_name, subarea_text) pairs.

    Returns an empty list if the body doesn't have detectable sub-area markers,
    in which case callers should emit a single combined ad as a fallback.
    """
    text = unit.text
    matches = list(SUBAREA_RE.finditer(text))
    if len(matches) < 2:
        return []
    out: list[tuple[str, str]] = []
    for i, m in enumerate(matches):
        name = m.group("name").strip()
        # Drop obviously-non-area headers (sections like "Eligibility:")
        if re.search(r"\b(eligibility|publication|qualification|note|annexure|page)\b", name, re.I):
            continue
        body_start = m.end()
        body_end = matches[i + 1].start() if i + 1 < len(matches) else len(text)
        body = text[body_start:body_end].strip()
        if len(body) < 40:
            continue
        out.append((name, body))
    return out


def _extract_columns(unit: UnitBlock) -> tuple[str, str]:
    """Split a rolling-ad unit block into its (Areas, Criteria) columns.

    The PDF layout is a 4-column table — S.No | Unit name | Areas |
    Additional Criteria. pdftotext preserves the column alignment as
    horizontal-whitespace gaps (≥2 spaces between cells), but its
    reading order traverses each row of the table left-to-right, so
    a flat join of the unit-block text mashes Areas + Criteria
    together row-by-row ("e. Machine Learning in Mechanics minimum
    of 4 papers…").

    Strategy: read column boundaries off the unit-header line as
    character positions, then for every line slice
    `line[col3_start:col4_start]` for the Areas column and
    `line[col4_start:]` for the Criteria column. Each row of the
    layout becomes one line in the per-column text, with row order
    preserved. Continuation lines (cells that wrap inside a single
    column) survive intact because they're a substring of the same
    horizontal slice.

    Returns ("", "") when the layout is too sparse to split (e.g.
    a unit whose header line carries only S.No + Unit name with no
    Areas/Criteria cells). Caller falls back to the row-major
    `_short_excerpt` in that case.
    """
    lines = unit.text.split("\n")

    # Find the header line — the one containing the unit_num as the
    # first non-whitespace token. (Could be the very first line of
    # unit.text, but defensively we scan the first few lines in case
    # the splitter included a trailing form-feed remainder.)
    header_idx = -1
    header_line = ""
    for idx, line in enumerate(lines[:3]):
        m = re.match(r"^\s*(\d+)\b", line)
        if m and int(m.group(1)) == unit.unit_num:
            header_idx = idx
            header_line = line
            break
    if header_idx < 0:
        return "", ""

    # Find each cell's start position on the header line by walking
    # the run-of-2-or-more-whitespace separators.
    cells: list[tuple[int, str]] = []
    pos = 0
    for piece in re.split(r"(\s{2,})", header_line):
        if not piece:
            pos += 0
            continue
        if piece.strip():
            cells.append((pos, piece))
        pos += len(piece)

    # Cells 0/1 are S.No / Unit name. The Criteria column starts at the
    # LAST cell on the header line (it carries the section-label like
    # "Publication Record:" / "Publications:" / "Academic Background:").
    # Everything between Unit-name and the last cell belongs to the Areas
    # column. The naive "Areas = cell 2" heuristic fails when Areas is
    # itself split into a letter-prefix sub-column ("a.") and an area-name
    # sub-column ("Design and Optimization") — both belong to logical
    # Col-3 and slicing them apart breaks the layout reconstruction.
    if len(cells) < 3:
        return "", ""

    # Special case: the header line collapses col-2 (unit name) and col-3
    # (first area) into one cell because pdftotext didn't put a 2+ space
    # gap between them. That happens to IITD's Electrical (where col-3's
    # first sub-area-header "Communication Engineering:" is one space
    # away from col-2's "Department Of Electrical") and to Yardi's row.
    # Detect: cells[1] is much longer than expected (>40 chars) and
    # contains a section-style ":" mid-cell — split cells[1] there.
    name_cell_pos, name_cell_text = cells[1]
    if len(name_cell_text) > 40:
        # Look for "<words>:<space>" or "<words>:<end>" inside the name
        # cell — likely a sub-area header smushed in.
        m = re.search(r":\s+(?=[A-Z])|:$", name_cell_text)
        if m:
            split_at = m.end()
            unit_part = name_cell_text[:split_at].rstrip()
            areas_part = name_cell_text[split_at:].lstrip()
            new_pos = name_cell_pos + len(unit_part) + (
                len(name_cell_text) - len(name_cell_text.rstrip())
            )
            # Replace cells[1] with two cells: unit-name + collapsed-area.
            cells = (
                [cells[0], (name_cell_pos, unit_part)]
                + ([(new_pos, areas_part)] if areas_part else [])
                + cells[2:]
            )

    col3_start = cells[2][0]
    col4_start = cells[-1][0] if len(cells) >= 4 else None
    # Sanity: Criteria must sit reasonably far from where Areas starts.
    # Otherwise treat the whole right side as one column (Areas-only).
    if col4_start is not None and col4_start - col3_start < 10:
        col4_start = None

    areas_lines: list[str] = []
    criteria_lines: list[str] = []
    for line in lines:
        if not line.strip():
            areas_lines.append("")
            criteria_lines.append("")
            continue
        a, c = _classify_line(line, col3_start, col4_start)
        if a:
            areas_lines.append(a)
        if c:
            criteria_lines.append(c)

    areas_text = "\n".join(areas_lines).strip()
    criteria_text = "\n".join(criteria_lines).strip()

    # Sanity check — when pdftotext collapses col-2 (unit name) and col-3
    # (first sub-area header) into one cell because the gap between them
    # is < 2 spaces (IITD's Electrical Engineering and Yardi-AI rows do
    # this), the column anchors are wrong and the extracted Areas ends up
    # carrying Criteria-section content. Detect: if Areas begins with a
    # criteria-section header keyword and Criteria is empty, the
    # extraction has misclassified — return ("", "") so the caller falls
    # back to the row-major path.
    if areas_text and not criteria_text:
        first = areas_text.lstrip()[:60].lower()
        criteria_starters = (
            "academic background", "publication record", "publications:",
            "publications and ph", "other:", "other additional",
        )
        if any(first.startswith(s) for s in criteria_starters):
            return "", ""

    return areas_text, criteria_text


def _classify_line(line: str, col3_start: int, col4_start: int | None,
                   tolerance: int = 15) -> tuple[str, str]:
    """Split a single line of layout-extracted text into (Areas, Criteria).

    pdftotext approximates pixel positions with character spaces, but the
    alignment shifts row-to-row by ±1–5 chars depending on cell content.
    A fixed character anchor taken from the header line is too brittle.
    This function detects each line's column boundaries from the line
    itself, by classifying every whitespace gap (run of ≥3 spaces) as
    either the col-2/col-3 boundary or the col-3/col-4 boundary based
    on which header anchor it's nearer to.

    A line can have:
    - No gaps: single-cell line. Assign by content start position.
    - Only a col-2/col-3 gap: name-continuation on the left, Areas on
      the right (no Criteria content this row).
    - Only a col-3/col-4 gap: Areas on the left, Criteria on the right.
    - Both: name-continuation, Areas, Criteria — three slices.
    """
    if not line.strip():
        return "", ""

    gaps = list(re.finditer(r"\s{3,}", line))

    # Classify each gap.
    col3_gap: re.Match | None = None
    col4_gap: re.Match | None = None
    for g in gaps:
        # The gap's right edge is where the next column begins.
        edge = g.end()
        d3 = abs(edge - col3_start)
        d4 = abs(edge - col4_start) if col4_start is not None else 1e9
        # A gap is the col-3/col-4 boundary if it's closer to col4_start
        # than to col3_start (and within tolerance of col4_start).
        if d4 <= tolerance and d4 < d3:
            if col4_gap is None or d4 < abs(col4_gap.end() - col4_start):
                col4_gap = g
        elif d3 <= tolerance:
            if col3_gap is None or d3 < abs(col3_gap.end() - col3_start):
                col3_gap = g

    # Slice based on which boundaries are present.
    if col3_gap is not None and col4_gap is not None:
        areas = line[col3_gap.end():col4_gap.start()].strip()
        criteria = line[col4_gap.end():].strip()
        return areas, criteria
    if col3_gap is not None:
        # Name-continuation on the left; Areas extends to end of line.
        areas = line[col3_gap.end():].strip()
        return areas, ""
    if col4_gap is not None:
        # No name-continuation. Areas starts at line content start;
        # Criteria starts after the gap.
        areas = line[:col4_gap.start()].strip()
        criteria = line[col4_gap.end():].strip()
        # If areas content begins before col-3 anchor, the line is
        # actually a Criteria-only line whose left-side content sits in
        # col-2 (impossible in IITD layouts but defensive). Drop areas.
        line_content_start = len(line) - len(line.lstrip())
        if line_content_start < col3_start - tolerance:
            areas = ""
        return areas, criteria

    # No classified gaps — single-cell line. Assign by content start.
    content_start = len(line) - len(line.lstrip())
    text_only = line.lstrip().rstrip()
    if col4_start is not None and content_start >= col4_start - tolerance:
        return "", text_only
    if content_start >= col3_start - tolerance:
        return text_only, ""
    return "", ""


def _short_excerpt(unit: UnitBlock, max_chars: int = 3500) -> str:
    """Return a clean excerpt of the unit's areas + eligibility text.

    First tries `_extract_columns` to slice the layout's Col-3 (Areas)
    and Col-4 (Criteria) by character position, then formats the joined
    Areas-then-Criteria stream with a blank-line separator between the
    two columns and one line per row. This is what stops the row-by-row
    mashing where pdftotext's reading-order produces strings like
    "e. Machine Learning in Mechanics minimum of 4 papers…" — Areas and
    Criteria become two stacked paragraphs instead of one interleaved
    line.

    Falls back to row-major cell-stripping when the layout is too sparse
    for column-extraction (e.g. units with only S.No + Unit name on the
    header line and content beginning on line 1).

    The 3500-char default is large enough that IIT Delhi's HSS unit
    (which bundles Sociology / STS / Psychology / Lit subareas) keeps
    all keywords visible to the dashboard's HSS classifier without
    truncation.
    """
    # Column-aware path. _extract_columns() classifies each whitespace
    # gap on each line as either the col-2/col-3 boundary or the
    # col-3/col-4 boundary, slicing accordingly. When it succeeds (most
    # IITD units), Areas and Criteria render as two separate paragraphs
    # rather than the row-by-row interleave pdftotext produces. When it
    # detects collapsed-header units (where the column anchors are
    # unreliable), it returns ("", "") and we fall back to row-major
    # cell-stripping below. See docs/PARSER-ARCHITECTURE.md §3.4.
    areas, criteria = _extract_columns(unit)
    if areas and criteria:
        joined = areas + "\n\n" + criteria
        if len(joined) > max_chars:
            joined = joined[:max_chars].rsplit(" ", 1)[0] + "…"
        return joined
    if areas and not criteria:
        if len(areas) > max_chars:
            areas = areas[:max_chars].rsplit(" ", 1)[0] + "…"
        return areas

    # Row-major fallback for units where column extraction couldn't
    # find clean boundaries (Yardi-AI's collapsed header, Electrical's
    # ":"-mashed unit-name). Same logic as before; no regression.
    name_words = set(unit.unit_name.split())
    out: list[str] = []
    first_line = True
    for line in unit.text.splitlines():
        cells = [c for c in re.split(r"\s{2,}", line) if c]
        if not cells:
            continue
        if first_line:
            # Drop the S.No cell (matches unit_num) and the unit-name
            # cell (cell whose words are all part of the unit_name).
            kept: list[str] = []
            dropped_num = False
            dropped_name = False
            for c in cells:
                if not dropped_num and c.strip() == str(unit.unit_num):
                    dropped_num = True
                    continue
                if not dropped_name and c.split() and all(w in name_words for w in c.split()):
                    dropped_name = True
                    continue
                kept.append(c)
            out.append(" ".join(kept))
            first_line = False
        else:
            # Subsequent lines may begin with unit-name continuation
            # cells (e.g. "Chemistry" on the second line of a wrapped
            # "Department Of Chemistry"). Drop leading cells that are
            # purely unit-name words; once a real content cell appears,
            # stop dropping for the rest of the line.
            kept = []
            dropping = True
            for c in cells:
                if dropping and c.split() and all(w in name_words for w in c.split()):
                    continue
                dropping = False
                kept.append(c)
            out.append(" ".join(kept))

    joined = re.sub(r"\s+", " ", " ".join(out)).strip()
    if len(joined) > max_chars:
        joined = joined[:max_chars].rsplit(" ", 1)[0] + "…"
    return joined


def _stable_id(institution_id: str, ad_number: str, unit_num: int, unit_name: str) -> str:
    """Per-unit deterministic hash. Same inputs → same id across runs, so
    a unit doesn't get a new id just because we re-scraped. Local copy of
    the project-wide `stable_id` to avoid an import cycle from `run.py`.
    """
    import hashlib
    m = hashlib.sha256()
    for p in (institution_id, ad_number, str(unit_num), unit_name):
        m.update(p.encode("utf-8"))
        m.update(b"\x00")
    return m.hexdigest()[:16]


def parse(html: str, url: str, fetched_at: datetime) -> list[JobAd]:
    """Top-level parser entry point called by the orchestrator.

    Pipeline (per IIT, in order):

      1. **Site identification** — match `url` against `SITE_HINTS` to pick
         the right per-domain rules (PDF-name regex, apply URL, etc.).
      2. **PDF discovery** — find the most relevant rolling-ad PDF on the
         listing page. When `run.py` invokes us via the `fallback_pdf_url`
         path, this stage is skipped: the URL we get is the PDF itself.
      3. **Cache + extract** — download (with TTL) and pdftotext extraction.
      4. **Unit-block split** — break the PDF into one block per academic
         unit (`split_into_units`). For institutions where layout extraction
         column-mashes the body (IIT-Madras), additionally pull a reading-
         order pass via `extract_text_flow` and slice it by unit name.
      5. **Per-unit emission** — for each block, build a JobAd dict. HSS /
         Liberal-Arts / Interdisciplinary mega-units further split into
         sub-area ads (Sociology / STS / Lit show up as separate cards).
      6. **Deadline + ad-number** — pulled from HTML metadata first, falling
         back to PDF body text.

    Returns a list of dicts (not Pydantic JobAd instances — the inner
    `_make_ad` returns the schema's `model_dump()` plus parser-attached
    extras). Empty list = nothing parsed, which the orchestrator handles
    via its stub/carry-forward fallback chain.
    """
    site = _site_key(url)
    if not site:
        return []
    hints = SITE_HINTS[site]

    # Direct-PDF fallback: when run.py couldn't fetch the listing page (e.g.
    # facapp.iitm.ac.in is down) and routes us to a `fallback_pdf_url` in the
    # registry, the URL we receive is the PDF itself, not an HTML page.
    if url.lower().endswith(".pdf") or not html:
        areas_url = url
        elig_url = None
    else:
        soup = BeautifulSoup(html, "html.parser")
        # Try each pattern in order; first hit wins (lets us prioritise specific
        # PDFs like "Area_and_Qualification" over generic "Advertisement_RA").
        areas_url = None
        for pat in hints["areas_pdf"]:
            urls = _find_pdfs(soup, url, [pat])
            if urls:
                areas_url = urls[0]
                break
        if not areas_url:
            return []
        elig_urls = _find_pdfs(soup, url, hints["eligibility_pdf"]) if hints.get("eligibility_pdf") else []
        elig_url = elig_urls[0] if elig_urls else None

    # Cache PDFs in the project's .cache/pdfs directory so reruns are cheap.
    cache_root = Path(__file__).resolve().parents[2] / ".cache" / "pdfs"
    areas_path = download_pdf(areas_url, cache_root)
    if not areas_path:
        return []
    areas_text = extract_text(areas_path)
    if not areas_text:
        return []

    elig_text: Optional[str] = None
    if elig_url:
        ep = download_pdf(elig_url, cache_root)
        if ep:
            elig_text = extract_text(ep)

    blocks = split_into_units(areas_text)
    elig_blocks_by_num: dict[int, UnitBlock] = {}
    if elig_text:
        for b in split_into_units(elig_text):
            elig_blocks_by_num[b.unit_num] = b

    # Reading-order excerpts: when the layout-based body text is column-mashed
    # (IIT Madras), pull a non-layout extract of the same PDF and slice it by
    # the clean unit-name list we already have.
    flow_excerpts: dict[str, str] = {}
    if hints.get("use_flow_excerpts") and blocks:
        flow_text = extract_text_flow(areas_path)
        if flow_text:
            flow_excerpts = split_into_units_flow(
                flow_text, [b.unit_name for b in blocks]
            )

    # Institute-wide metadata: extract once per PDF and attach to every ad.
    # `reservation_note` is the CEI(RTC) Act 2019 percentage spread (SC-15%
    # ST-7.5% OBC(NCL)-27% EWS-10% PwBD-4%). `general_eligibility` is the
    # PhD-and-experience preamble. Both apply across every unit emitted from
    # this PDF, so we compute once and thread through.
    reservation_note = find_reservation_note(areas_text)
    general_eligibility = find_general_eligibility(areas_text)

    # Deadline: prefer HTML metadata, fall back to PDF text.
    closing = _try_parse_html_deadline(html) or _parse_pdf_deadline(areas_text)
    # ad_number: pull "Advertisement No. <X>" from the page or PDF heading.
    adno_m = re.search(
        r"Advertisement No\.?\s*([A-Z0-9./\-]+)|Rolling Advertisement No\.?\s*([A-Z0-9./\-]+)",
        html + "\n" + areas_text, re.I,
    )
    ad_number = (adno_m.group(1) or adno_m.group(2)) if adno_m else None

    institution_id = "__placeholder__"  # the orchestrator will substitute the registry id

    # If the site provides a human-readable cover PDF (IITM), point users at
    # that rather than the technical annexure for "Original PDF →".
    public_pdf_url = hints.get("human_pdf_url") or areas_url

    def _make_ad(unit_num: int, key: str, title: str, department: str,
                 discipline: str, excerpt: str, publications: Optional[str],
                 elig_extract: Optional[str],
                 category_breakdown_dict: Optional[dict] = None) -> dict:
        """Build one JobAd dict, closing over per-PDF context (institution_id,
        ad_number, closing date, public PDF URL).

        Why a closure rather than a top-level helper: the per-PDF context
        is captured once per call to `parse()` — every emitted ad shares
        the same closing_date, ad_number, and apply_url. Threading those
        through as parameters every time would be noisy.

        We construct a `JobAd` Pydantic instance for validation, then
        `model_dump()` to a dict and patch in the parser-attached extras
        (`apply_url`, `info_url`, `_pdf_parsed`, `annexure_pdf_url`). This
        is the pre-`ad_factory.py` style; the factory handles the patching
        in one place but migrating this parser to it is a separate
        deliberate change.
        """
        ad = JobAd(
            id=_stable_id(institution_id, ad_number or "rolling", unit_num, key),
            institution_id=institution_id,
            ad_number=ad_number,
            title=title,
            department=department,
            discipline=discipline,
            post_type=PostType.Faculty,
            contract_status=ContractStatus.TenureTrack,
            category_breakdown=CategoryBreakdown(**(category_breakdown_dict or {})),
            number_of_posts=None,
            pay_scale=None,
            publication_date=None,
            closing_date=closing,
            original_url=public_pdf_url,
            snapshot_fetched_at=fetched_at,
            parse_confidence=0.7,
            raw_text_excerpt=excerpt,
        )
        d = ad.model_dump()
        d["apply_url"] = hints["apply_url"]
        d["info_url"] = url
        d["publications_required"] = publications
        d["unit_eligibility"] = elig_extract
        # Institute-wide context attached to every ad emitted from this PDF.
        # The dashboard surfaces these inside the "Eligibility & how to apply"
        # disclosure on each card.
        d["reservation_note"] = reservation_note
        d["general_eligibility"] = general_eligibility
        d["_pdf_parsed"] = True
        # If we substituted a human-readable cover PDF for original_url, keep
        # the technical annexure URL accessible so users can still reach it.
        if hints.get("human_pdf_url") and areas_url != public_pdf_url:
            d["annexure_pdf_url"] = areas_url
        return d

    out: list[dict] = []
    for b in blocks:
        elig_block = elig_blocks_by_num.get(b.unit_num)
        publications = (
            find_publications(elig_block.text) if elig_block else find_publications(b.text)
        )
        elig_extract = (
            re.sub(r"\s+", " ", elig_block.text.splitlines()[1:][0:30][0]).strip()
            if (elig_block and len(elig_block.text.splitlines()) > 1)
            else None
        )
        # Per-unit reservation roster — only fires when the PDF actually
        # publishes per-position counts (UR-2 SC-1 ST-1 OBC-3 EWS-1 …). Most
        # IIT rolling ads don't, so this stays None for them; that's fine —
        # the dashboard renders pills *only* when this dict is populated.
        unit_breakdown = (
            find_category_breakdown(elig_block.text) if elig_block
            else find_category_breakdown(b.text)
        )

        # If this is a mega-unit (HSS, Liberal Arts, Interdisciplinary), try
        # to split the body into per-discipline sub-area ads. That's how we
        # get "Sociology" / "Technology-in-Society" surfaced separately from
        # "Economics" inside IIT-D's Department of Humanities & Social Sciences.
        sub_ads_emitted = False
        if SPLIT_UNITS_RE.search(b.unit_name):
            subareas = _split_subareas(b)
            if subareas:
                for sub_name, sub_text in subareas:
                    sub_excerpt = re.sub(r"\s+", " ", sub_text).strip()
                    if len(sub_excerpt) > 3500:
                        sub_excerpt = sub_excerpt[:3500].rsplit(" ", 1)[0] + "…"
                    out.append(_make_ad(
                        unit_num=b.unit_num,
                        key=f"{b.unit_name}:{sub_name}",
                        title=f"Faculty — {b.unit_name} — {sub_name}",
                        department=b.unit_name,
                        discipline=sub_name,
                        excerpt=sub_excerpt,
                        publications=publications,
                        elig_extract=elig_extract,
                        category_breakdown_dict=unit_breakdown,
                    ))
                sub_ads_emitted = True

        if not sub_ads_emitted:
            # Prefer the reading-order excerpt when available (cleaner for IITM).
            flow = flow_excerpts.get(b.unit_name)
            if flow and len(flow.strip()) > 80:
                excerpt = re.sub(r"\s+", " ", flow).strip()
                if len(excerpt) > 3500:
                    excerpt = excerpt[:3500].rsplit(" ", 1)[0] + "…"
            elif hints.get("use_flow_excerpts"):
                # IITM and similar: PDF layout is multi-column with multi-line
                # cells that pdftotext can't unmash. Rather than ship gibberish,
                # tell the user explicitly that detail is in the linked PDF.
                excerpt = (
                    "Per-department specialization areas are listed in the "
                    "institutional annexure (linked as Original PDF). "
                    "Automated extraction of this PDF's multi-column layout "
                    "produces unreliable text — please read the source directly."
                )
            else:
                excerpt = _short_excerpt(b)
            out.append(_make_ad(
                unit_num=b.unit_num,
                key=b.unit_name,
                title=f"Faculty — {b.unit_name}",
                department=b.unit_name,
                discipline=b.unit_name,
                excerpt=excerpt,
                publications=publications,
                elig_extract=elig_extract,
                category_breakdown_dict=unit_breakdown,
            ))
    return out
