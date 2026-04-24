"""Orchestrator: read registry → fetch each institution → dispatch parser → write archive."""

from __future__ import annotations

import hashlib
import importlib
import json
from dataclasses import dataclass, asdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from fetch import fetch


def stable_id(*parts: str) -> str:
    m = hashlib.sha256()
    for p in parts:
        m.update(p.encode("utf-8"))
        m.update(b"\x00")
    return m.hexdigest()[:16]


@dataclass
class CoverageRow:
    institution_id: str
    parser: str
    fetch_status: str
    http_status: Optional[int]
    ads_found: int
    note: str = ""


def load_registry(path: Path) -> list[dict]:
    return json.loads(path.read_text())


def dispatch_parser(module_name: str):
    """Import parsers.<module_name> and return its `parse` function."""
    full = f"parsers.{module_name}" if not module_name.startswith("parsers.") else module_name
    mod = importlib.import_module(full)
    return mod.parse


def run(registry_path: Path, out_dir: Path, cache_dir: Path, limit: Optional[int] = None) -> dict:
    registry = load_registry(registry_path)
    if limit:
        registry = registry[:limit]

    ads: list[dict] = []
    coverage: list[CoverageRow] = []

    for inst in registry:
        parser_name = inst.get("parser", "generic") or "generic"
        url = inst.get("career_page_url_guess") or ""

        if not url:
            coverage.append(CoverageRow(
                institution_id=inst["id"],
                parser=parser_name,
                fetch_status="no-url",
                http_status=None,
                ads_found=0,
                note="No career-page URL in registry."
            ))
            continue

        result = fetch(url, cache_path=cache_dir)

        if result.status != "ok" or not result.text:
            coverage.append(CoverageRow(
                institution_id=inst["id"],
                parser=parser_name,
                fetch_status=result.status,
                http_status=result.http_status,
                ads_found=0,
                note=result.error or "",
            ))
            continue

        try:
            parse_fn = dispatch_parser(parser_name)
            parsed_ads = parse_fn(result.text, result.final_url or result.url, result.fetched_at)
        except ModuleNotFoundError:
            # Parser module missing → fall back to generic
            try:
                parse_fn = dispatch_parser("generic")
                parsed_ads = parse_fn(result.text, result.final_url or result.url, result.fetched_at)
                parser_name = f"generic (fallback from {parser_name})"
            except Exception as e:
                coverage.append(CoverageRow(
                    institution_id=inst["id"],
                    parser=parser_name,
                    fetch_status="parser-error",
                    http_status=result.http_status,
                    ads_found=0,
                    note=f"fallback failed: {e}"
                ))
                continue
        except Exception as e:
            coverage.append(CoverageRow(
                institution_id=inst["id"],
                parser=parser_name,
                fetch_status="parser-error",
                http_status=result.http_status,
                ads_found=0,
                note=str(e),
            ))
            continue

        for ad in parsed_ads:
            ad_dict = ad.model_dump() if hasattr(ad, "model_dump") else ad.dict()
            ad_dict["institution_id"] = inst["id"]
            # Derive stable id if not set
            if not ad_dict.get("id"):
                ad_dict["id"] = stable_id(inst["id"], ad_dict.get("ad_number") or ad_dict.get("title", ""), str(ad_dict.get("publication_date") or ""))
            ads.append(ad_dict)

        coverage.append(CoverageRow(
            institution_id=inst["id"],
            parser=parser_name,
            fetch_status="ok",
            http_status=result.http_status,
            ads_found=len(parsed_ads),
        ))

    # Serialize
    now = datetime.now(timezone.utc)
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / "archive").mkdir(parents=True, exist_ok=True)

    current_path = out_dir / "current.json"
    archive_path = out_dir / "archive" / f"{now.date().isoformat()}.json"
    coverage_path = out_dir / "coverage_report.json"

    payload = {
        "generated_at": now.isoformat(),
        "ad_count": len(ads),
        "ads": _default_json_encode(ads),
    }
    current_path.write_text(json.dumps(payload, indent=2, ensure_ascii=False, default=str))
    archive_path.write_text(json.dumps(payload, indent=2, ensure_ascii=False, default=str))

    coverage_payload = {
        "generated_at": now.isoformat(),
        "institutions_attempted": len(registry),
        "institutions_succeeded": sum(1 for c in coverage if c.fetch_status == "ok"),
        "institutions_with_ads": sum(1 for c in coverage if c.ads_found > 0),
        "ads_found_total": len(ads),
        "rows": [asdict(c) for c in coverage],
    }
    coverage_path.write_text(json.dumps(coverage_payload, indent=2, ensure_ascii=False, default=str))

    return {
        "ads": len(ads),
        "attempted": len(registry),
        "succeeded": coverage_payload["institutions_succeeded"],
        "with_ads": coverage_payload["institutions_with_ads"],
    }


def _default_json_encode(obj):
    if isinstance(obj, list):
        return [_default_json_encode(x) for x in obj]
    if isinstance(obj, dict):
        return {k: _default_json_encode(v) for k, v in obj.items()}
    return obj


if __name__ == "__main__":
    import argparse
    base = Path(__file__).resolve().parent.parent

    ap = argparse.ArgumentParser()
    ap.add_argument("--registry", default=str(base / "data" / "institutions_registry.json"))
    ap.add_argument("--out", default=str(base / "data"))
    ap.add_argument("--cache", default=str(base / ".cache"))
    ap.add_argument("--limit", type=int, default=None)
    args = ap.parse_args()

    import sys
    sys.path.insert(0, str(Path(__file__).resolve().parent))

    stats = run(Path(args.registry), Path(args.out), Path(args.cache), limit=args.limit)
    print(json.dumps(stats, indent=2))
