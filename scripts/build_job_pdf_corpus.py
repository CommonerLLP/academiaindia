"""Build the local job-ad PDF corpus from docs/data/current.json.

The dashboard data often contains many ads that point to the same rolling
advertisement or annexure PDF. This script deduplicates those PDF URLs,
downloads each unique document once, and writes a manifest that preserves the
ad IDs/institutions/fields that referenced it.

Run:
  python3 scripts/build_job_pdf_corpus.py
  python3 scripts/corpus_index.py --pdf-dir .cache/job-ad-pdfs --corpus-dir corpus/job_ads_index build
"""

from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import re
import sys
import time
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import quote, unquote, urlparse, urlunparse
from urllib.request import Request, urlopen


ROOT = Path(__file__).resolve().parents[1]
CURRENT_JSON = ROOT / "docs" / "data" / "current.json"
OUT_DIR = ROOT / ".cache" / "job-ad-pdfs"
MANIFEST = OUT_DIR / "manifest.jsonl"
PDF_FIELDS = ("original_url", "annexure_pdf_url", "info_url", "apply_url")
LOCAL_PDF_DIRS = (ROOT / ".cache" / "pdfs", ROOT / "sources")
UA = "india-hei-job-tracker/0.1 (+mailto:solanki.aakash@gmail.com)"


def is_pdfish(url: str) -> bool:
    return bool(re.search(r"(?:\.pdf(?:[?#].*)?$|/pdf(?:[?#].*)?$)", url, re.I))


def safe_filename(url: str) -> str:
    parsed = urlparse(url)
    name = Path(unquote(parsed.path)).name or "document.pdf"
    name = re.sub(r"[^A-Za-z0-9._-]+", "_", name).strip("._") or "document.pdf"
    if not name.lower().endswith(".pdf"):
        name += ".pdf"
    stem = name[:-4]
    digest = hashlib.sha256(url.encode("utf-8")).hexdigest()[:12]
    return f"{stem[:90]}__{digest}.pdf"


def quote_url(url: str) -> str:
    parsed = urlparse(url)
    path = quote(unquote(parsed.path), safe="/%")
    query = quote(parsed.query, safe="=&%/:+?,-._~")
    return urlunparse((parsed.scheme, parsed.netloc, path, parsed.params, query, parsed.fragment))


def collect_refs(current_json: Path) -> list[dict[str, Any]]:
    data = json.loads(current_json.read_text(encoding="utf-8"))
    by_url: dict[str, dict[str, Any]] = {}
    for ad in data.get("ads", []):
        for field in PDF_FIELDS:
            url = ad.get(field)
            if not isinstance(url, str) or not is_pdfish(url):
                continue
            rec = by_url.setdefault(
                url,
                {
                    "url": url,
                    "filename": safe_filename(url),
                    "references": [],
                    "status": "pending",
                    "bytes": None,
                    "error": None,
                },
            )
            rec["references"].append(
                {
                    "ad_id": ad.get("id"),
                    "institution_id": ad.get("institution_id"),
                    "field": field,
                    "title": ad.get("title"),
                }
            )
    return sorted(by_url.values(), key=lambda r: r["url"])


def is_excluded_local_pdf(path: Path) -> bool:
    rel = path.relative_to(ROOT)
    parts = set(rel.parts)
    return "_vacancies" in parts


def content_hash(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def collect_local_pdfs(local_dirs: list[Path], out_dir: Path) -> list[dict[str, Any]]:
    existing_hashes = {content_hash(p) for p in out_dir.glob("*.pdf") if p.is_file()}
    records: list[dict[str, Any]] = []
    for local_dir in local_dirs:
        if not local_dir.exists():
            continue
        for src in sorted(local_dir.rglob("*.pdf")):
            if is_excluded_local_pdf(src):
                continue
            digest = content_hash(src)
            if digest in existing_hashes:
                continue
            rel = src.relative_to(ROOT)
            safe_rel = re.sub(r"[^A-Za-z0-9._-]+", "_", str(rel)).strip("._")
            filename = f"local_{safe_rel[:90]}__{digest[:12]}.pdf"
            dest = out_dir / filename
            shutil.copy2(src, dest)
            existing_hashes.add(digest)
            records.append(
                {
                    "url": None,
                    "filename": filename,
                    "path": str(dest.relative_to(ROOT)),
                    "references": [{"source": "local-cache", "path": str(rel)}],
                    "status": "local-cache",
                    "bytes": dest.stat().st_size,
                    "error": None,
                }
            )
    return records


def download(url: str, dest: Path, timeout: int = 45) -> tuple[str, int | None, str | None]:
    if dest.exists() and dest.stat().st_size > 0:
        return "cached", dest.stat().st_size, None
    req = Request(quote_url(url), headers={"User-Agent": UA, "Accept": "application/pdf,*/*"})
    try:
        with urlopen(req, timeout=timeout) as r:
            blob = r.read()
            ctype = r.headers.get("content-type", "")
    except HTTPError as e:
        return "error", None, f"HTTP {e.code}"
    except URLError as e:
        return "error", None, str(e.reason)
    except TimeoutError:
        return "error", None, "timeout"
    except Exception as e:  # noqa: BLE001 - keep corpus build moving across bad institutional URLs.
        return "error", None, f"{type(e).__name__}: {e}"

    if not blob:
        return "error", None, "empty response"
    if not blob.lstrip().startswith(b"%PDF") and "pdf" not in ctype.lower():
        return "error", None, f"not a PDF response ({ctype or 'unknown content-type'})"
    dest.write_bytes(blob)
    return "downloaded", len(blob), None


def write_manifest(records: list[dict[str, Any]], manifest: Path) -> None:
    manifest.parent.mkdir(parents=True, exist_ok=True)
    with manifest.open("w", encoding="utf-8") as f:
        for rec in records:
            f.write(json.dumps(rec, ensure_ascii=False) + "\n")


def main() -> None:
    ap = argparse.ArgumentParser(description="Download/index-source job-ad PDFs referenced by current.json.")
    ap.add_argument("--current-json", type=Path, default=CURRENT_JSON)
    ap.add_argument("--out-dir", type=Path, default=OUT_DIR)
    ap.add_argument("--delay", type=float, default=0.5, help="Delay between downloads in seconds.")
    ap.add_argument("--manifest-only", action="store_true", help="Write manifest without downloading.")
    ap.add_argument(
        "--local-pdf-dir",
        action="append",
        type=Path,
        default=list(LOCAL_PDF_DIRS),
        help="Local job-PDF directory to fold in; may be repeated. Defaults to .cache/pdfs and sources/.",
    )
    args = ap.parse_args()

    out_dir = args.out_dir
    manifest = out_dir / "manifest.jsonl"
    out_dir.mkdir(parents=True, exist_ok=True)

    records = collect_refs(args.current_json)
    for i, rec in enumerate(records, 1):
        dest = out_dir / rec["filename"]
        rec["path"] = str(dest.relative_to(ROOT))
        if args.manifest_only:
            rec["status"] = "manifest-only"
            rec["bytes"] = dest.stat().st_size if dest.exists() else None
            continue
        status, nbytes, error = download(rec["url"], dest)
        rec["status"] = status
        rec["bytes"] = nbytes
        rec["error"] = error
        print(f"[{i}/{len(records)}] {status:10s} {rec['filename']} {error or ''}", file=sys.stderr)
        if status == "downloaded" and args.delay > 0:
            time.sleep(args.delay)

    if not args.manifest_only:
        records.extend(collect_local_pdfs([p.resolve() for p in args.local_pdf_dir], out_dir))

    write_manifest(records, manifest)
    counts: dict[str, int] = {}
    for rec in records:
        counts[rec["status"]] = counts.get(rec["status"], 0) + 1
    print(json.dumps({"unique_pdf_urls": len(records), "counts": counts, "manifest": str(manifest)}, indent=2))


if __name__ == "__main__":
    main()
