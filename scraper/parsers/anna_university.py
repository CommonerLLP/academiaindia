"""Anna University recruitment parser.

Targets `https://www.annauniv.edu/recruitment.php`, which publishes a dated
listing of recruitment notices that typically link directly to PDFs.

v1 scope:
- emit faculty + research listings from the public recruitment page
- skip clearly administrative/support jobs
- stay HTML-only; linked PDFs are indexed but not parsed here
"""

from __future__ import annotations

import re
from datetime import datetime
from typing import Iterable
from urllib.parse import urljoin

from bs4 import BeautifulSoup, NavigableString, Tag

from ad_factory import make_ad, stable_id


DATE_RE = re.compile(
    r"\b(?P<day>\d{1,2})\s+"
    r"(?P<month>Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)"
    r"[a-z]*\s+(?P<year>20\d{2})\b",
    re.I,
)
MONTHS = {
    "jan": 1, "feb": 2, "mar": 3, "apr": 4, "may": 5, "jun": 6,
    "jul": 7, "aug": 8, "sep": 9, "oct": 10, "nov": 11, "dec": 12,
}
GENERIC_LINK_RE = re.compile(
    r"^(click here|download|view|pdf|notification|advertisement)$", re.I
)
FACULTY_RE = re.compile(
    r"\b(assistant professor|associate professor|professor|faculty|teaching)\b",
    re.I,
)
RESEARCH_RE = re.compile(
    r"\b(jrf|junior research fellow|srf|senior research fellow|research|"
    r"project assistant|project associate|project scientist|post[- ]?doctoral|"
    r"post doctoral|fellowship|scientist)\b",
    re.I,
)
ADMIN_RE = re.compile(
    r"\b(registrar|controller|finance officer|clerk|typist|driver|office "
    r"assistant|administrative|superintendent|technician|accountant)\b",
    re.I,
)
UNIT_RE = re.compile(
    r"\b([A-Z]{2,}(?:\s+[A-Z]{2,}){0,3}|"
    r"(?:Department|Centre|Center|School)\s+of\s+[A-Za-z&,\- ]+)\b"
)
CONTRACT_RE = re.compile(r"\b(contract|contractual|temporary|project)\b", re.I)


def _text_of(node) -> str:
    if node is None:
        return ""
    if isinstance(node, NavigableString):
        return " ".join(str(node).split())
    if isinstance(node, Tag):
        return " ".join(node.get_text(" ", strip=True).split())
    return ""


def _context_pieces(a: Tag) -> list[str]:
    parent = a.find_parent(["li", "tr", "div", "p"]) or (a.parent if isinstance(a.parent, Tag) else a)
    pieces = [
        _text_of(parent),
        _text_of(a),
    ]
    out: list[str] = []
    seen: set[str] = set()
    for piece in pieces:
        cleaned = " ".join(piece.split()).strip()
        if not cleaned or cleaned in seen:
            continue
        seen.add(cleaned)
        out.append(cleaned)
    return out


def _extract_date(parts: Iterable[str]) -> str | None:
    for part in parts:
        match = DATE_RE.search(part)
        if not match:
            continue
        day = int(match.group("day"))
        month = MONTHS[match.group("month").lower()[:3]]
        year = int(match.group("year"))
        return f"{year:04d}-{month:02d}-{day:02d}"
    return None


def _classify_scope(text: str) -> str | None:
    has_faculty = bool(FACULTY_RE.search(text))
    has_research = bool(RESEARCH_RE.search(text))
    has_admin = bool(ADMIN_RE.search(text))
    if not has_faculty and not has_research:
        return None
    if has_admin and not has_research and not has_faculty:
        return None
    return "Faculty" if has_faculty and not has_research else "Research"


def _title_for(a: Tag, context_parts: list[str]) -> str:
    link_text = _text_of(a)
    if link_text and not GENERIC_LINK_RE.match(link_text):
        return link_text
    for part in context_parts:
        if part != link_text and (FACULTY_RE.search(part) or RESEARCH_RE.search(part)):
            return part
    return link_text


def _extract_unit(context_parts: list[str], title: str) -> str | None:
    for part in context_parts:
        if part == title:
            continue
        match = UNIT_RE.search(part)
        if match:
            unit = match.group(1).strip(" -:")
            if unit.lower() != title.lower():
                return unit
    return None


def parse(html: str, url: str, fetched_at: datetime) -> list[dict]:
    soup = BeautifulSoup(html or "", "html.parser")
    ads: list[dict] = []
    seen_urls: set[str] = set()

    for a in soup.find_all("a", href=True):
        href = (a.get("href") or "").strip()
        if not href or href.startswith("#") or href.lower().startswith("javascript:"):
            continue

        abs_url = urljoin(url, href)
        if abs_url in seen_urls:
            continue

        context_parts = _context_pieces(a)
        if not context_parts:
            continue

        title = _title_for(a, context_parts).strip(" -|")
        if len(title) < 5:
            continue

        scope_text = " ".join(context_parts)
        post_type = _classify_scope(f"{title} {scope_text}")
        if post_type is None:
            continue

        seen_urls.add(abs_url)
        publication_date = _extract_date(context_parts)
        unit = _extract_unit(context_parts, title)
        parse_confidence = 0.87 if publication_date else 0.78
        contract_status = "Contractual" if CONTRACT_RE.search(scope_text) else "Unknown"

        ads.append(make_ad(
            id=stable_id("anna-university", abs_url, title, publication_date or ""),
            title=title[:250],
            original_url=abs_url,
            snapshot_fetched_at=fetched_at,
            publication_date=publication_date,
            department=unit,
            discipline=unit if unit and len(unit) > 4 else None,
            post_type=post_type,
            contract_status=contract_status,
            parse_confidence=parse_confidence,
            raw_text_excerpt=scope_text[:500],
            info_url=url,
        ))

    return ads
