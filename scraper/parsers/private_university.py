"""Parser for private-university careers pages.

Private universities tend to publish HSS jobs in one of three shapes:
  - table-based portals (Shiv Nadar, FLAME)
  - card/list-based jobs pages (Azim Premji, Ashoka)
  - standing faculty-call pages (Ahmedabad, JGU)

This parser is intentionally permissive. For a public-interest tracker, a
coarse official listing is better than silence; the dashboard classifier and
source provenance make low-specificity entries visible to users.
"""

from __future__ import annotations

import hashlib
import re
from datetime import datetime
from typing import Optional
from urllib.parse import urljoin

from bs4 import BeautifulSoup


JOB_HINT_RE = re.compile(
    r"\b(faculty|professor|lecturer|academic\s+associate|research\s+fellow|"
    r"research\s+positions?|post[- ]?doc|teaching\s+fellow|visiting\s+scholar)\b",
    re.I,
)
TITLE_RE = re.compile(
    r"\b((?:chair\s+)?(?:assistant|associate|visiting)?\s*professor(?:\s*(?:-|/|in)\s+[^.;|\\n]{2,160})?|"
    r"faculty\s+positions?\s+in\s+[^.;|\\n]{2,160}|"
    r"teaching\s+fellow\s+positions?|research\s+positions?|academic\s+associate)\b",
    re.I,
)

SKIP_RE = re.compile(
    r"\b(admission|student|placement|alumni|newsletter|programme|program\b|"
    r"job\s+opportunities|apply\s+now\s*$|explore\s+opportunities\s*$)\b",
    re.I,
)
NAV_RE = re.compile(r"^\s*(home|jobs|about us|contact us|www\.|https?://|[\w.%-]+@[\w.-]+)\s*$", re.I)

MONTHS = {
    "jan": 1, "feb": 2, "mar": 3, "apr": 4, "may": 5, "jun": 6,
    "jul": 7, "aug": 8, "sep": 9, "oct": 10, "nov": 11, "dec": 12,
}

DATE_RES = [
    re.compile(r"(?P<mon>Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(?P<day>\d{1,2}),?\s+(?P<year>20\d{2})", re.I),
    re.compile(r"(?P<day>\d{1,2})\s+(?P<mon>Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*,?\s+(?P<year>20\d{2})", re.I),
    re.compile(r"(?P<day>\d{1,2})[./-](?P<mon>\d{1,2})[./-](?P<year>20\d{2})"),
]


def _stable_id(*parts: str) -> str:
    m = hashlib.sha256()
    for p in parts:
        m.update((p or "").encode("utf-8"))
        m.update(b"\x00")
    return m.hexdigest()[:16]


def _clean(text: str) -> str:
    return re.sub(r"\s+", " ", text or "").strip()


def _parse_date(text: str) -> Optional[str]:
    if not text or re.search(r"\bopen\b", text, re.I):
        return None
    for r in DATE_RES:
        m = r.search(text)
        if not m:
            continue
        gd = m.groupdict()
        mon_raw = gd["mon"]
        mon = int(mon_raw) if mon_raw.isdigit() else MONTHS.get(mon_raw[:3].lower())
        if not mon:
            continue
        day = int(gd["day"])
        year = int(gd["year"])
        if 1 <= day <= 31 and 1 <= mon <= 12:
            return f"{year:04d}-{mon:02d}-{day:02d}"
    return None


def _title_from_text(text: str) -> str:
    m = TITLE_RE.search(text or "")
    if m:
        title = _clean(m.group(1))
        title = re.split(r"\s+(?:Know More|Apply Now|Click here|The selected candidate|position requires)\b", title, flags=re.I)[0]
        return title.rstrip(" ,:-")
    first = re.split(r"\s{2,}| Deadline | Campus | Location ", text or "")[0]
    return _clean(first)


def _post_type(title: str) -> str:
    t = title.lower()
    if "academic associate" in t:
        return "Research"
    if "research" in t or "postdoc" in t or "fellow" in t:
        return "Research"
    if "faculty" in t or "professor" in t or "lecturer" in t or "teaching" in t:
        return "Faculty"
    return "Unknown"


def _contract(title: str) -> str:
    t = title.lower()
    if "visiting" in t:
        return "Visiting"
    if "contract" in t:
        return "Contractual"
    if "teaching fellow" in t or "academic associate" in t:
        return "Contractual"
    return "TenureTrack" if re.search(r"\b(professor|faculty)\b", t) else "Unknown"


def _make_ad(title: str, url: str, fetched_at: datetime, excerpt: str,
             closing: Optional[str] = None, apply_url: Optional[str] = None,
             confidence: float = 0.55) -> dict:
    title = _clean(title)[:220]
    excerpt = _clean(excerpt)[:700]
    return {
        "id": _stable_id("private", url, title, closing or ""),
        "institution_id": "__placeholder__",
        "ad_number": None,
        "title": title,
        "department": None,
        "discipline": None,
        "post_type": _post_type(title),
        "contract_status": _contract(title),
        "category_breakdown": None,
        "number_of_posts": None,
        "pay_scale": None,
        "publication_date": None,
        "closing_date": closing,
        "original_url": url,
        "snapshot_fetched_at": fetched_at.isoformat() if hasattr(fetched_at, "isoformat") else str(fetched_at),
        "parse_confidence": confidence,
        "raw_text_excerpt": excerpt,
        "apply_url": apply_url,
        "info_url": url,
        "_private_university": True,
    }


def _row_ads(soup: BeautifulSoup, base_url: str, fetched_at: datetime) -> list[dict]:
    ads: list[dict] = []
    for tr in soup.find_all("tr"):
        cells = [_clean(td.get_text(" ", strip=True)) for td in tr.find_all(["td", "th"])]
        row_text = _clean(" | ".join(cells))
        if not JOB_HINT_RE.search(row_text) or SKIP_RE.search(row_text):
            continue
        title = next(
            (
                c for c in cells
                if 8 <= len(c) <= 190 and JOB_HINT_RE.search(c) and not NAV_RE.search(c) and not SKIP_RE.search(c)
            ),
            "",
        ) or _title_from_text(row_text)
        if NAV_RE.search(title):
            continue
        closing = _parse_date(row_text)
        link = tr.find("a", href=True)
        apply_url = urljoin(base_url, link["href"]) if link else None
        ads.append(_make_ad(title, base_url, fetched_at, row_text, closing, apply_url, 0.65))
    return ads


def _block_ads(soup: BeautifulSoup, base_url: str, fetched_at: datetime) -> list[dict]:
    ads: list[dict] = []
    seen: set[str] = set()
    selectors = ["article", "li", ".job", ".card", ".views-row", ".opportunity", "section"]
    for node in soup.select(",".join(selectors)):
        text = _clean(node.get_text(" ", strip=True))
        if len(text) < 20 or not JOB_HINT_RE.search(text) or SKIP_RE.search(text):
            continue
        heading = node.find(["h1", "h2", "h3", "h4", "strong"])
        title = _clean(heading.get_text(" ", strip=True)) if heading else ""
        if not title or not JOB_HINT_RE.search(title):
            # Fall back to the first sentence-ish chunk.
            title = _title_from_text(text)
        if SKIP_RE.search(title):
            continue
        if len(title) < 8 or NAV_RE.search(title):
            continue
        key = title.lower()
        if key in seen:
            continue
        seen.add(key)
        link = node.find("a", href=True)
        apply_url = urljoin(base_url, link["href"]) if link else None
        closing = _parse_date(text)
        ads.append(_make_ad(title, base_url, fetched_at, text, closing, apply_url, 0.55))
    return ads


def _link_ads(soup: BeautifulSoup, base_url: str, fetched_at: datetime) -> list[dict]:
    ads: list[dict] = []
    seen: set[str] = set()
    for a in soup.find_all("a", href=True):
        if a["href"].strip() == "#":
            continue
        text = _clean(a.get_text(" ", strip=True))
        parent = _clean(a.parent.get_text(" ", strip=True) if a.parent else text)
        hay = f"{text} {parent}"
        if not JOB_HINT_RE.search(hay) or SKIP_RE.search(hay):
            continue
        title = parent if len(parent) < 220 and JOB_HINT_RE.search(parent) else text
        title = _title_from_text(title)
        if SKIP_RE.search(title):
            continue
        if len(title) < 8 or NAV_RE.search(title):
            continue
        href = urljoin(base_url, a["href"])
        key = f"{title.lower()} {href}"
        if key in seen:
            continue
        seen.add(key)
        ads.append(_make_ad(title, href, fetched_at, parent, _parse_date(parent), href, 0.5))
    return ads


def parse(html: str, url: str, fetched_at: datetime) -> list[dict]:
    soup = BeautifulSoup(html, "html.parser")
    for tag in soup(["script", "style", "noscript", "svg"]):
        tag.decompose()

    page_text = _clean(soup.get_text(" ", strip=True))
    if "ahduni.edu.in" in url:
        ad = _make_ad(
            "Standing faculty recruitment - Ahmedabad University",
            url,
            fetched_at,
            page_text,
            None,
            url,
            0.45,
        )
        ad["_rolling_stub"] = True
        ad["_source_method"] = "curated rolling call"
        return [ad]

    if "krea.edu.in" in url:
        ad = _make_ad(
            "Faculty - SIAS, 2025-26",
            url,
            fetched_at,
            page_text,
            None,
            url,
            0.4,
        )
        ad["_rolling_stub"] = True
        ad["_source_method"] = "curated rolling call"
        return [ad]

    if "ashoka.edu.in" in url:
        parsed_ads = [*_block_ads(soup, url, fetched_at), *_link_ads(soup, url, fetched_at)]
    else:
        parsed_ads = _row_ads(soup, url, fetched_at)
    if not parsed_ads:
        parsed_ads = _block_ads(soup, url, fetched_at)
    if not parsed_ads:
        parsed_ads = _link_ads(soup, url, fetched_at)

    ads: list[dict] = []
    seen: set[tuple[str, str]] = set()
    for ad in parsed_ads:
        if "flame.edu.in" in url and (ad.get("title") or "").casefold() in {
            "professor", "associate professor", "assistant professor"
        }:
            continue
        key = ((ad.get("title") or "").casefold(), "")
        if key in seen:
            continue
        seen.add(key)
        ads.append(ad)

    # Standing faculty-call fallback for pages that are clearly faculty hiring
    # sources but do not expose a machine-friendly job list.
    if not ads and JOB_HINT_RE.search(page_text):
        ads.append(_make_ad(
            "Standing faculty recruitment / careers page",
            url,
            fetched_at,
            page_text,
            None,
            url,
            0.4,
        ))
        ads[-1]["_rolling_stub"] = True
        ads[-1]["_source_method"] = "curated rolling call"

    return ads[:80]
