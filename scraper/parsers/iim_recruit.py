"""Generic parser for IIM-style recruitment pages.

IIMs differ from IITs in how they publish recruitment:
  - Most IIMs DON'T publish a single multi-area rolling ad. They post one PDF
    per discrete call (e.g. "Faculty Recruitment in Strategy Area, IIM Indore"
    or "Professor of Practice, IIM Calcutta") OR they keep a permanent generic
    "applications welcome year-round" page with no specific openings.
  - We treat each faculty-recruitment-tagged PDF on the careers page as one
    discrete ad. Areas, eligibility, and deadline are pulled from the PDF text.
  - If no relevant PDF is found, we emit a single rolling-stub ad so the IIM
    is still visible in the dashboard rather than silently absent.

This is deliberately less ambitious than the IIT parser. IIM hiring practices
are heterogeneous enough that a fully-structured per-area extraction is the
wrong target for v1.
"""

from __future__ import annotations

import hashlib
import re
from datetime import datetime
from pathlib import Path
from typing import Optional
from urllib.parse import urljoin

from bs4 import BeautifulSoup

from pdf_extractor import (
    download_pdf,
    extract_text,
    find_category_breakdown,
    find_deadline,
    find_publications,
)


# Match anchor text or href that suggests a faculty-recruitment PDF.
# Keyword-suffix-tolerant: "Faculty-Advertisement", "Faculty Recruitment",
# "Faculty Positions" all need to match. The previous version's trailing
# \b was failing because Advert+isement / Recruit+ment have no word
# boundary after the keyword stem.
RECRUIT_RE = re.compile(
    r"\bfaculty[\s/_-]+(?:recruit|position|opening|hiring|advert|search|job|vacanc|appointment)\w*"
    r"|\btenure[- ]track\s+faculty"
    r"|\bprofessor\b"
    r"|\brecruitment\s+in\s+\w+\s+area",
    re.I,
)

# Skip clearly-non-faculty PDFs even when they trip the regex.
SKIP_RE = re.compile(
    r"(recruiters?\s+guide|placement|brochure|prospectus|hr\s+policy|admission|"
    r"non[- _]teaching|non[- _]faculty|technical\s+staff|administrative\s+staff|"
    r"research\s+assistant|field\s+investigator)",
    re.I,
)


def _stable_id(*parts: str) -> str:
    """Local copy of the project-wide `stable_id` helper to avoid an
    `import scraper.run` cycle from inside the parsers package. See
    `scraper/run.py:stable_id` for the canonical implementation; behavior
    is identical (SHA-256 of NUL-joined parts, first 16 hex chars).
    """
    m = hashlib.sha256()
    for p in parts:
        m.update(p.encode("utf-8"))
        m.update(b"\x00")
    return m.hexdigest()[:16]


def _parse_iso(raw: Optional[str]) -> Optional[str]:
    """Best-effort coercion of a deadline string to ISO yyyy-mm-dd.

    Tries several formats the IIM/IIT-D corpus actually uses (full and
    abbreviated month names, then the three numeric DMY variants common in
    Indian institutional writing). Returns None if none parse — the
    dashboard treats null `closing_date` as "rolling, no deadline" rather
    than failing closed, so this is the right failure semantics.
    """
    if not raw:
        return None
    raw = raw.strip().rstrip(".")
    for fmt in ("%B %d, %Y", "%b %d, %Y", "%d/%m/%Y", "%d-%m-%Y", "%d.%m.%Y"):
        try:
            return datetime.strptime(raw, fmt).date().isoformat()
        except ValueError:
            pass
    return None


def parse(html: str, url: str, fetched_at: datetime) -> list[dict]:
    soup = BeautifulSoup(html, "html.parser")
    cache_root = Path(__file__).resolve().parents[2] / ".cache" / "pdfs"

    candidates: list[tuple[str, str]] = []  # (absolute_url, anchor_text)
    for a in soup.find_all("a", href=True):
        href = a["href"]
        if ".pdf" not in href.lower():
            continue
        text = re.sub(r"\s+", " ", a.get_text(" ", strip=True))
        haystack = href + " " + text
        if SKIP_RE.search(haystack):
            continue
        if not RECRUIT_RE.search(haystack):
            continue
        candidates.append((urljoin(url, href), text or href.rsplit("/", 1)[-1]))

    # Drop duplicates (preserve order).
    seen, deduped = set(), []
    for u, t in candidates:
        if u in seen:
            continue
        seen.add(u)
        deduped.append((u, t))

    out: list[dict] = []
    for pdf_url, anchor_text in deduped[:6]:  # cap noise
        path = download_pdf(pdf_url, cache_root)
        excerpt: Optional[str] = None
        deadline_iso: Optional[str] = None
        publications: Optional[str] = None
        category_breakdown: Optional[dict] = None
        if path:
            text = extract_text(path) or ""
            if text.strip():
                joined = re.sub(r"\s+", " ", text).strip()
                excerpt = (joined[:700] + "…") if len(joined) > 700 else joined
                deadline_iso = _parse_iso(find_deadline(text))
                publications = find_publications(text)
                # IIM Bodh Gaya, IIM Indore (Strategy area), and several others
                # publish per-position roster counts in the body of the PDF.
                # Pull them through so the dashboard can render reservation
                # pills (UR/SC/ST/OBC/EWS/PwBD) on each card.
                category_breakdown = find_category_breakdown(text)
        # Title heuristic: prefer the anchor text; fall back to the PDF's first line.
        title = anchor_text.strip() or "Faculty position"
        title = re.sub(r"\s+", " ", title)[:160]
        ad = {
            "id": _stable_id("iim", url, pdf_url),
            "institution_id": "__placeholder__",
            "ad_number": None,
            "title": title,
            "department": None,
            "discipline": None,
            "post_type": "Faculty",
            "contract_status": "Unknown",
            "category_breakdown": category_breakdown,
            "number_of_posts": (sum(category_breakdown.values()) if category_breakdown else None),
            "pay_scale": None,
            "publication_date": None,
            "closing_date": deadline_iso,
            "original_url": pdf_url,
            "snapshot_fetched_at": fetched_at.isoformat() if hasattr(fetched_at, "isoformat") else str(fetched_at),
            "parse_confidence": 0.6,
            "raw_text_excerpt": excerpt,
            "_pdf_parsed": True if path else False,
            "apply_url": None,        # IIMs route applications via email; no portal URL universally
            "info_url": url,
            "publications_required": publications,
            "unit_eligibility": None,
        }
        out.append(ad)

    if not out:
        # No discrete faculty PDFs found. Emit a single rolling-stub so the IIM
        # is visible in the dashboard with the "Listing page" link.
        out.append({
            "id": _stable_id("iim-stub", url),
            "institution_id": "__placeholder__",
            "ad_number": None,
            "title": "Rolling faculty recruitment (no discrete area postings)",
            "department": None,
            "discipline": None,
            "post_type": "Faculty",
            "contract_status": "Unknown",
            "category_breakdown": None,
            "number_of_posts": None,
            "pay_scale": None,
            "publication_date": None,
            "closing_date": None,
            "original_url": url,
            "snapshot_fetched_at": fetched_at.isoformat() if hasattr(fetched_at, "isoformat") else str(fetched_at),
            "parse_confidence": 0.5,
            "raw_text_excerpt": "No discrete faculty postings found on the careers page. Most IIMs route applications through internal channels; check the listing page directly or contact the institute's HR/Faculty Affairs office.",
            "_pdf_parsed": False,
            "apply_url": None,
            "info_url": url,
            "publications_required": None,
            "unit_eligibility": None,
            "_manual_stub": True,
        })
    return out
