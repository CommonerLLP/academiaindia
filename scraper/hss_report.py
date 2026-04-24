"""Post-sweep reporting: coverage summary + HSS classifier over data/current.json.

Extracted from .github/workflows/daily-sweep.yml so the logic has a single home
and can be invoked locally without the CI scaffolding.

Usage:
    python scraper/hss_report.py              # both reports
    python scraper/hss_report.py coverage     # coverage only
    python scraper/hss_report.py hss          # HSS classification only
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = REPO_ROOT / "data"

HSS_POS = [
    r"\bsociolog", r"\banthropolog", r"\bdevelopment\s+stud",
    r"\bscience\s+(and|&)\s+technology\s+stud", r"\bSTS\b",
    r"\btechnology[-\s]+in[-\s]+society", r"\bdigital\s+societ",
    r"\bmulti[-\s]?species\s+ethnograph", r"\bcaste\s+stud",
    r"\bdevelopment,?\s+technology,?\s+and\s+society",
    r"\bSoPP\b", r"\bADCPS\b", r"\bC[-\s]?TARA\b",
    r"\bSchool\s+of\s+Public\s+Policy",
    r"\bAshank\s+Desai\s+Centre\s+for\s+Policy",
    r"\bCentre\s+for\s+Technology\s+Alternatives\s+for\s+Rural",
]

HSS_NEG = [
    r"\bnon[-\s]?teaching", r"\bregistrar\b", r"\bengineer",
    r"\bchemistry\b", r"\bmathematics\b", r"\bphysics\b",
    r"\beconomics?\b", r"\bliterature", r"\bpsycholog",
    r"\bmanagement\s+stud", r"\bfinance\b",
]

FACULTY_HINT = r"\bfaculty\b|\bassistant\s+professor\b|\bprofessor\b"


def classify(ad: dict) -> str:
    """Return 'hss' | 'ambiguous' | 'excluded' for a single ad record.

    HSS_NEG overrides faculty-hint ambiguity: a registrar post that happens to
    mention 'professor' in boilerplate is out-of-scope, not ambiguous.
    """
    fields = [ad.get("title"), ad.get("ad_number"), ad.get("department"),
              ad.get("discipline"), ad.get("raw_text_excerpt")]
    hay = " | ".join(str(v) for v in fields if v)
    if any(re.search(p, hay, re.IGNORECASE) for p in HSS_POS):
        return "hss"
    if any(re.search(p, hay, re.IGNORECASE) for p in HSS_NEG):
        return "excluded"
    if re.search(FACULTY_HINT, hay, re.IGNORECASE):
        return "ambiguous"
    return "excluded"


def coverage_summary(path: Path = DATA_DIR / "coverage_report.json") -> None:
    if not path.exists():
        print(f"no coverage_report.json at {path}")
        return
    d = json.loads(path.read_text())
    print(
        f"attempted={d.get('institutions_attempted')} "
        f"succeeded={d.get('institutions_succeeded')} "
        f"with_ads={d.get('institutions_with_ads')} "
        f"ads={d.get('ads_found_total')}"
    )
    failures = [r for r in d.get("rows", []) if r.get("fetch_status") != "ok"]
    if failures:
        print("\nParser failures (if any):")
        for r in failures:
            print(
                f"  {r['institution_id']} [{r['parser']}] "
                f"{r['fetch_status']} http={r.get('http_status')} "
                f"ads={r['ads_found']} note={r.get('note','')}"
            )


def hss_summary(path: Path = DATA_DIR / "current.json") -> None:
    if not path.exists():
        print(f"no current.json at {path}")
        return
    current = json.loads(path.read_text())
    ads = current.get("ads", [])
    counts = {"hss": 0, "ambiguous": 0, "excluded": 0}
    hss_lines: list[str] = []
    for a in ads:
        c = classify(a)
        counts[c] += 1
        if c == "hss":
            hss_lines.append(
                f"  [{a['institution_id']}] {a['title'][:100]} "
                f"(closes: {a.get('closing_date') or 'rolling'})"
            )
    print(f'=== HSS summary for {current.get("generated_at")} ===')
    print(
        f'total: {len(ads)} · HSS: {counts["hss"]} · '
        f'ambiguous: {counts["ambiguous"]} · out-of-scope: {counts["excluded"]}'
    )
    if hss_lines:
        print("\nHSS-match records:")
        for line in hss_lines:
            print(line)


def main(argv: list[str]) -> int:
    target = argv[1] if len(argv) > 1 else "all"
    if target in ("coverage", "all"):
        coverage_summary()
        if target == "all":
            print()
    if target in ("hss", "all"):
        hss_summary()
    if target not in ("coverage", "hss", "all"):
        print(f"unknown subcommand: {target} (expected: coverage | hss | all)", file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
