"""Auto-classify and stub-extract admin notices.

Many "job-ad" PDFs in .cache/job-ad-pdfs/ are not advertisements at all —
they are administrative notices (cancellations, corrigenda, merit lists,
document-verification schedules, FAQs, status updates, etc.) that the
scraper followed because they sit on institutional jobs pages.

These PDFs should produce an extracted JSON file with positions: [] and
a clear classification reason. The dashboard's inject step will then
know there are no positions to merge for the matching ad — but the
existing card (with its title + URL) stays.

This script does NOT use language understanding. It pattern-matches
filenames + first-200-chars against well-known admin/result/notice/
corrigendum vocabulary. Any PDF that does not match falls through to
'manual' (left for direct LLM reading via Claude).

Output: corpus/extracted/{pdf}.json
        with extraction_method: "auto-triage-admin-v1"
             positions: []
             classification: {category, reason}

Run:
  .venv/bin/python scripts/triage_extract_admin.py [--dry-run]
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PDF_DIR = ROOT / ".cache" / "job-ad-pdfs"
TXT_DIR = Path("/tmp/iiti_pdfs")
OUT_DIR = ROOT / "corpus" / "extracted"

ADMIN_FILENAME_PATTERNS = [
    (r"cancellation", "cancellation"),
    (r"corrigendum", "corrigendum"),
    (r"document.verification", "document-verification"),
    (r"reporting.status", "admin-status"),
    (r"merit.list", "merit-list-result"),
    (r"\bresults?\b", "result-notification"),
    (r"frequently.asked", "faq"),
    (r"status.of.administrative", "admin-status"),
    (r"^28a\.-?to-be-uploaded", "admin-misc"),
    (r"^18\.", "admin-misc"),
    (r"document-verification-schedule", "admin-status"),
]

ADMIN_TEXT_PATTERNS = [
    (r"\bcancellation\b.*advertisement", "cancellation"),
    (r"\bcorrigendum\b", "corrigendum"),
    (r"document\s+verification\s+(?:of|schedule)", "document-verification"),
    (r"merit\s+list", "merit-list-result"),
    (r"\bresult\b.*deputy.registrar", "result-notification"),
    (r"frequently\s+asked\s+questions", "faq"),
    (r"reporting\s+status", "admin-status"),
    (r"online\s+applications\s+suce(s)?sfully\s+received", "admin-status"),
]


def classify(filename: str, text: str) -> tuple[str, str] | None:
    """Return (category, reason) if PDF matches an admin pattern, else None."""
    fname_low = filename.lower().replace("_", "-")
    for pat, cat in ADMIN_FILENAME_PATTERNS:
        if re.search(pat, fname_low):
            return cat, f"filename matched /{pat}/"
    text_low = (text or "")[:1500].lower()
    for pat, cat in ADMIN_TEXT_PATTERNS:
        if re.search(pat, text_low):
            return cat, f"first-1500-chars matched /{pat}/"
    return None


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--force", action="store_true",
                        help="Overwrite existing extracted JSONs")
    args = parser.parse_args()

    if not PDF_DIR.exists():
        print(f"ERROR: {PDF_DIR} not found", file=sys.stderr)
        return 1
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    pdfs = sorted(PDF_DIR.glob("*.pdf"))
    classified = manual = skipped = empty_text = 0
    manual_list: list[str] = []

    for pdf in pdfs:
        out_path = OUT_DIR / (pdf.stem + ".json")
        if out_path.exists() and not args.force:
            skipped += 1
            continue

        txt_path = TXT_DIR / (pdf.stem + ".txt")
        text = txt_path.read_text(errors="replace") if txt_path.exists() else ""
        if len(text.strip()) < 50:
            empty_text += 1
            payload = {
                "pdf_filename": pdf.name,
                "extracted_at": datetime.now(timezone.utc).isoformat(),
                "extraction_method": "auto-triage-admin-v1",
                "extraction_confidence": 0.5,
                "structure_family": "other",
                "general_terms": None,
                "positions": [],
                "classification": {
                    "category": "extraction-failed",
                    "reason": "pdftotext returned empty/near-empty output (likely scan-only or corrupt PDF)",
                },
            }
            if not args.dry_run:
                out_path.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n")
            print(f"  ∅ {pdf.name}  — empty text")
            continue

        cls = classify(pdf.name, text)
        if cls is None:
            manual += 1
            manual_list.append(pdf.name)
            continue

        category, reason = cls
        classified += 1
        payload = {
            "pdf_filename": pdf.name,
            "extracted_at": datetime.now(timezone.utc).isoformat(),
            "extraction_method": "auto-triage-admin-v1",
            "extraction_confidence": 0.95,
            "structure_family": "other",
            "general_terms": None,
            "positions": [],
            "classification": {"category": category, "reason": reason},
        }
        if not args.dry_run:
            out_path.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n")
        print(f"  ✓ {pdf.name}  [{category}]")

    print(f"\nclassified-admin: {classified}  empty-text: {empty_text}  "
          f"manual-needed: {manual}  skipped: {skipped}")

    if manual_list:
        manual_log = ROOT / "corpus" / "manual_extraction_queue.txt"
        if not args.dry_run:
            manual_log.write_text("\n".join(manual_list) + "\n")
        print(f"\nmanual queue written to {manual_log.relative_to(ROOT)}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
