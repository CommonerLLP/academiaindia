"""Probe every career-page URL in the registry and record resolution status.

Outputs
- data/registry_verification_report.json : full row-by-row probe results
- data/institutions_registry.verified.json : updated registry with coverage_status
  promoted to 'Stub' for rows that resolved to a 2xx/3xx and whose page contains
  at least one recruitment keyword.

This is the step that earns trust in the registry. Nothing in the pipeline
treats a row as usable until this script has run successfully against it.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from dataclasses import dataclass, asdict
from datetime import datetime, timezone
from pathlib import Path

from fetch import fetch

RECRUITMENT_KEYWORD_RE = re.compile(
    r"recruit|vacanc|advert|faculty|non[- ]?teaching|ministerial|scientist|भर्ती|विज्ञापन|अधिसूचना",
    re.IGNORECASE,
)


@dataclass
class ProbeRow:
    id: str
    url: str
    status: str  # 'ok' | 'robots-blocked' | 'http-error' | 'network-error' | 'no-url'
    http_status: int | None
    final_url: str | None
    page_title: str | None
    has_recruitment_keyword: bool
    error: str | None = None


def extract_title(html: str | None) -> str | None:
    if not html:
        return None
    m = re.search(r"<title[^>]*>(.*?)</title>", html, re.IGNORECASE | re.DOTALL)
    if m:
        return re.sub(r"\s+", " ", m.group(1)).strip()[:200]
    return None


def probe(registry_path: Path, out_dir: Path, cache_dir: Path, limit: int | None = None) -> dict:
    registry = json.loads(registry_path.read_text())
    if limit:
        registry = registry[:limit]

    rows: list[ProbeRow] = []
    for inst in registry:
        url = (inst.get("career_page_url_guess") or "").strip()
        if not url:
            rows.append(ProbeRow(
                id=inst["id"], url="", status="no-url",
                http_status=None, final_url=None, page_title=None,
                has_recruitment_keyword=False,
            ))
            continue

        r = fetch(url, cache_path=cache_dir)
        title = extract_title(r.text)
        has_kw = bool(r.text and RECRUITMENT_KEYWORD_RE.search(r.text))
        rows.append(ProbeRow(
            id=inst["id"], url=url, status=r.status,
            http_status=r.http_status, final_url=r.final_url,
            page_title=title, has_recruitment_keyword=has_kw,
            error=r.error,
        ))

    # Promote verified rows to 'Stub' (or keep 'Active' if already set by parser)
    by_id = {r.id: r for r in rows}
    verified_registry: list[dict] = []
    for inst in registry:
        r = by_id.get(inst["id"])
        if r and r.status == "ok" and r.http_status and r.http_status < 400 and r.has_recruitment_keyword:
            new_status = "Stub"
        elif r and r.status == "ok" and r.http_status and r.http_status < 400:
            new_status = "Stub (no-kw)"
        elif r and r.status == "robots-blocked":
            new_status = "Broken (robots)"
        elif r and r.status == "http-error":
            new_status = f"Broken ({r.http_status})"
        elif r and r.status == "no-url":
            new_status = "Unverified (no URL)"
        else:
            new_status = "Broken (network)"
        updated = {**inst, "coverage_status": new_status, "last_verified": datetime.now(timezone.utc).isoformat()}
        verified_registry.append(updated)

    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / "registry_verification_report.json").write_text(
        json.dumps({"generated_at": datetime.now(timezone.utc).isoformat(), "rows": [asdict(r) for r in rows]}, indent=2)
    )
    (out_dir / "institutions_registry.verified.json").write_text(
        json.dumps(verified_registry, indent=2, ensure_ascii=False)
    )

    summary = {
        "total": len(rows),
        "ok_with_kw": sum(1 for r in rows if r.status == "ok" and r.http_status and r.http_status < 400 and r.has_recruitment_keyword),
        "ok_no_kw": sum(1 for r in rows if r.status == "ok" and r.http_status and r.http_status < 400 and not r.has_recruitment_keyword),
        "http_error": sum(1 for r in rows if r.status == "http-error"),
        "network_error": sum(1 for r in rows if r.status == "network-error"),
        "robots_blocked": sum(1 for r in rows if r.status == "robots-blocked"),
        "no_url": sum(1 for r in rows if r.status == "no-url"),
    }
    return summary


if __name__ == "__main__":
    base = Path(__file__).resolve().parent.parent
    ap = argparse.ArgumentParser()
    ap.add_argument("--registry", default=str(base / "data" / "institutions_registry.json"))
    ap.add_argument("--out", default=str(base / "data"))
    ap.add_argument("--cache", default=str(base / ".cache"))
    ap.add_argument("--limit", type=int, default=None)
    args = ap.parse_args()

    sys.path.insert(0, str(Path(__file__).resolve().parent))

    summary = probe(Path(args.registry), Path(args.out), Path(args.cache), limit=args.limit)
    print(json.dumps(summary, indent=2))
