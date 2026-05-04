"""Systematic crawl of Rajya Sabha questions on faculty vacancy / reservation.

The RS digital archive is at rsdoc.nic.in (separate from the LS API at
elibrary.sansad.in). It exposes a thinly-wrapped database query interface:

  GET https://rsdoc.nic.in/Question/Search_Questions?whereclause=<sql>

The whereclause is essentially a SQL fragment over a question table with
columns: ses_no, qno, qtype, ans_date, name (asker), min_name (ministry),
qn_text, ans_text, files (PDF URL), etc.

Strategy:
  1. Iterate over recent sessions (range covers Sep 2020 → Mar 2026 ≈
     sessions 252–267 based on RS sitting calendar).
  2. For each session, query Education ministry questions, then filter
     client-side by keyword in qn_text/qtitle.
  3. Save manifest + download PDFs into data/_sansad_crawl/pdfs_rs/.

Output:
  data/_sansad_crawl/manifest_rs.jsonl
  data/_sansad_crawl/pdfs_rs/
  data/_sansad_crawl/rs_crawl.log
"""
from __future__ import annotations

import argparse
import json
import re
import time
from datetime import datetime
from pathlib import Path
from urllib.parse import urlencode

import requests

ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "data" / "_sansad_crawl"
PDF_DIR = OUT_DIR / "pdfs_rs"
MANIFEST = OUT_DIR / "manifest_rs.jsonl"
LOG = OUT_DIR / "rs_crawl.log"

API_SEARCH = "https://rsdoc.nic.in/Question/Search_Questions"
HEADERS = {
    "Accept": "application/json",
    "User-Agent": "Mozilla/5.0 sansad-research-crawl/1.0",
    "Origin": "https://sansad.in",
    "Referer": "https://sansad.in/",
}

# Sessions covering Sep 2020 → Mar 2026.
# Rajya Sabha sittings: ~3 sessions/year. Session 252 = winter 2020.
# Session 267 = budget 2026.
SESSIONS = list(range(252, 268))  # 252..267 inclusive

# Education-related ministry name variations as they appear in RS records.
# Tried EDUCATION first; if zero hits, fall through.
MINISTRY_LIKES = ["EDUCATION", "HUMAN RESOURCE DEVELOPMENT"]

# Keywords used to filter qn_text / qtitle client-side (case-insensitive).
KEYWORDS = re.compile(
    r"\b("
    r"faculty\s+vacanc|"
    r"vacant\s+(teaching|faculty)|"
    r"teaching\s+post|"
    r"reservation|"
    r"reserved\s+categor|"
    r"SC[/\s]+ST|"
    r"OBC|"
    r"EWS|"
    r"PwBD|PwD|"
    r"Mission\s+Mode|"
    r"Rozgar\s+Mela|"
    r"recruitment\s+drive|"
    r"backlog|"
    r"flexi[\s-]?cadre|"
    r"ad[\s-]?hoc\s+(faculty|teacher)|"
    r"central\s+universit|"
    r"\bIIT\b|\bIIM\b|\bNIT\b|\bIIIT\b|\bIISER\b|"
    r"de[-\s]?reservation|"
    r"vice[\s-]?chancellor"
    r")",
    re.I,
)


def log(msg: str) -> None:
    line = f"[{datetime.now().isoformat(timespec='seconds')}] {msg}"
    print(line, flush=True)
    LOG.parent.mkdir(parents=True, exist_ok=True)
    with LOG.open("a") as f:
        f.write(line + "\n")


def search_session(session: requests.Session, ses_no: int, ministry_like: str) -> list[dict]:
    """Query one session for questions to a given ministry."""
    where = f"ses_no={ses_no} and min_name like '{ministry_like}%'"
    r = session.get(API_SEARCH, params={"whereclause": where}, headers=HEADERS, timeout=60)
    r.raise_for_status()
    data = r.json()
    if isinstance(data, dict):
        return data.get("data", []) or []
    if isinstance(data, list):
        return data
    return []


def matches_keywords(record: dict) -> bool:
    blob = " ".join(filter(None, [
        record.get("qtitle") or "",
        record.get("qn_text") or "",
    ]))
    return bool(KEYWORDS.search(blob))


def slugify(qno, qtype, qslno) -> str:
    qt = (qtype or "U").strip().upper()[:1]
    return f"{qt}{int(qno) if qno else 'X'}_{qslno}"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--sessions", default=",".join(map(str, SESSIONS)),
                    help="Comma-separated session numbers to crawl")
    ap.add_argument("--no-download", action="store_true")
    args = ap.parse_args()
    sessions = [int(s) for s in args.sessions.split(",") if s.strip()]

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    PDF_DIR.mkdir(exist_ok=True)
    LOG.write_text("")

    seen_qslno = set()
    if MANIFEST.exists():
        with MANIFEST.open() as f:
            for line in f:
                try:
                    seen_qslno.add(json.loads(line).get("qslno"))
                except (json.JSONDecodeError, KeyError):
                    pass
        log(f"Resume mode: {len(seen_qslno)} existing entries in manifest")

    sess = requests.Session()
    total_kept, total_dropped, total_pdfs_ok, total_pdfs_failed = 0, 0, 0, 0

    for ses_no in sessions:
        for ministry in MINISTRY_LIKES:
            log(f"=== session {ses_no}, ministry like '{ministry}%' ===")
            try:
                records = search_session(sess, ses_no, ministry)
            except Exception as e:
                log(f"  !! search failed: {e}")
                continue
            log(f"  raw: {len(records)} records returned")
            for r in records:
                qslno = r.get("qslno")
                if not qslno or qslno in seen_qslno:
                    continue
                if not matches_keywords(r):
                    total_dropped += 1
                    continue
                seen_qslno.add(qslno)
                rec = {
                    "qslno":       qslno,
                    "ses_no":      r.get("ses_no"),
                    "qno":         r.get("qno"),
                    "qtype":       (r.get("qtype") or "").strip(),
                    "qtitle":      r.get("qtitle"),
                    "ans_date":    r.get("ans_date"),
                    "asker":       r.get("name"),
                    "ministry":    (r.get("min_name") or "").strip(),
                    "qn_text":     r.get("qn_text"),
                    "ans_text":    r.get("ans_text"),
                    "pdf_url":     r.get("files"),
                    "pdf_url_hindi": r.get("hindifiles"),
                    "status":      (r.get("status") or "").strip(),
                    "found_via":   ministry,
                    "house":       "Rajya Sabha",
                    "crawled_at":  datetime.now().isoformat(timespec="seconds"),
                }
                if not args.no_download and rec["pdf_url"]:
                    fname = slugify(rec["qno"], rec["qtype"], rec["qslno"]) + ".pdf"
                    fpath = PDF_DIR / fname
                    if not fpath.exists() or fpath.stat().st_size < 1000:
                        try:
                            pdf_resp = sess.get(rec["pdf_url"], headers=HEADERS, timeout=60, stream=True)
                            if pdf_resp.status_code == 200:
                                with fpath.open("wb") as f:
                                    for chunk in pdf_resp.iter_content(chunk_size=16384):
                                        f.write(chunk)
                                rec["pdf_path"] = str(fpath.relative_to(ROOT))
                                total_pdfs_ok += 1
                            else:
                                rec["pdf_error"] = f"HTTP {pdf_resp.status_code}"
                                total_pdfs_failed += 1
                        except Exception as e:
                            rec["pdf_error"] = str(e)[:200]
                            total_pdfs_failed += 1
                    else:
                        rec["pdf_path"] = str(fpath.relative_to(ROOT))
                with MANIFEST.open("a") as f:
                    f.write(json.dumps(rec, ensure_ascii=False) + "\n")
                total_kept += 1
                time.sleep(0.25)
            time.sleep(1)
        time.sleep(0.5)

    log(f"=== DONE ===")
    log(f"Sessions crawled: {len(sessions)}")
    log(f"Total Education-ministry questions kept (keyword-matched): {total_kept}")
    log(f"Dropped (didn't match keywords): {total_dropped}")
    log(f"PDFs downloaded: {total_pdfs_ok}, failed: {total_pdfs_failed}")


if __name__ == "__main__":
    main()
