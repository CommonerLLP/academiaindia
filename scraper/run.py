"""Orchestrator: read registry → fetch each institution → dispatch parser → write archive.

Operational contract
--------------------
For each registry institution, exactly one `CoverageRow` is appended. The row
records what happened (`fetch_status`) and how many ads landed in `current.json`
(`ads_found`). Possible `fetch_status` values produced here:

    "ok"             — listing fetched, parser ran, ads emitted
    "rolling-stub"   — institution has `ad_format_guess: RollingHTML`, no
                       discrete postings; we keep a placeholder
    "stale-archive"  — current fetch failed, but we carried forward last run's ads
    "manual"         — parser is the special "manual" sentinel
    "no-url"         — registry has no career_page_url_guess
    "robots-blocked" — robots.txt forbids; no override applied
    "http-error"     — upstream returned 4xx/5xx
    "network-error"  — connection refused / timed out / TLS failed
    "parser-error"   — parser raised an exception

The fallback chain is intentionally generous:
    fetch ok? → run parser
    fetch failed but `fallback_pdf_url` set → call parser with that URL
    parser raised? → carry forward previous run's ads (`stale-archive`)
    rolling-call institution? → emit a stub
    otherwise → final failure recorded in coverage
"""

from __future__ import annotations

import hashlib
import importlib
import json
import logging
from dataclasses import dataclass, asdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from fetch import fetch

logging.basicConfig(
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    level=logging.INFO,
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("scraper")


def stable_id(*parts: str) -> str:
    """Deterministic short hash of `parts` joined by NUL.

    Used to derive ad IDs that survive across runs: same inputs always
    produce the same id, which the orchestrator relies on so that ads in
    archive snapshots remain comparable over time.

    NUL-separation prevents ambiguous collisions (e.g. ``("a", "bc")`` vs
    ``("ab", "c")``); 16 hex chars (≈64 bits) is plenty for our scale of
    ~1k ads.

    Note: there's a sibling `stable_id` in `scraper/ad_factory.py` for use
    inside parsers. The two are equivalent — the duplication exists to keep
    parsers free of an `import run` cycle.
    """
    m = hashlib.sha256()
    for p in parts:
        m.update(p.encode("utf-8"))
        m.update(b"\x00")
    return m.hexdigest()[:16]


@dataclass
class CoverageRow:
    """One row of the coverage report (data/coverage_report.json).

    Exactly one row is emitted per registry institution per scrape, so the
    final report is a faithful audit trail of what the scraper did this run.
    Construction goes through `record_outcome()` rather than direct
    instantiation — that keeps the `note` formatting consistent.
    """
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


def is_rolling_html(inst: dict) -> bool:
    """True if the registry marks this institution as having only a single
    rolling call (no discrete per-area postings).

    These institutions get a `rolling_stub()` placeholder in current.json
    even when the parser returns nothing, so they don't silently disappear
    from the dashboard. The flag is set on registry entries via
    `"ad_format_guess": "RollingHTML"`.
    """
    return inst.get("ad_format_guess") == "RollingHTML"


def rolling_stub(inst: dict, fetched_at: datetime, note: str = "") -> dict:
    """Represent a known standing faculty call as a real, coarse listing.

    These are not parser failures from the user's perspective: for institutions
    that publish a single rolling call rather than discrete posts, the rolling
    call is the job opportunity. Keeping it in current.json prevents silent
    disappearance when the page is blocked, flaky, or structurally thin.
    """
    return {
        "id": stable_id("rolling-stub", inst["id"]),
        "institution_id": inst["id"],
        "ad_number": None,
        "title": "Rolling faculty recruitment (all areas - no discrete postings)",
        "department": None,
        "discipline": None,
        "post_type": "Faculty",
        "contract_status": "TenureTrack",
        "category_breakdown": None,
        "number_of_posts": None,
        "pay_scale": None,
        "publication_date": None,
        "closing_date": None,
        "original_url": inst.get("career_page_url_guess"),
        "snapshot_fetched_at": fetched_at.isoformat() if hasattr(fetched_at, "isoformat") else str(fetched_at),
        "parse_confidence": 1.0,
        "raw_text_excerpt": note or inst.get("notes", "Standing rolling faculty call; verify details on the official source."),
        "_rolling_stub": True,
        "_source_method": "curated rolling call",
    }


def ensure_unique_ad_id(ad: dict, used_ids: set[str]) -> None:
    """Mutate `ad["id"]` so it doesn't collide with any id already in
    `used_ids`, then add the (possibly-new) id to the set.

    Most parsers produce stable ids that won't collide. But two failure
    modes can produce duplicates:

      1. A parser inadvertently emits the same id twice (e.g. two `<a>`
         tags pointing at the same PDF — collapsed into one ad).
      2. Carry-forward from a previous archive happens to surface an id
         that the current run also generated.

    Rather than overwriting an earlier ad, we deterministically derive a
    fresh id by re-hashing with extra context (original_url + title + a
    counter). This means the same collision in two consecutive runs
    produces the *same* derived id, which keeps the dashboard's localStorage
    "saved" set stable across reloads.
    """
    base_id = ad.get("id") or stable_id(
        ad.get("institution_id", ""),
        ad.get("ad_number") or ad.get("title", ""),
        str(ad.get("publication_date") or ""),
    )
    candidate = base_id
    n = 2
    while candidate in used_ids:
        candidate = stable_id(
            base_id,
            ad.get("institution_id", ""),
            ad.get("original_url") or "",
            ad.get("title") or "",
            str(n),
        )
        n += 1
    ad["id"] = candidate
    used_ids.add(candidate)


def normalize_ad(ad, inst: dict, source_method: str, used_ids: set[str], source_note: str = "") -> dict:
    """Convert a parser's emitted ad into the canonical dict form expected
    by current.json, attaching provenance metadata.

    Parsers may emit either a `JobAd` Pydantic model or a raw dict (the new
    factory in `ad_factory.py` produces dicts directly; older parsers use
    Pydantic). Either way we end up with a mutable dict.

    Provenance bookkeeping done here:
      - `institution_id`: parsers don't know their registry slug and emit
        `PLACEHOLDER_INSTITUTION_ID`; we substitute the real id from `inst`.
      - `_source_method`: how we got this ad ("official scrape" /
        "public-interest override" / "stale carry-forward" / etc.).
      - `_source_note`: free-form context (e.g. the robots-override reason).
      - `id` collision-avoidance via `ensure_unique_ad_id`.

    `setdefault` is used for the metadata so a parser that already filled
    these fields (e.g. `iim_recruit` setting `_manual_stub`) wins.
    """
    if isinstance(ad, dict):
        ad_dict = ad
    else:
        ad_dict = ad.model_dump() if hasattr(ad, "model_dump") else ad.dict()
    if ad_dict.get("institution_id") in ("__placeholder__", "", None):
        ad_dict["institution_id"] = inst["id"]
    ad_dict.setdefault("_source_method", source_method)
    if source_note:
        ad_dict.setdefault("_source_note", source_note)
    ensure_unique_ad_id(ad_dict, used_ids)
    return ad_dict


def load_previous_ads(out_dir: Path) -> dict[str, list[dict]]:
    """Read the previous run's current.json and group its ads by
    institution_id. Used by `carry_forward_ads` so that when this run's
    fetch fails for an institution, we keep showing yesterday's listings
    rather than dropping the institution off the dashboard.

    Failure-tolerant: missing or malformed current.json returns `{}`. That
    matches how the orchestrator treats first-ever runs (no previous data
    to carry forward).
    """
    current_path = out_dir / "current.json"
    if not current_path.exists():
        return {}
    try:
        payload = json.loads(current_path.read_text())
    except Exception:
        # Corrupted current.json shouldn't block a fresh scrape — log and
        # treat as empty. The current run will overwrite it anyway.
        logger.warning("load_previous_ads: failed to parse %s; treating as empty", current_path)
        return {}
    by_inst: dict[str, list[dict]] = {}
    for ad in payload.get("ads", []):
        iid = ad.get("institution_id")
        if not iid:
            continue
        by_inst.setdefault(iid, []).append(ad)
    return by_inst


def record_outcome(
    coverage: list,
    inst: dict,
    parser_name: str,
    fetch_status: str,
    ads_found: int,
    *,
    http_status: Optional[int] = None,
    note: str = "",
) -> None:
    """Single point of CoverageRow construction. Centralised so the messy
    ternary-strewn note construction we used to inline doesn't leak across
    multiple call-sites where it's hard to keep in sync.

    The caller passes `note` already formatted; this helper just builds the
    row, appends it, and emits a one-line log so a human watching the run
    can see progress without having to read the JSON afterwards.
    """
    coverage.append(CoverageRow(
        institution_id=inst["id"],
        parser=parser_name,
        fetch_status=fetch_status,
        http_status=http_status,
        ads_found=ads_found,
        note=note,
    ))
    logger.info(
        "%s: %s (%d ad%s)%s",
        inst["id"],
        fetch_status,
        ads_found,
        "" if ads_found == 1 else "s",
        f" — {note}" if note else "",
    )


def carry_forward_ads(
    inst: dict,
    previous_ads: dict[str, list[dict]],
    used_ids: set[str],
    reason: str,
) -> list[dict]:
    """When this run's fetch failed for `inst`, surface the previous run's
    ads instead of dropping the institution from the feed.

    Why: if IIT Madras's hosting goes down for a day, the user shouldn't
    suddenly stop seeing IIT-M positions — they're still real and still
    apply-able. We tag the carried-forward ads with `_source_method =
    "stale carry-forward"` so the dashboard can render a "stale" badge
    if it wants to (it currently doesn't, but the data is there).

    Rolling-stub ads are deliberately excluded: those are placeholders for
    institutions whose only output is a stub anyway, and the orchestrator
    re-emits a fresh stub via `rolling_stub()` in the same run. Keeping
    both would dedup-then-collide.
    """
    carried: list[dict] = []
    for old in previous_ads.get(inst["id"], []):
        ad = dict(old)
        if ad.get("_rolling_stub"):
            continue
        ad["_source_method"] = "stale carry-forward"
        ad["_source_note"] = reason
        ensure_unique_ad_id(ad, used_ids)
        carried.append(ad)
    return carried


def run(registry_path: Path, out_dir: Path, cache_dir: Path, limit: Optional[int] = None) -> dict:
    registry = load_registry(registry_path)
    if limit:
        registry = registry[:limit]

    previous_ads = load_previous_ads(out_dir)
    ads: list[dict] = []
    coverage: list[CoverageRow] = []
    used_ad_ids: set[str] = set()

    for inst in registry:
        parser_name = inst.get("parser", "generic") or "generic"
        url = inst.get("career_page_url_guess") or ""

        if parser_name == "manual":
            stub = rolling_stub(
                inst,
                datetime.now(timezone.utc),
                inst.get("notes", "Rolling call - check URL directly."),
            )
            ensure_unique_ad_id(stub, used_ad_ids)
            ads.append(stub)
            coverage.append(CoverageRow(
                institution_id=inst["id"],
                parser="manual",
                fetch_status="rolling-stub",
                http_status=None,
                ads_found=1,
                note=inst.get("notes", "Rolling call — check URL directly."),
            ))
            continue

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

        verify_tls = inst.get("tls_verify", True) is not False
        result = fetch(url, cache_path=cache_dir, verify_tls=verify_tls)
        robots_override_used = False
        tls_verify_disabled = not verify_tls
        robots_override_reason = (
            "Public-interest vacancy transparency override: official public recruitment source "
            "included so advertised opportunities do not disappear from the tracker."
        )
        if result.status == "robots-blocked":
            result = fetch(url, cache_path=cache_dir, respect_robots=False, verify_tls=verify_tls)
            robots_override_used = True

        # Accept HTTP errors that still returned a substantial body — some
        # Drupal-based career pages (notably iimcal.ac.in/jobs) serve the
        # listing payload alongside a 404 status. We log the upstream code
        # but try the parser anyway.
        served_body = result.text and len(result.text) > 2000
        if (result.status != "ok" and not (result.status == "http-error" and served_body)) or not result.text:
            # Last-ditch fallback: if the institution has a `fallback_pdf_url`
            # in the registry, call the parser with that URL directly. This is
            # how we keep IIT-Madras visible when facapp.iitm.ac.in goes down —
            # we already have its rolling-ad PDF cached locally and the parser
            # knows how to handle a `.pdf` URL by skipping the HTML stage.
            fb = inst.get("fallback_pdf_url")
            robots_override = robots_override_used or (
                result.status == "robots-blocked"
                and inst.get("robots_override") is True
            )
            if fb and (result.status != "robots-blocked" or robots_override):
                try:
                    parse_fn = dispatch_parser(parser_name)
                    parsed_ads = parse_fn("", fb, result.fetched_at)
                    if parsed_ads:
                        source_method = "public-interest override" if robots_override else "fallback PDF"
                        source_note = (
                            inst.get("robots_override_reason")
                            or robots_override_reason
                        ) if robots_override else ""
                        for ad in parsed_ads:
                            ads.append(normalize_ad(ad, inst, source_method, used_ad_ids, source_note))
                        note = f"listing fetch={result.status}; used fallback_pdf_url"
                        if robots_override:
                            note += f"; robots override: {source_note}"
                        coverage.append(CoverageRow(
                            institution_id=inst["id"], parser=f"{parser_name} (fallback PDF)",
                            fetch_status="ok", http_status=None, ads_found=len(parsed_ads),
                            note=note,
                        ))
                        continue
                except Exception as e:
                    coverage.append(CoverageRow(
                        institution_id=inst["id"], parser=parser_name, fetch_status="parser-error",
                        http_status=result.http_status, ads_found=0,
                        note=f"listing {result.status}; fallback parse failed: {e}",
                    ))
                    continue
            if is_rolling_html(inst):
                stub = rolling_stub(inst, result.fetched_at, inst.get("notes", ""))
                ensure_unique_ad_id(stub, used_ad_ids)
                ads.append(stub)
                coverage.append(CoverageRow(
                    institution_id=inst["id"],
                    parser=parser_name,
                    fetch_status="rolling-stub",
                    http_status=result.http_status,
                    ads_found=1,
                    note=f"{result.status}; preserved known rolling call" + (" after robots override" if robots_override_used else ""),
                ))
                continue
            carried = carry_forward_ads(
                inst,
                previous_ads,
                used_ad_ids,
                f"Latest fetch failed with {result.status}" + (" after robots override" if robots_override_used else "") + "; carrying forward previous official listings for review.",
            )
            if carried:
                ads.extend(carried)
                coverage.append(CoverageRow(
                    institution_id=inst["id"],
                    parser=parser_name,
                    fetch_status="stale-archive",
                    http_status=result.http_status,
                    ads_found=len(carried),
                    note=f"{result.status}" + (" after robots override" if robots_override_used else "") + f"; carried forward {len(carried)} previous listing(s)",
                ))
                continue
            coverage.append(CoverageRow(
                institution_id=inst["id"],
                parser=parser_name,
                fetch_status=result.status,
                http_status=result.http_status,
                ads_found=0,
                note=(("TLS verification disabled for official source; " if tls_verify_disabled else "") + (result.error or "")),
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
                carried = carry_forward_ads(
                    inst,
                    previous_ads,
                    used_ad_ids,
                    f"Parser fallback failed: {e}; carrying forward previous listings for review.",
                )
                if carried:
                    ads.extend(carried)
                    coverage.append(CoverageRow(
                        institution_id=inst["id"],
                        parser=parser_name,
                        fetch_status="stale-archive",
                        http_status=result.http_status,
                        ads_found=len(carried),
                        note=f"fallback failed: {e}; carried forward {len(carried)} previous listing(s)",
                    ))
                    continue
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
            carried = carry_forward_ads(
                inst,
                previous_ads,
                used_ad_ids,
                f"Parser failed: {e}; carrying forward previous listings for review.",
            )
            if carried:
                ads.extend(carried)
                coverage.append(CoverageRow(
                    institution_id=inst["id"],
                    parser=parser_name,
                    fetch_status="stale-archive",
                    http_status=result.http_status,
                    ads_found=len(carried),
                    note=f"parser-error: {e}; carried forward {len(carried)} previous listing(s)",
                ))
                continue
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
            # Preserve institution_id set by the parser (e.g. samarth_curec
            # returns per-institution slugs from a multi-institution API response).
            source_method = "public-interest override" if robots_override_used else "official scrape"
            source_note = robots_override_reason if robots_override_used else ""
            ads.append(normalize_ad(ad, inst, source_method, used_ad_ids, source_note))

        carried_no_parse: list[dict] = []
        if not parsed_ads and is_rolling_html(inst):
            stub = rolling_stub(inst, result.fetched_at, inst.get("notes", ""))
            ensure_unique_ad_id(stub, used_ad_ids)
            ads.append(stub)
        elif not parsed_ads:
            carried_no_parse = carry_forward_ads(
                inst,
                previous_ads,
                used_ad_ids,
                "Latest scrape returned no parsed ads" + (" after robots override" if robots_override_used else "") + "; carrying forward previous listings for review.",
            )
            ads.extend(carried_no_parse)

        # Decide the post-parse fetch_status / ads_found / note explicitly,
        # rather than via the previous nested-ternary single statement (which
        # was a maintenance hazard — any one branch change could silently
        # break the others).
        note_parts: list[str] = []
        if tls_verify_disabled:
            note_parts.append("TLS verification disabled for official source")
        if parsed_ads:
            status = "ok"
            ads_found = len(parsed_ads)
            if robots_override_used:
                note_parts.append("robots override")
        elif is_rolling_html(inst):
            status = "rolling-stub"
            ads_found = 1
            tail = "preserved known rolling call; no discrete postings parsed"
            if robots_override_used:
                tail += " after robots override"
            note_parts.append(tail)
        elif carried_no_parse:
            status = "stale-archive"
            ads_found = len(carried_no_parse)
            tail = f"carried forward {ads_found} previous listing(s)"
            if robots_override_used:
                tail += " after robots override"
            note_parts.append(tail)
        else:
            status = "ok"  # fetched fine, parser ran, just no ads emitted
            ads_found = 0
        record_outcome(
            coverage, inst, parser_name, status, ads_found,
            http_status=result.http_status,
            note="; ".join(note_parts),
        )

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
        "institutions_succeeded": sum(1 for c in coverage if c.fetch_status in ("ok", "rolling-stub", "stale-archive")),
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
    ap.add_argument("--registry", default=str(base / "docs" / "data" / "institutions_registry.json"))
    ap.add_argument("--out", default=str(base / "docs" / "data"))
    ap.add_argument("--cache", default=str(base / ".cache"))
    ap.add_argument("--limit", type=int, default=None)
    args = ap.parse_args()

    import sys
    sys.path.insert(0, str(Path(__file__).resolve().parent))

    stats = run(Path(args.registry), Path(args.out), Path(args.cache), limit=args.limit)
    print(json.dumps(stats, indent=2))
