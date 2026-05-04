"""Parser for the UGC Central Universities Recruitment Portal (CU-REC).

Target JSON API: http://curec.samarth.ac.in/index.php/search/default/search

Returns all currently-advertised positions across all 48 central universities
in a single API call. The response is JSON (not HTML), so this parser does not
use BeautifulSoup.

Architecture note: unlike other parsers, this one sets institution_id from the
API payload rather than using "__placeholder__". run.py is patched to preserve
non-placeholder values.
"""

from __future__ import annotations

import json
import re
from datetime import datetime, date
from typing import Optional
from urllib.parse import quote

from schema import JobAd, PostType, ContractStatus, CategoryBreakdown

# Maps API institution_id (full name) → registry slug
INST_NAME_TO_SLUG: dict[str, str] = {
    "Aligarh Muslim University": "amu",
    "Assam University": "assam-univ",
    "Babasaheb Bhimrao Ambedkar University": "bbau",
    "Banaras Hindu University": "bhu",
    "Central Sanskrit University": "central-sanskrit-univ",
    "Central Tribal University of Andhra Pradesh": "ctua-ap",
    "Central University of Andhra Pradesh": "cu-andhra-pradesh",
    "Central University of Gujarat": "cu-gujarat",
    "Central University of Haryana": "cu-haryana",
    "Central University of Himachal Pradesh": "cu-himachal-pradesh",
    "Central University of Jammu": "cu-jammu",
    "Central University of Jharkhand": "cu-jharkhand",
    "Central University of Karnataka": "cu-karnataka",
    "Central University of Kashmir": "cu-kashmir",
    "Central University of Kerala": "cu-kerala",
    "Central University of Odisha": "cu-odisha",
    "Central University of Punjab": "cu-punjab",
    "Central University of Rajasthan": "cu-rajasthan",
    "Central University of South Bihar": "cu-south-bihar",
    "Dr. Harisingh Gour Vishwavidyalaya": "harisingh-gour-univ",
    "Guru Ghasidas Vishwavidyalaya": "ggv",
    "Hemvati Nandan Bahuguna Garhwal University": "hnbgu",
    "Indira Gandhi National Open University": "ignou",
    "Jamia Millia Islamia": "jmi",
    "Jawaharlal Nehru University": "jnu",
    "Kendriya Hindi Sansthan": "kendriya-hindi-sansthan",
    "Mahatma Gandhi Antarrashtriya Hindi VishwaVidyalaya": "mgahv",
    "Mahatma Gandhi Central University": "mgcu",
    "Manipur University": "manipur-univ",
    "Maulana Azad National Urdu University": "manuu",
    "Mizoram University": "mizoram-univ",
    "Nagaland University": "nagaland-univ",
    "National Sanskrit University": "national-sanskrit-univ",
    "North Eastern Hill University": "nehu",
    "Pondicherry University": "pondicherry-univ",
    "Rajiv Gandhi University": "rgu-arunachal",
    "Shri Lal Bahadur Shastri National Sanskrit University": "slbsnsu",
    "Sikkim University": "sikkim-univ",
    "Sindhu Central University": "sindhu-cu",
    "Tezpur University": "tezpur-univ",
    "The English and Foreign Languages University": "eflu",
    "The Indira Gandhi National Tribal University": "igntu",
    "Tripura University": "tripura-univ",
    "University of Allahabad": "univ-allahabad",
    "University of Hyderabad": "uoh",
    "Visva Bharati University": "visva-bharati",
}

POST_TYPE_MAP = {
    "Teaching": PostType.Faculty,
    "Non-Teaching": PostType.NonFaculty,
    "Administrative": PostType.Administrative,
}

CONTRACT_MAP = {
    "Permanent": ContractStatus.Regular,
    "Regular": ContractStatus.Regular,
    "Contractual": ContractStatus.Contractual,
    "Contract": ContractStatus.Contractual,
    "Tenure Track": ContractStatus.TenureTrack,
    "Tenure track": ContractStatus.TenureTrack,
    "Temporary": ContractStatus.AdHoc,
    "Ad-hoc": ContractStatus.AdHoc,
    "Adhoc": ContractStatus.AdHoc,
}

SEARCH_BASE = "https://curec.samarth.ac.in/index.php/search/site/search"


def _slugify(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")


def _parse_date(s: Optional[str]) -> Optional[date]:
    if not s:
        return None
    for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d"):
        try:
            return datetime.strptime(s.strip(), fmt).date()
        except ValueError:
            continue
    return None


def parse(text: str, url: str, fetched_at: datetime) -> list[JobAd]:
    try:
        payload = json.loads(text)
    except json.JSONDecodeError:
        return []

    records = payload.get("data", [])
    if not records:
        return []

    ads: list[JobAd] = []
    for rec in records:
        inst_name: str = rec.get("institution_id", "")
        if not inst_name:
            continue

        inst_slug = INST_NAME_TO_SLUG.get(inst_name) or _slugify(inst_name)

        cadre = rec.get("cadre", "")
        post_type = POST_TYPE_MAP.get(cadre, PostType.Unknown)

        position_type = rec.get("position_type", "")
        contract_status = CONTRACT_MAP.get(position_type, ContractStatus.Unknown)

        api_id: str = rec.get("id", "")
        post_no: str = rec.get("postNo", "")
        ad_code: str = rec.get("code", "")

        title = rec.get("post", "")
        dept = rec.get("department", "")

        original_url = (
            f"{SEARCH_BASE}?University={quote(inst_name)}"
        )

        raw_excerpt = f"{ad_code} | {dept} | {rec.get('pay_level','')} | {position_type} | {cadre}"

        ad = JobAd(
            id=api_id[:16] if api_id else "",
            institution_id=inst_slug,
            ad_number=f"{post_no} ({ad_code[:80]})" if post_no else ad_code[:80] or None,
            title=title,
            department=dept or None,
            post_type=post_type,
            contract_status=contract_status,
            number_of_posts=rec.get("totalVacancies"),
            pay_scale=rec.get("pay_level"),
            publication_date=_parse_date(rec.get("startDate")),
            closing_date=_parse_date(rec.get("closeDate")),
            original_url=original_url,
            snapshot_fetched_at=fetched_at,
            parse_confidence=0.9,
            raw_text_excerpt=raw_excerpt[:500],
        )
        ads.append(ad)

    return ads
