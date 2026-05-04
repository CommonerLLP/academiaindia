"""IIT Kanpur department-wise rolling-recruitment parser.

Targets `https://iitk.ac.in/dofa/department-wise-vacancies-and-area-of-specialization`,
which lists each academic unit as a paragraph of the form

    <Department Name>: <multi-paragraph description of areas sought>

Unlike the IIT-Delhi/Bombay/Madras parser (which works against rolling-ad
PDFs), this parser is HTML-only — IIT-K publishes the area descriptions
inline.

How department-headers are identified
-------------------------------------
We use *two* passes:

1. **Known-name pass** matches the well-defined list in `KNOWN_DEPTS`. This
   anchors on names we know exist and gives clean department labels.
2. **Generic pass** catches any `<ProperNoun phrase>: …` block that wasn't
   already matched. New departments / centres at IIT-K previously got
   silently dropped when the known-name list went stale; the generic pass
   fixes that, and unmatched-but-extracted names are logged so you can update
   `KNOWN_DEPTS` opportunistically.
"""

from __future__ import annotations

import hashlib
import logging
import re
from datetime import datetime
from typing import Optional

from bs4 import BeautifulSoup

from constants import IIT_KANPUR_DEPT_EXCERPT_MAX_CHARS, PLACEHOLDER_INSTITUTION_ID

logger = logging.getLogger(__name__)


# Known IIT-K academic units. The generic-pass below catches anything not
# listed here, so this is now an *acceleration* of the parser (cleaner labels,
# guaranteed coverage) rather than a hard gate. New centres should be added
# here when noticed (look for `iit_kanpur generic-pass found` log lines).
KNOWN_DEPTS = {
    "Aerospace Engineering",
    "Biological Sciences and Bioengineering",
    "Chemical Engineering",
    "Chemistry",
    "Civil Engineering",
    "Cognitive Science",
    "Computer Science and Engineering",
    "Earth Sciences",
    "Economic Sciences",
    "Electrical Engineering",
    "Humanities and Social Sciences",
    "Industrial and Management Engineering",
    "Materials Science and Engineering",
    "Mathematics and Statistics",
    "Mechanical Engineering",
    "Mechanics, Aerodynamics & Astrodynamics",
    "Nuclear Engineering and Technology",
    "Physics",
    "Statistics and Mathematics",
    "Sustainable Energy Engineering",
    "Photonics Science and Engineering",
    "Materials Science Programme",
    "Design Programme",
    "Environmental Science and Engineering",
    "Centre for Lasers and Photonics",
    "Centre for Mechatronics",
    "School of Medical Research and Technology",
    "Kotak School of Sustainability",
}

# Pre-compile each department-header regex once at module load (was being
# recompiled per parse-call before).
_KNOWN_DEPT_PATTERNS: list[tuple[str, re.Pattern]] = [
    (dept, re.compile(rf"\b{re.escape(dept)}\s*:\s+", re.I))
    for dept in KNOWN_DEPTS
]

# Generic header regex: a 2-7 word capitalised phrase ending in `:`. The phrase
# must start with a capital letter and consist primarily of capitalised words
# (a department name like "Centre for AI" or "Department of Design"). We
# accept lowercase words (`for`, `of`, `and`, `&`) as connectors.
_GENERIC_DEPT_RE = re.compile(
    r"\b("
    r"[A-Z][A-Za-z]{2,30}"              # First word (Title-cased, ≥3 letters)
    r"(?:\s+(?:[A-Z][\w&\-]{1,30}|of|and|for|&|the))"  # Mandatory 2nd word
    r"(?:\s+(?:[A-Z][\w&\-]{1,30}|of|and|for|&|the)){0,5}"  # 0-5 more words
    r")\s*:\s+"
)


def _stable_id(*parts: str) -> str:
    m = hashlib.sha256()
    for p in parts:
        m.update(p.encode("utf-8"))
        m.update(b"\x00")
    return m.hexdigest()[:16]


def _extract_dept_blocks(plain: str) -> list[tuple[str, str]]:
    """Return [(dept_name, description)] for every department-like header
    found in the plain-text body.

    Two-pass strategy:
      1. Known names (`KNOWN_DEPTS`) — fast and clean.
      2. Generic ProperNoun-phrase matcher — catches new/renamed departments.

    Hits from pass 2 that don't overlap pass 1 results are logged at INFO so
    they can be promoted to `KNOWN_DEPTS` next time someone touches the file.
    """
    found_positions: set[int] = set()
    out: list[tuple[str, int, int]] = []  # (name, start, end-of-header)

    # --- pass 1: known names -------------------------------------------------
    for dept, pat in _KNOWN_DEPT_PATTERNS:
        m = pat.search(plain)
        if m:
            out.append((dept, m.start(), m.end()))
            found_positions.add(m.start())

    # --- pass 2: generic ProperNoun-phrase fallback --------------------------
    # Skip phrases that are clearly not department headers (false positives
    # like "Page Of Contents:", "Note:", "ProgramMe Details:").
    SKIP_PHRASE_RE = re.compile(
        r"^(page|note|notice|details?|annexure|table|figure|section|"
        r"chapter|appendix|abstract|summary)\b",
        re.I,
    )
    for m in _GENERIC_DEPT_RE.finditer(plain):
        if m.start() in found_positions:
            continue  # already caught by known-name pass
        name = re.sub(r"\s+", " ", m.group(1)).strip()
        if SKIP_PHRASE_RE.match(name):
            continue
        # Avoid matching mid-sentence noise like "Engineering Studies: a survey"
        # by requiring the header to be at line start or after a blank-line gap.
        # `plain` here has had whitespace collapsed; cheap proxy: char before
        # the match should be `.` or sentence-final, not a lowercase letter.
        if m.start() > 0 and plain[m.start() - 1].isalpha():
            continue
        logger.info("iit_kanpur generic-pass found unknown dept: %r", name)
        out.append((name, m.start(), m.end()))
        found_positions.add(m.start())

    out.sort(key=lambda x: x[1])

    blocks: list[tuple[str, str]] = []
    for i, (dept, _start, end) in enumerate(out):
        body_end = out[i + 1][1] if i + 1 < len(out) else len(plain)
        body = plain[end:body_end].strip()
        if len(body) > IIT_KANPUR_DEPT_EXCERPT_MAX_CHARS:
            body = body[:IIT_KANPUR_DEPT_EXCERPT_MAX_CHARS].rsplit(" ", 1)[0] + "…"
        blocks.append((dept, body))
    return blocks


def parse(html: str, url: str, fetched_at: datetime) -> list[dict]:
    soup = BeautifulSoup(html, "html.parser")
    plain = re.sub(r"\s+", " ", soup.get_text(" ", strip=True))
    blocks = _extract_dept_blocks(plain)
    out: list[dict] = []
    for dept, body in blocks:
        ad = {
            "id": _stable_id("iit-kanpur", dept),
            "institution_id": PLACEHOLDER_INSTITUTION_ID,
            "ad_number": None,
            "title": f"Faculty — {dept}",
            "department": dept,
            "discipline": dept,
            "post_type": "Faculty",
            "contract_status": "TenureTrack",
            "category_breakdown": None,
            "number_of_posts": None,
            "pay_scale": None,
            "publication_date": None,
            "closing_date": None,  # rolling
            "original_url": url,
            "snapshot_fetched_at": fetched_at.isoformat() if hasattr(fetched_at, "isoformat") else str(fetched_at),
            "parse_confidence": 0.7,
            "raw_text_excerpt": body,
            "_pdf_parsed": False,
            "apply_url": "https://iitk.ac.in/dofa/online-application-form",
            "info_url": url,
            "publications_required": None,
            "unit_eligibility": None,
        }
        out.append(ad)
    if not out:
        out.append({
            "id": _stable_id("iit-kanpur-stub", url),
            "institution_id": PLACEHOLDER_INSTITUTION_ID,
            "title": "Rolling faculty recruitment (page parsed, no department blocks detected)",
            "department": None, "discipline": None,
            "post_type": "Faculty", "contract_status": "Unknown",
            "category_breakdown": None, "number_of_posts": None,
            "pay_scale": None, "publication_date": None, "closing_date": None,
            "ad_number": None,
            "original_url": url,
            "snapshot_fetched_at": fetched_at.isoformat() if hasattr(fetched_at, "isoformat") else str(fetched_at),
            "parse_confidence": 0.4,
            "raw_text_excerpt": "Parser found no `<Dept>: <areas>` blocks. Either the IIT-K page restructured or the registry URL is stale.",
            "_pdf_parsed": False, "_manual_stub": True,
            "apply_url": None, "info_url": url,
            "publications_required": None, "unit_eligibility": None,
        })
    return out
