"""Site-specific parser for IIT Indore faculty recruitment page.

Target: https://www.iiti.ac.in/recruitments/faculty-positions

Structure: loose <p><strong>Title</strong></p> followed by <p><a href=".pdf">Download</a></p>.
This parser finds PDF links under /public/storage/recruitments/ and associates the
nearest preceding bold text as the advertisement title.
"""

from __future__ import annotations

import re
from datetime import datetime
from urllib.parse import urljoin

from bs4 import BeautifulSoup

from schema import JobAd, PostType, ContractStatus, CategoryBreakdown

AD_NUMBER_RE = re.compile(
    r"IITI[/_][A-Z0-9/_\-\.]+",
    re.IGNORECASE,
)

SKIP_TEXTS = {
    "download", "advertisement in hindi", "click here", "view", "pdf",
    "notice", "notice: extension of last date", "extension of last date",
}


def parse(html: str, url: str, fetched_at: datetime) -> list[JobAd]:
    soup = BeautifulSoup(html, "html.parser")
    ads: list[JobAd] = []
    seen: set[str] = set()
    seen_ad_numbers: set[str] = set()

    # Walk all <a> tags that point to recruitment PDFs
    for a in soup.find_all("a", href=True):
        href = a["href"].strip()
        if "public/storage/recruitments" not in href and "public/storage/career/faculty" not in href:
            continue

        abs_url = urljoin(url, href)
        if abs_url in seen:
            continue
        seen.add(abs_url)

        # Walk backwards up the DOM to find the nearest bold/heading title
        title = ""
        ad_number = None
        node = a.parent
        for _ in range(6):  # look up to 6 ancestor levels
            if node is None:
                break
            # Scan preceding siblings for a <strong> or heading with text
            for sib in reversed(list(node.previous_siblings)):
                text = sib.get_text(" ", strip=True) if hasattr(sib, "get_text") else str(sib).strip()
                if not text or text.lower() in SKIP_TEXTS:
                    continue
                if len(text) > 10:
                    title = text[:250]
                    m = AD_NUMBER_RE.search(title)
                    if m:
                        ad_number = m.group(0)
                    break
            if title:
                break
            node = node.parent

        if not title:
            title = "Faculty Recruitment Advertisement"

        # Skip clearly closed ads and Hindi-language duplicates
        if "closed" in title.lower():
            continue
        href_lower = href.lower()
        if "hindi" in href_lower or "_hi." in href_lower:
            continue

        # Deduplicate by ad number — keep only the first (main) PDF per advertisement
        if ad_number and ad_number in seen_ad_numbers:
            continue
        if ad_number:
            seen_ad_numbers.add(ad_number)

        ad = JobAd(
            id="",
            institution_id="__placeholder__",
            ad_number=ad_number,
            title=title,
            post_type=PostType.Faculty,
            contract_status=ContractStatus.Regular,
            category_breakdown=CategoryBreakdown(),
            original_url=abs_url,
            snapshot_fetched_at=fetched_at,
            parse_confidence=0.75,
        )
        ads.append(ad)

    return ads
