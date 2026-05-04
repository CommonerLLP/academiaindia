"""Merge the manual + systematically-crawled corpora into one canonical
manifest, dedupe by (house, q_no, q_date), and re-extract text for the
combined PDF set so the existing corpus_index.py can rebuild over it.

Sources:
  data/*.pdf                              -- the user's manual collection
  data/_sansad_crawl/pdfs/                -- crawled LS PDFs (post-2018)
  data/_sansad_crawl/pdfs_rs/             -- crawled RS PDFs
  data/_sansad_crawl/manifest.jsonl       -- LS manifest
  data/_sansad_crawl/manifest_rs.jsonl    -- RS manifest

Output:
  corpus/parliamentary_corpus.jsonl       -- canonical merged manifest
  corpus/pdfs/                            -- symlinks to all unique PDFs
  corpus/STATS.md                         -- descriptive stats summary
"""
from __future__ import annotations

import hashlib
import json
import os
import shutil
from collections import Counter
from pathlib import Path
from datetime import datetime

ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "corpus"
OUT_PDFS = OUT_DIR / "pdfs_combined"
MANIFEST = OUT_DIR / "parliamentary_corpus.jsonl"
STATS = OUT_DIR / "STATS.md"


def normalize_qkey(house: str | None, qtype: str | None, qno: str | None, date: str | None) -> str:
    """Canonical key for dedup. Ignores subtle name variants."""
    h = (house or "").upper().split()[0][:2] or "XX"  # LO / RA / XX
    q = (qtype or "U").upper()[:1]
    n = str(qno or "X").strip().split(".")[0]
    d = (date or "").strip()[:10]
    return f"{h}|{q}|{n}|{d}"


def consolidate() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    OUT_PDFS.mkdir(exist_ok=True)
    if MANIFEST.exists():
        MANIFEST.unlink()

    seen: dict[str, dict] = {}
    pdfs_added: set[str] = set()

    # 1) LS systematic crawl
    ls_manifest = ROOT / "data" / "_sansad_crawl" / "manifest.jsonl"
    ls_pdfs = ROOT / "data" / "_sansad_crawl" / "pdfs"
    if ls_manifest.exists():
        with ls_manifest.open() as f:
            for line in f:
                try: r = json.loads(line)
                except: continue
                key = normalize_qkey("Lok Sabha", r.get("questiontype"), r.get("questionno"), r.get("date"))
                # locate PDF
                qt = (r.get("questiontype") or "U").upper()[:1]
                qno = r.get("questionno") or "X"
                fname = f"{qt}{qno}_{(r.get('uuid') or '')[:8].replace('-', '')}.pdf"
                pdf_src = ls_pdfs / fname
                rec = {
                    "key": key,
                    "house": "Lok Sabha",
                    "qtype": (r.get("questiontype") or "").strip(),
                    "qno": r.get("questionno"),
                    "date": r.get("date"),
                    "title": r.get("title"),
                    "askers": r.get("members") or [],
                    "ministry": r.get("ministry"),
                    "pdf_path": str(pdf_src.relative_to(ROOT)) if pdf_src.exists() else None,
                    "source": "elibrary.sansad.in",
                    "found_via_query": r.get("found_via_query"),
                    "uuid": r.get("uuid"),
                    "handle": r.get("handle"),
                }
                seen[key] = rec
                if pdf_src.exists() and pdf_src.name not in pdfs_added:
                    pdfs_added.add(pdf_src.name)
                    dst = OUT_PDFS / pdf_src.name
                    if not dst.exists():
                        try:
                            os.symlink(pdf_src.resolve(), dst)
                        except FileExistsError:
                            pass

    # 2) RS systematic crawl
    rs_manifest = ROOT / "data" / "_sansad_crawl" / "manifest_rs.jsonl"
    rs_pdfs = ROOT / "data" / "_sansad_crawl" / "pdfs_rs"
    if rs_manifest.exists():
        with rs_manifest.open() as f:
            for line in f:
                try: r = json.loads(line)
                except: continue
                # RS date is "DD.MM.YYYY"; normalize
                ans_date = r.get("ans_date") or ""
                try:
                    date_iso = datetime.strptime(ans_date, "%d.%m.%Y").strftime("%Y-%m-%d")
                except ValueError:
                    date_iso = (r.get("adate") or "")[:10]
                key = normalize_qkey("Rajya Sabha", r.get("qtype"), r.get("qno"), date_iso)
                pdf_path = r.get("pdf_path")
                rec = {
                    "key": key,
                    "house": "Rajya Sabha",
                    "qtype": (r.get("qtype") or "").strip(),
                    "qno": r.get("qno"),
                    "date": date_iso,
                    "title": r.get("qtitle"),
                    "askers": [r.get("asker")] if r.get("asker") else [],
                    "ministry": r.get("ministry"),
                    "pdf_path": pdf_path,
                    "source": "rsdoc.nic.in",
                    "qslno": r.get("qslno"),
                    "ses_no": r.get("ses_no"),
                }
                # Don't overwrite LS keys with RS — different houses, different keys anyway.
                seen[key] = rec
                if pdf_path:
                    pdf_src = ROOT / pdf_path
                    if pdf_src.exists() and pdf_src.name not in pdfs_added:
                        pdfs_added.add(pdf_src.name)
                        dst = OUT_PDFS / pdf_src.name
                        if not dst.exists():
                            try:
                                os.symlink(pdf_src.resolve(), dst)
                            except FileExistsError:
                                pass

    # 3) Manual collection in /data — symlink PDFs that aren't already present
    manual_pdfs = list((ROOT / "data").glob("*.pdf"))
    manual_added = 0
    for src in manual_pdfs:
        if src.name not in pdfs_added:
            pdfs_added.add(src.name)
            dst = OUT_PDFS / src.name
            if not dst.exists():
                try:
                    os.symlink(src.resolve(), dst)
                    manual_added += 1
                except FileExistsError:
                    pass

    # Write manifest
    with MANIFEST.open("w") as f:
        for rec in seen.values():
            f.write(json.dumps(rec, ensure_ascii=False) + "\n")

    # Stats
    by_house = Counter(r["house"] for r in seen.values())
    by_year = Counter((r.get("date") or "0000")[:4] for r in seen.values())
    by_qtype = Counter(r.get("qtype") or "?" for r in seen.values())
    pdfs_in_corpus = len(list(OUT_PDFS.iterdir()))

    lines = [
        "# Parliamentary corpus — descriptive stats",
        "",
        f"Generated: {datetime.now().isoformat(timespec='seconds')}",
        "",
        f"**Total unique questions in manifest: {len(seen)}**",
        f"**Total PDFs in combined corpus: {pdfs_in_corpus}**",
        f"  (LS systematic: {len(list(ls_pdfs.glob('*.pdf'))) if ls_pdfs.exists() else 0}; RS systematic: {len(list(rs_pdfs.glob('*.pdf'))) if rs_pdfs.exists() else 0}; manual /data: {len(manual_pdfs)})",
        "",
        "## By house",
        "",
        "| House | Questions |",
        "|---|---|",
    ]
    for h, n in by_house.most_common():
        lines.append(f"| {h} | {n} |")
    lines.append("")
    lines.append("## By question type")
    lines.append("")
    lines.append("| Type | Count |")
    lines.append("|---|---|")
    for q, n in by_qtype.most_common():
        lines.append(f"| {q} | {n} |")
    lines.append("")
    lines.append("## By year")
    lines.append("")
    lines.append("| Year | Count |")
    lines.append("|---|---|")
    for y in sorted(by_year):
        lines.append(f"| {y} | {by_year[y]} |")
    STATS.write_text("\n".join(lines) + "\n")

    print(f"Wrote manifest: {MANIFEST}")
    print(f"Wrote stats:    {STATS}")
    print(f"Combined PDFs:  {pdfs_in_corpus}")
    print()
    print("--- BY HOUSE ---")
    for h, n in by_house.most_common(): print(f"  {h:14s} {n}")
    print()
    print("--- BY YEAR ---")
    for y in sorted(by_year): print(f"  {y}  {by_year[y]:4d}")


if __name__ == "__main__":
    consolidate()
