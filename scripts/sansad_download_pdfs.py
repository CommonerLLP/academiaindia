"""Download PDFs for items already in the LS manifest, filtered by date.

The manifest.jsonl is built by sansad_crawl.py --no-download. This script
walks it and pulls the PDF for every record on/after --from-date, skipping
any that are already on disk. Resumable.

Usage:
  python scripts/sansad_download_pdfs.py --from-date 2018-01-01
"""
from __future__ import annotations

import argparse
import json
import sys
import time
from datetime import datetime
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "data" / "_sansad_crawl"
PDF_DIR = OUT_DIR / "pdfs"
MANIFEST = OUT_DIR / "manifest.jsonl"
LOG = OUT_DIR / "download.log"

API_BASE = "https://elibrary.sansad.in/server/api"
HEADERS = {
    "Accept": "application/json",
    "User-Agent": "Mozilla/5.0 sansad-research-crawl/1.0",
}


def log(msg: str) -> None:
    line = f"[{datetime.now().isoformat(timespec='seconds')}] {msg}"
    print(line, flush=True)
    with LOG.open("a") as f:
        f.write(line + "\n")


def get_pdf_url(session: requests.Session, item_uuid: str) -> str | None:
    bundles_url = f"{API_BASE}/core/items/{item_uuid}/bundles"
    r = session.get(bundles_url, headers=HEADERS, timeout=30)
    if r.status_code != 200:
        return None
    bundles = r.json().get("_embedded", {}).get("bundles", [])
    original = next((b for b in bundles if b.get("name") == "ORIGINAL"), None)
    if not original:
        return None
    bs_url = original["_links"]["bitstreams"]["href"]
    r2 = session.get(bs_url, headers=HEADERS, timeout=30)
    if r2.status_code != 200:
        return None
    bitstreams = r2.json().get("_embedded", {}).get("bitstreams", [])
    pdf_bs = next((b for b in bitstreams if (b.get("name") or "").lower().endswith(".pdf")), None)
    if not pdf_bs:
        return None
    return pdf_bs["_links"]["content"]["href"]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--from-date", default="2018-01-01", help="ISO date; download only items on/after this")
    args = ap.parse_args()
    cutoff = args.from_date

    PDF_DIR.mkdir(parents=True, exist_ok=True)
    LOG.write_text("")

    records = []
    with MANIFEST.open() as f:
        for line in f:
            try:
                records.append(json.loads(line))
            except json.JSONDecodeError:
                pass

    in_window = [r for r in records if (r.get("date") or "0") >= cutoff]
    log(f"Total in manifest: {len(records)}")
    log(f"Filtered by date >= {cutoff}: {len(in_window)}")

    session = requests.Session()
    ok, skipped, failed = 0, 0, 0
    for i, r in enumerate(in_window, 1):
        uuid = r.get("uuid")
        if not uuid:
            continue
        # Build canonical filename
        qtype = (r.get("questiontype") or "U").upper()[:1]
        qno = r.get("questionno") or "X"
        fname = f"{qtype}{qno}_{uuid[:8].replace('-', '')}.pdf"
        fpath = PDF_DIR / fname
        if fpath.exists() and fpath.stat().st_size > 1000:
            skipped += 1
            continue
        try:
            pdf_url = get_pdf_url(session, uuid)
            if not pdf_url:
                log(f"  [{i}/{len(in_window)}] !! no PDF bitstream for {uuid[:8]} ({r.get('title','?')[:60]})")
                failed += 1
                continue
            resp = session.get(pdf_url, headers=HEADERS, timeout=120, stream=True)
            if resp.status_code != 200:
                log(f"  [{i}/{len(in_window)}] !! HTTP {resp.status_code} for {uuid[:8]}")
                failed += 1
                continue
            with fpath.open("wb") as f:
                for chunk in resp.iter_content(chunk_size=16384):
                    f.write(chunk)
            ok += 1
            if i % 25 == 0 or i == len(in_window):
                log(f"  progress {i}/{len(in_window)}  ok={ok} skipped={skipped} failed={failed}")
            time.sleep(0.3)
        except KeyboardInterrupt:
            log("interrupted; partial download saved")
            return
        except Exception as e:
            log(f"  [{i}/{len(in_window)}] error: {e}")
            failed += 1

    log(f"DONE  ok={ok}  skipped={skipped}  failed={failed}  total_in_window={len(in_window)}")


if __name__ == "__main__":
    main()
