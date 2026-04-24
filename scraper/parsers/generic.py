"""Generic heuristic parser for HEI recruitment pages.

What this does
- Reads the HTML text and finds links that look like recruitment advertisements.
- Signals a link is an ad if:
    - link text or href contains one of the recruitment keywords (English/Hindi), OR
    - link points to a PDF and the surrounding text mentions 'advertisement', 'recruitment', 'vacancy'.
- Extracts ad_number via regex if present in nearby text.
- Extracts publication_date and closing_date best-effort from nearby text.
- Reports low parse_confidence (0.3–0.5) because heuristic inference is fragile.

What this does NOT do
- Parse PDF contents. Generic parser only looks at the listing page. A site-specific
  parser can choose to fetch and OCR the PDF; generic does not, to keep latency
  predictable.
- Normalise category_breakdown from plain-text advertisement body. That requires
  per-site regex tuning or PDF table extraction, and is the primary place where
  a site-specific parser earns its keep.
"""

from __future__ import annotations

import hashlib
import re
from datetime import datetime
from urllib.parse import urljoin
from typing import Iterator

from bs4 import BeautifulSoup

from schema import JobAd, PostType, ContractStatus, CategoryBreakdown


RECRUITMENT_KEYWORDS = [
    r"recruit",
    r"vacanc",
    r"advert",
    r"faculty",
    r"non[- ]?teaching",
    r"ministerial",
    r"scientist",
    r"engagement",
    r"walk[- ]?in",
    r"अधिसूचना",
    r"भर्ती",
    r"विज्ञापन",
    r"रिक्ति",
]

AD_NUMBER_RE = re.compile(
    r"(?:Advertisement|Advt\.?|Notification|Ref\.?|F\.?\s?No\.?)[\s:/No\.]*([A-Z0-9/\-\.\s]{3,40})",
    re.IGNORECASE,
)

DATE_RE = re.compile(
    r"(\d{1,2})[\s\.\-/](Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec|[0-1]?\d)[\s\.\-/](20\d{2})",
    re.IGNORECASE,
)

CLOSING_HINTS = re.compile(r"(last|closing|deadline|apply\s*by)\s*(date)?", re.IGNORECASE)
PUBLISHED_HINTS = re.compile(r"(advertise|publish|issued|dated)", re.IGNORECASE)


def _is_recruitment_link(link_text: str, href: str, surrounding_text: str) -> bool:
    hay = f"{link_text} {href} {surrounding_text}".lower()
    for kw in RECRUITMENT_KEYWORDS:
        if re.search(kw, hay, re.IGNORECASE):
            return True
    return href.lower().endswith(".pdf") and any(
        re.search(k, surrounding_text, re.IGNORECASE) for k in ("advert", "recruit", "vacanc", "faculty")
    )


def _extract_ad_number(text: str) -> str | None:
    m = AD_NUMBER_RE.search(text)
    if m:
        return m.group(1).strip().rstrip(".,;:")
    return None


def _extract_dates(text: str) -> tuple[str | None, str | None]:
    """Return (publication_date, closing_date) as ISO strings if confidently found."""
    pub: str | None = None
    close: str | None = None

    # Simple strategy: find all dates, then try to label them by hints in the
    # preceding 40 chars. If only one date present, treat as closing.
    matches = list(DATE_RE.finditer(text))
    for m in matches:
        ctx = text[max(0, m.start() - 60): m.start()].lower()
        iso = _to_iso(*m.groups())
        if iso is None:
            continue
        if CLOSING_HINTS.search(ctx):
            close = close or iso
        elif PUBLISHED_HINTS.search(ctx):
            pub = pub or iso

    if close is None and len(matches) == 1:
        iso = _to_iso(*matches[0].groups())
        close = iso

    return pub, close


_MONTHS = {m: i for i, m in enumerate(
    ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"], start=1)}


def _to_iso(day: str, month_s: str, year: str) -> str | None:
    try:
        d = int(day)
        y = int(year)
        ms = month_s.lower()[:3]
        if ms in _MONTHS:
            mo = _MONTHS[ms]
        elif month_s.isdigit():
            mo = int(month_s)
        else:
            return None
        if not (1 <= mo <= 12 and 1 <= d <= 31 and 2015 <= y <= 2035):
            return None
        return f"{y:04d}-{mo:02d}-{d:02d}"
    except Exception:
        return None


def _stable_id(*parts: str) -> str:
    m = hashlib.sha256()
    for p in parts:
        m.update((p or "").encode("utf-8"))
        m.update(b"\x00")
    return m.hexdigest()[:16]


def parse(html: str, url: str, fetched_at: datetime) -> list[JobAd]:
    soup = BeautifulSoup(html, "html.parser")

    ads: list[JobAd] = []
    seen_urls: set[str] = set()

    for a in soup.find_all("a", href=True):
        href = a["href"].strip()
        if not href or href.startswith("#") or href.startswith("javascript:"):
            continue
        link_text = (a.get_text(" ", strip=True) or "").strip()
        if not link_text:
            continue

        # Surrounding text = the parent element's text, which usually carries
        # the advertisement context (date, ad number, category breakdown).
        parent_text = a.parent.get_text(" ", strip=True) if a.parent else link_text
        context = f"{link_text}  {parent_text}"

        if not _is_recruitment_link(link_text, href, context):
            continue

        abs_url = urljoin(url, href)
        if abs_url in seen_urls:
            continue
        seen_urls.add(abs_url)

        ad_number = _extract_ad_number(context)
        pub, close = _extract_dates(context)

        # Simple post-type classification
        lc = context.lower()
        if "faculty" in lc or "professor" in lc or "reader" in lc or "lecturer" in lc:
            post_type = PostType.Faculty
        elif "scientist" in lc or "research" in lc:
            post_type = PostType.Scientific
        elif "ministerial" in lc or "non-teaching" in lc or "section officer" in lc or "assistant" in lc:
            post_type = PostType.NonFaculty
        else:
            post_type = PostType.Unknown

        if "guest" in lc:
            contract = ContractStatus.Guest
        elif "ad-hoc" in lc or "adhoc" in lc:
            contract = ContractStatus.AdHoc
        elif "contractual" in lc or "contract basis" in lc:
            contract = ContractStatus.Contractual
        elif "visiting" in lc:
            contract = ContractStatus.Visiting
        elif "tenure track" in lc or "tenure-track" in lc:
            contract = ContractStatus.TenureTrack
        elif "regular" in lc or "permanent" in lc:
            contract = ContractStatus.Regular
        else:
            contract = ContractStatus.Unknown

        # Prefer surrounding context as title when link text is a generic verb
        generic_link = link_text.lower() in {
            "view", "click here", "click", "download", "pdf", "read more",
            "view advertisement", "here", "download advertisement pdf", "download pdf",
        }
        if generic_link and len(parent_text) > len(link_text) + 5:
            title_text = parent_text.replace(link_text, "").strip(" -—·|")
            title_text = re.sub(r"\.?\s*(download|view|click|pdf)\s*(advertisement|pdf)?\s*$", "", title_text, flags=re.IGNORECASE).strip(" -—·|.")
            title = title_text or link_text
        else:
            title = link_text

        ad_id = _stable_id("pending-inst-id", ad_number or title, pub or close or "")
        ad = JobAd(
            id=ad_id,
            institution_id="__placeholder__",  # overwritten by orchestrator
            ad_number=ad_number,
            title=title[:250],
            post_type=post_type,
            contract_status=contract,
            category_breakdown=CategoryBreakdown(),
            publication_date=pub,
            closing_date=close,
            original_url=abs_url,
            snapshot_fetched_at=fetched_at,
            parse_confidence=0.35,
            raw_text_excerpt=context[:500],
        )
        ads.append(ad)

    return ads
