"""Site-specific parser for IIT Delhi recruitment page.

Target: https://home.iitd.ac.in/jobs.php

Notes / honesty
- This parser was written against the author's MEMORY of IIT-Delhi's recruitment
  page structure. It has NOT been validated against the live page at build time.
- If the page structure has changed, this parser will either return zero ads
  (no-op, safe) or raise a ParseError (caught by the orchestrator). The generic
  parser serves as fallback.
- When you validate against the live site, update `parse_confidence` and the
  structural selectors below.
"""

from __future__ import annotations

import re
from datetime import datetime
from urllib.parse import urljoin

from bs4 import BeautifulSoup

from schema import JobAd, PostType, ContractStatus, CategoryBreakdown


def parse(html: str, url: str, fetched_at: datetime) -> list[JobAd]:
    soup = BeautifulSoup(html, "html.parser")
    ads: list[JobAd] = []

    # IIT-D jobs.php has historically had a table listing advertisements.
    # The rows typically contain: Advertisement No. | Title | PDF link | Closing Date
    # We look for tables and extract rows that look structured.
    for table in soup.find_all("table"):
        for tr in table.find_all("tr"):
            # Skip rows that are entirely <th> cells (header rows)
            if tr.find("th") and not tr.find("td"):
                continue
            cells = [td.get_text(" ", strip=True) for td in tr.find_all(["td", "th"])]
            if len(cells) < 2:
                continue

            # Look for a PDF link in this row
            pdf_a = None
            for a in tr.find_all("a", href=True):
                if a["href"].lower().endswith(".pdf"):
                    pdf_a = a
                    break

            title = cells[1] if len(cells) > 1 else cells[0]
            if not title or len(title) < 5:
                continue

            ad_number = cells[0] if re.search(r"(Advt|Advertisement|Ref)", cells[0], re.IGNORECASE) else None

            # Closing date usually in last cell
            closing_raw = cells[-1]
            closing = _parse_date(closing_raw)

            original_url = urljoin(url, pdf_a["href"]) if pdf_a else url

            post_type = PostType.Faculty if re.search(r"faculty|professor", title, re.IGNORECASE) else PostType.Unknown
            contract = ContractStatus.Regular if re.search(r"regular|permanent", title, re.IGNORECASE) else ContractStatus.Unknown

            ad = JobAd(
                id="",  # orchestrator fills
                institution_id="__placeholder__",
                ad_number=ad_number,
                title=title[:250],
                post_type=post_type,
                contract_status=contract,
                category_breakdown=CategoryBreakdown(),
                closing_date=closing,
                original_url=original_url,
                snapshot_fetched_at=fetched_at,
                parse_confidence=0.6,  # structured-table extraction → higher confidence than generic
                raw_text_excerpt=" | ".join(cells)[:500],
            )
            ads.append(ad)

    return ads


_DATE_RE = re.compile(r"(\d{1,2})[\s\.\-/]+([A-Za-z]{3,9}|\d{1,2})[\s\.\-/]+(20\d{2})")
_MONTHS = {m: i for i, m in enumerate(
    ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"], start=1)}


def _parse_date(s: str) -> str | None:
    m = _DATE_RE.search(s)
    if not m:
        return None
    try:
        d = int(m.group(1))
        mo_s = m.group(2).lower()[:3]
        mo = _MONTHS.get(mo_s) or (int(m.group(2)) if m.group(2).isdigit() else None)
        y = int(m.group(3))
        if mo and 1 <= mo <= 12 and 1 <= d <= 31 and 2015 <= y <= 2035:
            return f"{y:04d}-{mo:02d}-{d:02d}"
    except Exception:
        return None
    return None
