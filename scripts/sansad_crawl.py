"""Systematic crawl of elibrary.sansad.in for parliamentary questions on
faculty vacancy, reservation, and Bahujan exclusion in Indian higher
education. Hits the DSpace-compliant discovery API directly (no headless
browser needed) and downloads PDFs into ``data/_sansad_crawl/``.

API basics (reverse-engineered from the sansad.in Next.js bundle):
  Base: https://elibrary.sansad.in/server/api
  Search:  /discover/search/objects?query=...&f.<facet>=<val>,equals&...
  Item:    /core/items/{uuid}
  Bundles: /core/items/{uuid}/bundles
  Bitstreams of a bundle:   /core/bundles/{uuid}/bitstreams
  PDF blob: /core/bitstreams/{uuid}/content

Strategy:
  - Run a battery of keyword searches that capture the full topical surface:
    faculty vacancy, reservation, SC/ST/OBC, EWS, PwBD, Mission Mode, etc.
  - Filter by category = "Part 1(Questions And Answers)" so we get only Q&A.
  - Filter by ministry = EDUCATION (and optionally HEALTH AND FAMILY WELFARE
    for AIIMS-related questions).
  - Dedupe by item UUID across searches.
  - Save each result's metadata to a manifest and download its PDF.

Usage:
  python scripts/sansad_crawl.py [--limit N] [--include-health] [--no-download]

Output:
  data/_sansad_crawl/
    manifest.jsonl   -- one line per question with full metadata
    pdfs/            -- downloaded PDFs, named {qtype}{qno}_{uuid8}.pdf
    crawl.log        -- progress + errors
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from datetime import datetime
from pathlib import Path
from typing import Iterator
from urllib.parse import urlencode

import requests

ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "data" / "_sansad_crawl"
PDF_DIR = OUT_DIR / "pdfs"
MANIFEST = OUT_DIR / "manifest.jsonl"
LOG = OUT_DIR / "crawl.log"

API_BASE = "https://elibrary.sansad.in/server/api"
HEADERS = {
    "Accept": "application/json",
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 13.0) sansad-research-crawl/1.0",
}

# Keyword searches. Each tuple is (label, query). Designed to capture every
# question on the topical surface — multiple overlapping queries dedupe at
# the item-UUID layer, so over-coverage is cheap.
SEARCHES_EDUCATION = [
    ("faculty-vacancy",         "faculty vacancy"),
    ("teaching-posts-vacant",   "vacant teaching posts"),
    ("reserved-vacancy",        "reserved category vacancy"),
    ("sc-st-obc-faculty",       "SC ST OBC faculty"),
    ("reservation-roster",      "reservation roster"),
    ("cei-rtc-act",             "Central Educational Institutions Reservation Teachers Cadre"),
    ("ews-faculty",             "EWS faculty reservation"),
    ("pwd-faculty",             "PwBD faculty"),
    ("mission-mode-recruitment","Mission Mode recruitment"),
    ("rozgar-mela-faculty",     "Rozgar Mela faculty"),
    ("iit-faculty",             "IIT faculty"),
    ("iim-faculty",             "IIM faculty"),
    ("nit-faculty",             "NIT faculty"),
    ("central-university-faculty","Central University faculty"),
    ("ad-hoc-teachers",         "ad hoc teachers"),
    ("backlog-vacancies",       "backlog vacancies teachers"),
    ("flexi-cadre",             "flexi cadre IIT"),
    ("not-finding-suitable",    "no suitable candidate faculty"),
    ("de-reservation",          "de-reservation faculty posts"),
    ("vice-chancellor-vacant",  "vice chancellor vacant"),
]

SEARCHES_HEALTH = [
    ("aiims-faculty",           "AIIMS faculty vacancy"),
    ("medical-faculty-vacant",  "medical college faculty vacant"),
    ("jipmer-vacancy",          "JIPMER vacancy"),
]

CATEGORY_QA = "Part 1(Questions And Answers)"


def log(msg: str) -> None:
    line = f"[{datetime.now().isoformat(timespec='seconds')}] {msg}"
    print(line)
    LOG.parent.mkdir(parents=True, exist_ok=True)
    with LOG.open("a") as f:
        f.write(line + "\n")


def search_page(session: requests.Session, query: str, ministry: str, page: int, size: int = 100) -> dict:
    """One page of the DSpace discovery search."""
    params = [
        ("query", query),
        ("dsoType", "item"),
        ("page", str(page)),
        ("size", str(size)),
        ("f.ministry", f"{ministry},equals"),
        ("f.category", f"{CATEGORY_QA},equals"),
    ]
    url = f"{API_BASE}/discover/search/objects?" + urlencode(params)
    r = session.get(url, headers=HEADERS, timeout=30)
    r.raise_for_status()
    return r.json()


def search_all(session: requests.Session, query: str, ministry: str, max_results: int = 1000) -> Iterator[dict]:
    """Iterate over every item across all pages of one search."""
    page = 0
    yielded = 0
    while True:
        data = search_page(session, query, ministry, page=page, size=100)
        result = data.get("_embedded", {}).get("searchResult", {})
        objects = result.get("_embedded", {}).get("objects", [])
        if not objects:
            break
        for o in objects:
            item = o.get("_embedded", {}).get("indexableObject")
            if item:
                yield item
                yielded += 1
                if yielded >= max_results:
                    return
        page_meta = result.get("page", {})
        if page + 1 >= page_meta.get("totalPages", 0):
            break
        page += 1
        time.sleep(0.5)  # be polite


def md_value(metadata: dict, key: str, default: str = "") -> str:
    """Pull the first .value from a DSpace metadata key list."""
    arr = metadata.get(key) or []
    if arr and isinstance(arr, list):
        v = arr[0]
        if isinstance(v, dict):
            return v.get("value", default)
    return default


def md_values(metadata: dict, key: str) -> list:
    arr = metadata.get(key) or []
    out = []
    for v in arr:
        if isinstance(v, dict):
            out.append(v.get("value", ""))
    return [x for x in out if x]


def get_pdf_url(session: requests.Session, item_uuid: str) -> str | None:
    """For an item, find the ORIGINAL bundle's primary PDF bitstream."""
    bundles_url = f"{API_BASE}/core/items/{item_uuid}/bundles"
    r = session.get(bundles_url, headers=HEADERS, timeout=20)
    if r.status_code != 200:
        return None
    bundles = r.json().get("_embedded", {}).get("bundles", [])
    original = next((b for b in bundles if b.get("name") == "ORIGINAL"), None)
    if not original:
        return None
    bs_url = original["_links"]["bitstreams"]["href"]
    r2 = session.get(bs_url, headers=HEADERS, timeout=20)
    if r2.status_code != 200:
        return None
    bitstreams = r2.json().get("_embedded", {}).get("bitstreams", [])
    pdf_bs = next((b for b in bitstreams if (b.get("name") or "").lower().endswith(".pdf")), None)
    if not pdf_bs:
        return None
    return pdf_bs["_links"]["content"]["href"]


def slugify(s: str, n: int = 8) -> str:
    return s.replace("-", "")[:n]


def crawl(include_health: bool, max_per_search: int, do_download: bool) -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    PDF_DIR.mkdir(exist_ok=True)
    LOG.write_text("")  # reset
    seen_uuids: set[str] = set()
    if MANIFEST.exists():
        # Resume: load already-crawled UUIDs
        with MANIFEST.open() as f:
            for line in f:
                try:
                    rec = json.loads(line)
                    seen_uuids.add(rec["uuid"])
                except (json.JSONDecodeError, KeyError):
                    pass
        log(f"Resume mode: {len(seen_uuids)} existing entries in manifest")

    session = requests.Session()
    searches = list(SEARCHES_EDUCATION)
    ministries = [("EDUCATION", searches)]
    if include_health:
        ministries.append(("HEALTH AND FAMILY WELFARE", list(SEARCHES_HEALTH)))

    total_new = 0
    for ministry, search_set in ministries:
        log(f"=== Ministry: {ministry} ===")
        for label, query in search_set:
            log(f"  query: '{query}'")
            try:
                count = 0
                for item in search_all(session, query, ministry, max_results=max_per_search):
                    uuid = item.get("uuid")
                    if not uuid or uuid in seen_uuids:
                        continue
                    seen_uuids.add(uuid)
                    md = item.get("metadata", {})
                    record = {
                        "uuid": uuid,
                        "handle": item.get("handle"),
                        "title": md_value(md, "dc.title"),
                        "date": md_value(md, "dc.date.issued"),
                        "questiontype": md_value(md, "dc.identifier.questiontype"),
                        "questionno": md_value(md, "dc.identifier.questionnumber"),
                        "loksabhanumber": md_value(md, "dc.identifier.loksabhanumber"),
                        "session": md_value(md, "dc.identifier.sessionnumber"),
                        "ministry": md_value(md, "dc.relation.ministry"),
                        "members": md_values(md, "dc.contributor.members"),
                        "found_via_query": query,
                        "ministry_facet": ministry,
                        "type": md_value(md, "dc.type"),
                        "uri": md_value(md, "dc.identifier.uri"),
                        "crawled_at": datetime.now().isoformat(timespec="seconds"),
                    }
                    if do_download:
                        try:
                            pdf_url = get_pdf_url(session, uuid)
                            if pdf_url:
                                qtype = (record["questiontype"] or "U").upper()[:1]
                                qno = record["questionno"] or "X"
                                fname = f"{qtype}{qno}_{slugify(uuid)}.pdf"
                                fpath = PDF_DIR / fname
                                if not fpath.exists():
                                    pdf_resp = session.get(pdf_url, headers=HEADERS, timeout=60, stream=True)
                                    if pdf_resp.status_code == 200:
                                        with fpath.open("wb") as f:
                                            for chunk in pdf_resp.iter_content(chunk_size=16384):
                                                f.write(chunk)
                                        record["pdf_path"] = str(fpath.relative_to(ROOT))
                                        record["pdf_url"] = pdf_url
                                else:
                                    record["pdf_path"] = str(fpath.relative_to(ROOT))
                                    record["pdf_url"] = pdf_url
                            else:
                                record["pdf_path"] = None
                                record["pdf_error"] = "no PDF bitstream"
                        except Exception as e:
                            record["pdf_path"] = None
                            record["pdf_error"] = str(e)[:200]
                    with MANIFEST.open("a") as f:
                        f.write(json.dumps(record, ensure_ascii=False) + "\n")
                    count += 1
                    total_new += 1
                    if count % 25 == 0:
                        log(f"    ...{count} new items so far for this query")
                    time.sleep(0.3)  # rate limit
                log(f"    → {count} new items added for query '{query}'")
            except KeyboardInterrupt:
                log("Interrupted by user; manifest saved.")
                return
            except Exception as e:
                log(f"    !! query '{query}' failed: {e}")

    log(f"=== DONE ===")
    log(f"Total new items: {total_new}")
    log(f"Total in manifest: {len(seen_uuids)}")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=500, help="Max results per search query")
    ap.add_argument("--include-health", action="store_true", help="Also crawl Health Ministry questions")
    ap.add_argument("--no-download", action="store_true", help="Build manifest without downloading PDFs")
    args = ap.parse_args()
    crawl(include_health=args.include_health, max_per_search=args.limit, do_download=not args.no_download)


if __name__ == "__main__":
    main()
