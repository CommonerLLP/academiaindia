"""Site-specific parser for JNU recruitment page.

Target: https://www.jnu.ac.in/recruitment

Notes / honesty
- JNU's page historically has separate sections for teaching vs non-teaching
  advertisements, and publishes both category-wise post counts (UR/SC/ST/OBC/EWS/PwBD)
  and the roster reference. Parsing those breakdowns requires fetching each
  advertisement PDF; this v1 parser only extracts listing-level metadata.
- Parse confidence set at 0.55 until live-validated.
"""

from __future__ import annotations

import re
from datetime import datetime
from urllib.parse import urljoin

from bs4 import BeautifulSoup

from schema import JobAd, PostType, ContractStatus, CategoryBreakdown


TEACHING_HINTS = re.compile(r"professor|assistant professor|associate professor|faculty", re.IGNORECASE)
NON_TEACHING_HINTS = re.compile(r"non[- ]?teaching|ministerial|registrar|officer|assistant", re.IGNORECASE)


def parse(html: str, url: str, fetched_at: datetime) -> list[JobAd]:
    soup = BeautifulSoup(html, "html.parser")
    ads: list[JobAd] = []
    seen: set[str] = set()

    # JNU recruitment pages list advertisements as links in list items or table rows.
    candidates = []
    for li in soup.find_all("li"):
        candidates.append(li)
    for tr in soup.find_all("tr"):
        candidates.append(tr)

    for el in candidates:
        links = el.find_all("a", href=True)
        if not links:
            continue

        text = el.get_text(" ", strip=True)
        if len(text) < 10:
            continue

        for a in links:
            href = a["href"].strip()
            if href.startswith("#") or href.startswith("javascript:"):
                continue
            abs_url = urljoin(url, href)
            if abs_url in seen:
                continue
            seen.add(abs_url)

            link_text = a.get_text(" ", strip=True)
            if not link_text:
                continue

            if TEACHING_HINTS.search(text):
                post_type = PostType.Faculty
            elif NON_TEACHING_HINTS.search(text):
                post_type = PostType.NonFaculty
            elif "recruitment" in text.lower() or "advert" in text.lower():
                post_type = PostType.Unknown
            else:
                continue  # skip links that aren't clearly recruitment-related

            ad_number_m = re.search(r"(Advt\.?\s*No\.?\s*[:\-]?\s*[A-Z0-9\-/\.]+)", text, re.IGNORECASE)
            ad_number = ad_number_m.group(1) if ad_number_m else None

            # Prefer the surrounding element's text as the title when the link
            # text is a generic verb ("View", "Click", "Download"). Fall back
            # to link_text otherwise.
            generic_link = link_text.lower() in {"view", "click here", "click", "download", "pdf", "read more", "view advertisement", "here"}
            if generic_link:
                title = _clean_title(text, link_text)
            else:
                title = link_text

            if len(title) < 5:
                continue

            ad = JobAd(
                id="",
                institution_id="__placeholder__",
                ad_number=ad_number,
                title=title[:250],
                post_type=post_type,
                contract_status=ContractStatus.Unknown,
                category_breakdown=CategoryBreakdown(),
                original_url=abs_url,
                snapshot_fetched_at=fetched_at,
                parse_confidence=0.55,
                raw_text_excerpt=text[:500],
            )
            ads.append(ad)
    return ads


def _clean_title(context: str, link_text: str) -> str:
    """Remove the link text from context and strip trailing boilerplate."""
    t = context.replace(link_text, "").strip(" -—·|")
    # Strip common boilerplate
    t = re.sub(r"(view advertisement|click here|download|pdf|view|read more)\s*$", "", t, flags=re.IGNORECASE).strip(" -—·|.")
    return t
