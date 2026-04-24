"""ingest_pdf.py — parse an institutional-advertisement PDF into structured JobAd records.

Usage:
    python scraper/ingest_pdf.py --pdf path/to/ad.pdf --institution iit-delhi
    python scraper/ingest_pdf.py --pdf path/to/ad.pdf --institution iit-delhi --merge

Design
- We run PDFs through pdfplumber, then apply institution-specific extractors
  where we have them; otherwise fall back to a generic extractor that pulls
  metadata from the first page (advertisement number, date, deadline) and
  treats the whole PDF as ONE record.
- Institution-specific extractors (currently: iitd_rolling_ap) can emit MULTIPLE
  records from a single PDF — e.g. the IITD rolling advertisement bundles
  21 departments; we emit one record per department, and one record per HSS
  sub-area (Economics / Literature / Technology-in-Society / Sociology / Psychology).
- --merge: read existing data/current.json, append new records, dedupe by ad_id,
  write back. Without --merge, replaces current.json.
- Every emitted record keeps a raw_text_excerpt so you can sanity-check the parse
  against the PDF by eye.

Extractors you add here should live in scraper/ingesters/<name>.py and export
`extract(pdf_path: Path, pdf_text: str, pages: list[str]) -> list[JobAd]`.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

# pdfplumber is required; install with `pip install pdfplumber`
try:
    import pdfplumber  # type: ignore
except ImportError:
    print("ERROR: pdfplumber not installed. Run: pip install pdfplumber", file=sys.stderr)
    sys.exit(1)

# Make scraper/ importable so that `from schema import ...` works regardless of
# whether this file is run from the project root or from scraper/.
HERE = Path(__file__).resolve().parent
REPO_ROOT = HERE.parent
if str(HERE) not in sys.path:
    sys.path.insert(0, str(HERE))


def _pdf_url(pdf_path: Path) -> str:
    """Return a repo-root-relative path so the dashboard can serve it via HTTP.
    Falls back to an absolute file:// URL if the PDF is outside the repo."""
    try:
        return str(pdf_path.resolve().relative_to(REPO_ROOT))
    except ValueError:
        return _pdf_url(pdf_path)

from schema import JobAd, PostType, ContractStatus, CategoryBreakdown  # noqa: E402


def stable_id(*parts: str) -> str:
    m = hashlib.sha256()
    for p in parts:
        m.update((p or "").encode("utf-8"))
        m.update(b"\x00")
    return m.hexdigest()[:16]


# ---------- institution-specific extractors ----------

def _extract_iitd_rolling_ap(pdf_path: Path, text: str, pages: list[str], fetched_at: datetime) -> list[JobAd]:
    """IITD Rolling Advertisement (AP-1) extractor.

    The 2026 AP-1 PDF has the structure:
      Page 1: header with 'Rolling Advertisement No. IITD/2026/AP-1 Dated 23.4.2026',
              department table (21 units), reservation schedule
      Page 2-6: general terms (submission, pay, benefits, additional info)
      Page 7-23: Annexure-1 — per-department areas and additional shortlisting criteria
      Page 24: Annexure-II (PwBD)
      Page 25-28: Annexure-III (HSS-specific equivalences and publisher list)
    """
    ads: list[JobAd] = []

    # ---- master-ad metadata from the front matter
    ad_number = None
    ad_date = None
    closing_date = None

    m = re.search(r"Rolling\s+Advertisement\s+No\.\s*(IITD/\d{4}/[A-Z\-0-9]+)\s+Dated\s+(\d{1,2}[.\-/]\d{1,2}[.\-/]\d{4})", text, re.IGNORECASE)
    if m:
        ad_number = m.group(1).strip()
        ad_date = _to_iso(m.group(2))

    m = re.search(r"on\s*or\s*before\s+([A-Z][a-z]+\s+\d{1,2},\s*\d{4})", text)
    if m:
        closing_date = _to_iso(m.group(1))

    # Fallback deadlines from 2026-06-30
    if not closing_date:
        closing_date = "2026-06-30"
    if not ad_number:
        ad_number = "IITD/2026/AP-1"

    # ---- department list: use canonical 21 from the 2026 AP-1 front sheet.
    # We looked at the PDF's first-page table once; it's stable across the
    # rolling updates. If IITD adds/renames a dept, update this list.
    # HSS-relevant entries for Bablu are 10, 19, 20 (and 11 for adjacency).
    dept_rows = [
        (1,  "Department of Applied Mechanics"),
        (2,  "Department of Biochemical Engineering & Biotechnology"),
        (3,  "Department of Chemical Engineering"),
        (4,  "Department of Chemistry"),
        (5,  "Department of Civil & Environmental Engineering"),
        (6,  "Department of Computer Science & Engineering"),
        (7,  "Department of Design"),
        (8,  "Department of Electrical Engineering"),
        (9,  "Department of Energy Science & Engineering"),
        (10, "Department of Humanities and Social Sciences"),
        (11, "Department of Management Studies"),
        (12, "Department of Material Science & Engineering"),
        (13, "Department of Mathematics"),
        (14, "Department of Mechanical Engineering"),
        (15, "Department of Textile & Fibre Engineering"),
        (16, "Centre for Atmospheric Sciences (CAS)"),
        (17, "Centre for Automotive Research and Tribology (CART)"),
        (18, "Transportation Research and Injury Prevention Centre (TRIP)"),
        (19, "School of Public Policy (SoPP)"),
        (20, "Yardi School of Artificial Intelligence (ScAI)"),
        (21, "Centre for Rural Development and Technology (CRDT)"),
    ]

    # ---- build the HSS sub-area records (Dept 10 gets special treatment)
    hss_sub_areas = _extract_iitd_hss_subareas(text)

    # ---- for each department, pull the Annexure-1 areas/criteria paragraph
    dept_annex = _split_annexure1_by_department(text, dept_rows)

    # ---- emit records
    inst_id = "iit-delhi"
    for num, name in dept_rows:
        is_hss = (num == 10)
        annex_text = dept_annex.get(num, "")

        # HSS: emit per-subarea records plus one umbrella record
        if is_hss and hss_sub_areas:
            for sub_name, sub_text in hss_sub_areas.items():
                ads.append(_mk_ad(
                    inst_id=inst_id,
                    ad_number=f"{ad_number} / Dept {num} / {sub_name}",
                    title=f"Assistant Professor (Grade I/II) — {name} — {sub_name}",
                    department=name,
                    discipline=sub_name,
                    post_type=PostType.Faculty,
                    contract_status=ContractStatus.Regular,
                    closing_date=closing_date,
                    publication_date=ad_date,
                    original_url=_pdf_url(pdf_path),
                    fetched_at=fetched_at,
                    confidence=0.92,
                    excerpt=sub_text[:1000] or annex_text[:1000],
                    pay_scale="7th CPC Level 12 (AP-I); Level 10 (AP-II)",
                ))
            continue

        # All other depts: one record each
        post = PostType.Faculty
        contract = ContractStatus.Regular
        ads.append(_mk_ad(
            inst_id=inst_id,
            ad_number=f"{ad_number} / Dept {num}",
            title=f"Assistant Professor (Grade I/II) — {name}",
            department=name,
            discipline=None,
            post_type=post,
            contract_status=contract,
            closing_date=closing_date,
            publication_date=ad_date,
            original_url=_pdf_url(pdf_path),
            fetched_at=fetched_at,
            confidence=0.88,
            excerpt=annex_text[:1000],
            pay_scale="7th CPC Level 12 (AP-I); Level 10 (AP-II)",
        ))

    return ads


HSS_SUBAREA_HEADINGS = [
    "Economics",
    "Literature",
    "Technology-in-Society",
    "Sociology",
    "Psychology",
]


def _extract_iitd_hss_subareas(text: str) -> dict[str, str]:
    """Pull the HSS sub-area paragraphs from Annexure-1 body.

    We find the HSS row and walk forward, splitting on the bolded sub-area
    labels ("Economics:", "Literature:", etc.).
    """
    # Find the start of HSS content via the first 'Economics: Applications...'
    # anchor (no other dept uses this exact token in Annexure-1).
    start_m = re.search(r"\bEconomics\s*:\s*Applications", text)
    if not start_m:
        return {}
    window_start = start_m.start()
    # end heuristics: next "Department Of" at col-0, or standalone Annexure-II.
    # Must NOT match "Annexure-III" which is referenced inline in the HSS cell.
    end_m = re.search(
        r"(11\s+Department\s+of\s+Management\s+Studies"
        r"|Department\s+[Oo]f\s+Management\s+Studies"
        r"|Annexure\s*[-–]\s*II(?!I))",
        text[window_start:],
    )
    window_end = window_start + (end_m.start() if end_m else min(len(text) - window_start, 15000))
    hss_body = text[window_start:window_end]

    subs: dict[str, str] = {}
    # FIRST occurrence of each sub-area heading in order; split window between
    # successive first-occurrences. We require each heading to be either at
    # start-of-line or preceded by whitespace (not a word like "Applied
    # Psychology:" which would otherwise match Psychology).
    pattern = re.compile(
        r"(?:^|\n|\s)(Economics|Literature|Technology[- ]in[- ]Society|Sociology|Psychology)\s*:\s*Applications?",
        re.IGNORECASE,
    )
    found: list[tuple[int, str]] = []  # (start_pos, canonical_name)
    seen_names: set[str] = set()
    for m in pattern.finditer(hss_body):
        name = _normalize_sub_area(m.group(1))
        if name in seen_names:
            continue
        seen_names.add(name)
        # start_pos should be the position of the heading itself (group 1),
        # not of the preceding whitespace. Use m.start(1).
        found.append((m.start(1), name))
    # Sort by position so body-windowing works:
    found.sort()
    for i, (pos, name) in enumerate(found):
        end = found[i + 1][0] if i + 1 < len(found) else len(hss_body)
        body = re.sub(r"\s+", " ", hss_body[pos:end]).strip()
        # Strip leading "<Name>:" so the excerpt starts with the content
        body = re.sub(rf"^{re.escape(name)}\s*:\s*", "", body, flags=re.IGNORECASE).strip()
        subs[name] = body
    return subs


def _normalize_sub_area(name: str) -> str:
    n = name.strip().lower()
    if "technology" in n and "society" in n:
        return "Technology-in-Society"
    return name.strip().title()


def _split_annexure1_by_department(text: str, dept_rows: list[tuple[int, str]]) -> dict[int, str]:
    """Given the full PDF text and the dept list, return {dept_num: annex1_body}."""
    out: dict[int, str] = {}
    if not dept_rows:
        return out

    # Build a regex that matches Annexure-1 rows: row begins with dept number + name.
    # We use the names from the canonical list to anchor.
    markers: list[tuple[int, str, int]] = []  # (dept_num, name, position)
    for num, name in dept_rows:
        # Strip punctuation that confuses regex; match the core name.
        core = re.escape(name.split("(")[0].strip()).replace(r"\ ", r"\s+")
        for m in re.finditer(core, text, re.IGNORECASE):
            markers.append((num, name, m.start()))

    # Keep only the 2nd occurrence (1st is on front-sheet table; 2nd is in Annexure-1)
    by_num: dict[int, list[int]] = {}
    for num, _, pos in markers:
        by_num.setdefault(num, []).append(pos)

    # Estimate Annexure-1 starting point
    anx_m = re.search(r"Annexure\s*[-–]\s*1\b", text, re.IGNORECASE)
    anx_pos = anx_m.start() if anx_m else 0

    anchor_positions: list[tuple[int, int]] = []  # (num, position)
    for num, positions in by_num.items():
        # Prefer the first occurrence AFTER Annexure-1 header
        after = [p for p in positions if p >= anx_pos]
        if after:
            anchor_positions.append((num, min(after)))
        else:
            anchor_positions.append((num, min(positions)))

    anchor_positions.sort(key=lambda t: t[1])

    # Body of dept i = text between its anchor and the next anchor
    for i, (num, pos) in enumerate(anchor_positions):
        next_pos = anchor_positions[i + 1][1] if i + 1 < len(anchor_positions) else len(text)
        body = text[pos:next_pos]
        out[num] = re.sub(r"\s+", " ", body).strip()
    return out


def _mk_ad(
    *,
    inst_id: str,
    ad_number: str,
    title: str,
    department: Optional[str],
    discipline: Optional[str],
    post_type: PostType,
    contract_status: ContractStatus,
    closing_date: Optional[str],
    publication_date: Optional[str],
    original_url: str,
    fetched_at: datetime,
    confidence: float,
    excerpt: str,
    pay_scale: Optional[str] = None,
    number_of_posts: Optional[int] = None,
) -> JobAd:
    ad_id = stable_id(inst_id, ad_number, title, str(publication_date or ""))
    return JobAd(
        id=ad_id,
        institution_id=inst_id,
        ad_number=ad_number,
        title=title[:400],
        department=department,
        discipline=discipline,
        post_type=post_type,
        contract_status=contract_status,
        category_breakdown=CategoryBreakdown(),
        number_of_posts=number_of_posts,
        pay_scale=pay_scale,
        publication_date=publication_date,
        closing_date=closing_date,
        original_url=original_url,
        snapshot_fetched_at=fetched_at,
        parse_confidence=confidence,
        raw_text_excerpt=excerpt,
    )


def _to_iso(s: str) -> Optional[str]:
    """Best-effort ISO-date from various input forms."""
    if not s:
        return None
    s = s.strip().rstrip(".")
    # '23.4.2026' / '23-4-2026' / '23/4/2026'
    m = re.match(r"^(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{4})$", s)
    if m:
        d, mo, y = map(int, m.groups())
        try:
            return datetime(y, mo, d).date().isoformat()
        except ValueError:
            return None
    # 'June 30, 2026'
    m = re.match(r"^([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})$", s)
    if m:
        month_name, d, y = m.group(1), int(m.group(2)), int(m.group(3))
        months = {m_: i + 1 for i, m_ in enumerate(
            ["january","february","march","april","may","june","july","august","september","october","november","december"])}
        mo = months.get(month_name.lower())
        if mo:
            try:
                return datetime(y, mo, d).date().isoformat()
            except ValueError:
                return None
    return None


# ---------- generic fallback ----------

def _extract_generic(pdf_path: Path, text: str, pages: list[str], fetched_at: datetime, institution_id: str) -> list[JobAd]:
    """Best-effort single-record extraction when we don't have an institution-specific extractor."""
    first = pages[0] if pages else text[:3000]

    ad_number = None
    m = re.search(r"(?:Advertisement|Advt\.?)\s*(?:No\.?)?\s*[:.]?\s*([A-Z0-9/\-.]+)", first, re.IGNORECASE)
    if m:
        ad_number = m.group(1).strip().rstrip(".,")

    ad_date = None
    m = re.search(r"Dated\s+(\d{1,2}[.\-/]\d{1,2}[.\-/]\d{4})", first, re.IGNORECASE)
    if m:
        ad_date = _to_iso(m.group(1))

    closing_date = None
    m = re.search(r"(?:last\s+date|closing\s+date|on\s+or\s+before|deadline)[^\n\.]*?([A-Za-z]+\s+\d{1,2},?\s+\d{4}|\d{1,2}[.\-/]\d{1,2}[.\-/]\d{4})", first, re.IGNORECASE)
    if m:
        closing_date = _to_iso(m.group(1).strip())

    # Title = first header-y line
    title_line = None
    for line in first.splitlines():
        s = line.strip()
        if len(s) > 15 and re.search(r"(recruit|advertisement|faculty|professor|assistant|associate)", s, re.IGNORECASE):
            title_line = s
            break
    title = (title_line or "Recruitment advertisement").strip()

    ad = _mk_ad(
        inst_id=institution_id,
        ad_number=ad_number or "unknown",
        title=title[:250],
        department=None,
        discipline=None,
        post_type=PostType.Faculty if re.search(r"faculty|professor", first, re.IGNORECASE) else PostType.Unknown,
        contract_status=ContractStatus.Unknown,
        closing_date=closing_date,
        publication_date=ad_date,
        original_url=_pdf_url(pdf_path),
        fetched_at=fetched_at,
        confidence=0.55,
        excerpt=first[:1000],
    )
    return [ad]


# ---------- dispatch ----------

def _extract_iitb_l10(pdf_path: Path, text: str, pages: list[str], fetched_at: datetime) -> list[JobAd]:
    """IIT Bombay Rolling Advertisement L-10/25-26 — Areas of Specialization annexure.

    Format: front page says 'Rolling Advertisement No. L-10/25-26, Areas of
    Specialization' and then lists 31 academic units (departments + centres +
    schools) with per-unit specialization details. No deadline in this PDF —
    it's the annexure to the rolling ad, which is perpetual by design.
    """
    ads: list[JobAd] = []

    # Metadata from front page
    ad_number = "IITB/L-10/25-26"
    m = re.search(r"Rolling\s+Advertisement\s+No\.\s*(L-\d+/\d{2}-\d{2})", text, re.IGNORECASE)
    if m:
        ad_number = f"IITB/{m.group(1).strip()}"

    # Canonical 31-unit list from the 2025-26 L-10 PDF front matter
    dept_rows = [
        (1,  "Aerospace Engineering"),
        (2,  "Biosciences & Bioengineering"),
        (3,  "Chemical Engineering"),
        (4,  "Chemistry"),
        (5,  "Civil Engineering"),
        (6,  "Computer Science & Engineering"),
        (7,  "Earth Sciences"),
        (8,  "Economics"),
        (9,  "Electrical Engineering"),
        (10, "Energy Science and Engineering"),
        (11, "Environmental Science and Engineering"),
        (12, "Industrial Engineering and Operations Research"),
        (13, "Mathematics"),
        (14, "Mechanical Engineering"),
        (15, "Metallurgical Engineering and Materials Science"),
        (16, "Physics"),
        (17, "Ashank Desai Centre for Policy Studies (ADCPS)"),
        (18, "Centre for Climate Studies"),
        (19, "Centre for Defence Studies"),
        (20, "Centre for Educational Technology"),
        (21, "Centre for Machine Intelligence and Data Sciences (C-MInDS)"),
        (22, "Centre for Advanced Packaging"),
        (23, "Centre for Systems and Control Engineering"),
        (24, "Centre for Technology Alternatives for Rural Areas (C-TARA)"),
        (25, "Centre for Traditional Indian Knowledge and Skills (CTIKS)"),
        (26, "Centre of Studies in Resources Engineering (CSRE)"),
        (27, "Koita Centre for Digital Health (KCDH)"),
        (28, "Motilal Oswal Centre for Capital Markets"),
        (29, "Desai Sethi School of Entrepreneurship"),
        (30, "IDC School of Design"),
        (31, "Shailesh J. Mehta School of Management"),
    ]

    # Extract body text per dept: anchor on '\n<num> <first word of name>' pattern.
    # Strip the repeated page header "Sr. Academic Unit Areas of Specialization / No." first.
    cleaned = re.sub(r"Sr\.\s*Academic Unit\s+Areas of Specialization\s*\n\s*No\.", "", text)
    anchors: list[tuple[int, int]] = []
    for num, name in dept_rows:
        # Use first significant word of the name as the anchor key
        first_word = re.escape(name.split()[0].rstrip(".,"))
        # Find '\n<num>  <first_word>'
        pat = re.compile(rf"\n\s*{num}\s+{first_word}", re.IGNORECASE)
        m = pat.search(cleaned)
        if m:
            anchors.append((num, m.start()))
    anchors.sort(key=lambda t: t[1])
    # Body = from this anchor to the next anchor
    dept_body: dict[int, str] = {}
    for i, (num, pos) in enumerate(anchors):
        nxt = anchors[i + 1][1] if i + 1 < len(anchors) else len(cleaned)
        body = cleaned[pos:nxt]
        dept_body[num] = re.sub(r"\s+", " ", body).strip()

    inst_id = "iit-bombay"
    for num, name in dept_rows:
        body_text = dept_body.get(num, "")
        ads.append(_mk_ad(
            inst_id=inst_id,
            ad_number=f"{ad_number} / Unit {num}",
            title=f"Faculty Position — {name}",
            department=name,
            discipline=None,
            post_type=PostType.Faculty,
            contract_status=ContractStatus.Regular,
            closing_date=None,  # rolling; annexure doesn't carry a deadline
            publication_date=None,
            original_url=_pdf_url(pdf_path),
            fetched_at=fetched_at,
            confidence=0.85,
            excerpt=body_text[:1000],
            pay_scale="7th CPC (refer to main advertisement)",
        ))

    return ads


INSTITUTION_EXTRACTORS = {
    "iit-delhi": _extract_iitd_rolling_ap,
    "iit-bombay": _extract_iitb_l10,
}


def ingest(pdf_path: Path, institution_id: str) -> list[JobAd]:
    with pdfplumber.open(str(pdf_path)) as pdf:
        pages = [(p.extract_text() or "") for p in pdf.pages]
    text = "\n".join(pages)

    fetched_at = datetime.now(timezone.utc)
    extractor = INSTITUTION_EXTRACTORS.get(institution_id)
    if extractor is not None:
        # Route to the specific one; if it produces zero, fall back to generic
        ads = extractor(pdf_path, text, pages, fetched_at)
        if not ads:
            ads = _extract_generic(pdf_path, text, pages, fetched_at, institution_id)
        return ads
    return _extract_generic(pdf_path, text, pages, fetched_at, institution_id)


def _ad_to_dict(ad: JobAd) -> dict:
    d = ad.model_dump() if hasattr(ad, "model_dump") else ad.dict()
    # Normalise dates to strings
    for k in ("publication_date", "closing_date", "snapshot_fetched_at"):
        v = d.get(k)
        if v is not None and not isinstance(v, str):
            d[k] = v.isoformat()
    # category_breakdown is a BaseModel; flatten
    cb = d.get("category_breakdown")
    if hasattr(cb, "model_dump"):
        d["category_breakdown"] = cb.model_dump()
    return d


def merge_into_current(new_ads: list[JobAd], current_path: Path) -> dict:
    existing: list[dict] = []
    if current_path.exists():
        try:
            payload = json.loads(current_path.read_text())
            existing = payload.get("ads", [])
        except Exception:
            existing = []

    by_id: dict[str, dict] = {a.get("id"): a for a in existing if a.get("id")}
    for ad in new_ads:
        d = _ad_to_dict(ad)
        by_id[d["id"]] = d

    merged = list(by_id.values())
    payload = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "ad_count": len(merged),
        "ads": merged,
    }
    current_path.parent.mkdir(parents=True, exist_ok=True)
    current_path.write_text(json.dumps(payload, indent=2, ensure_ascii=False, default=str))
    return payload


def replace_current(new_ads: list[JobAd], current_path: Path) -> dict:
    payload = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "ad_count": len(new_ads),
        "ads": [_ad_to_dict(a) for a in new_ads],
    }
    current_path.parent.mkdir(parents=True, exist_ok=True)
    current_path.write_text(json.dumps(payload, indent=2, ensure_ascii=False, default=str))
    return payload


def main(argv: list[str] | None = None) -> int:
    base = Path(__file__).resolve().parent.parent
    p = argparse.ArgumentParser(description="Parse an HEI recruitment PDF into JobAd records.")
    p.add_argument("--pdf", required=True, help="Path to the PDF file.")
    p.add_argument("--institution", required=True, help="institution_id (e.g. iit-delhi) — matches registry.")
    p.add_argument("--out", default=str(base / "data" / "current.json"), help="Output path for merged current.json.")
    p.add_argument("--merge", action="store_true", help="Merge with existing current.json instead of replacing.")
    p.add_argument("--dry-run", action="store_true", help="Print the records to stdout without writing.")
    args = p.parse_args(argv)

    pdf_path = Path(args.pdf).resolve()
    if not pdf_path.exists():
        print(f"PDF not found: {pdf_path}", file=sys.stderr)
        return 2

    ads = ingest(pdf_path, args.institution)
    print(f"Extracted {len(ads)} record(s) from {pdf_path.name}")
    for a in ads[:5]:
        print(f"  - [{a.parse_confidence:.2f}] {a.title}")
    if len(ads) > 5:
        print(f"  - … and {len(ads) - 5} more")

    if args.dry_run:
        payload = {
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "ad_count": len(ads),
            "ads": [_ad_to_dict(a) for a in ads],
        }
        print(json.dumps(payload, indent=2, ensure_ascii=False, default=str))
        return 0

    out_path = Path(args.out)
    payload = merge_into_current(ads, out_path) if args.merge else replace_current(ads, out_path)
    print(f"Wrote {payload['ad_count']} total record(s) → {out_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
