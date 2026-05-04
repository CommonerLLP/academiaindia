"""Tests for `scraper/ad_factory.py`.

Why these matter: every parser eventually wants to migrate into
`make_ad(...)` (parser-by-parser, see TECHDEBT.md). Before that
migration can land, the factory itself needs test coverage — a factory
that quietly drops fields or coerces types incorrectly would break
parsers in flight. These tests freeze the canonical contract.

Two layers of coverage:

  1. `stable_id` — the deterministic dedup primitive. Has historically
     existed in 4 implementations across the repo; this is the canonical
     one. We test idempotency, None-safety (the bug that was hidden in
     `curated_iit_hss.py`), order sensitivity, and length.
  2. `make_ad` — the JobAd dict constructor. We test required-keys
     coverage, default values, type coercion of date-like inputs, and
     the parser-extras pass-through.
"""

from __future__ import annotations

from datetime import date, datetime, timezone

import pytest

from ad_factory import make_ad, stable_id


# ----------------------------------------------------------------------
# stable_id
# ----------------------------------------------------------------------


def test_stable_id_idempotent() -> None:
    """Same inputs produce the same id across calls."""
    a = stable_id("foo", "bar")
    b = stable_id("foo", "bar")
    assert a == b
    assert len(a) == 16


def test_stable_id_handles_none() -> None:
    """None parts must not crash — the bug that was hidden in
    `curated_iit_hss.stable_id`. `(None, "x")` should NOT raise."""
    out = stable_id(None, "x")  # type: ignore[arg-type]
    assert isinstance(out, str)
    assert len(out) == 16


def test_stable_id_order_sensitive() -> None:
    """Argument order changes the hash. Critical for the orchestrator's
    dedup contract — swapping institution and ad number must NOT collide."""
    assert stable_id("inst", "ad-1") != stable_id("ad-1", "inst")


def test_stable_id_distinguishes_none_from_empty() -> None:
    """An explicit empty string and a None should hash to the same value
    (both encode as b'') — this is intended; callers passing `(p or "")`
    everywhere already get this behaviour."""
    a = stable_id(None, "x")  # type: ignore[arg-type]
    b = stable_id("", "x")
    assert a == b


def test_stable_id_uses_nul_separator_not_concatenation() -> None:
    """The id must be sensitive to separator boundaries — `('ab', 'c')`
    and `('a', 'bc')` must NOT collide. Without a separator the hash
    would treat them as the same byte stream."""
    assert stable_id("ab", "c") != stable_id("a", "bc")


def test_stable_id_coerces_non_string_via_str() -> None:
    """Numeric inputs (e.g. ad_number passed as int) shouldn't crash —
    the factory uses `str(p or "")` so coercion is implicit."""
    out = stable_id("inst", 42)  # type: ignore[arg-type]
    assert len(out) == 16


# ----------------------------------------------------------------------
# make_ad
# ----------------------------------------------------------------------


REQUIRED_KEYS = {
    "id", "institution_id", "ad_number", "title", "department", "discipline",
    "post_type", "contract_status", "category_breakdown", "number_of_posts",
    "pay_scale", "publication_date", "closing_date", "original_url",
    "snapshot_fetched_at", "parse_confidence", "raw_text_excerpt",
    "apply_url", "info_url", "annexure_pdf_url", "publications_required",
    "unit_eligibility", "_pdf_parsed", "_manual_stub", "_rolling_stub",
}


def _minimal_ad() -> dict:
    return make_ad(
        id="abc123",
        title="Faculty position",
        original_url="https://example.org/jobs/1",
        snapshot_fetched_at=datetime(2026, 5, 4, tzinfo=timezone.utc),
    )


def test_make_ad_returns_dict_with_canonical_keys() -> None:
    """Every key in REQUIRED_KEYS must exist on the returned dict.
    Adding/removing keys here is a deliberate breaking change and the
    test will (correctly) fail until callers + this set are updated."""
    ad = _minimal_ad()
    assert isinstance(ad, dict)
    missing = REQUIRED_KEYS - set(ad.keys())
    assert not missing, f"factory dropped canonical keys: {missing}"
    extra = set(ad.keys()) - REQUIRED_KEYS
    assert not extra, f"factory added keys not in contract: {extra}"


def test_make_ad_defaults() -> None:
    """Verify the documented defaults: post_type='Faculty', contract_status='Unknown',
    parse_confidence=0.5, institution_id is the placeholder, all _flags False."""
    ad = _minimal_ad()
    assert ad["post_type"] == "Faculty"
    assert ad["contract_status"] == "Unknown"
    assert ad["parse_confidence"] == 0.5
    assert ad["institution_id"] == "__placeholder__"
    assert ad["_pdf_parsed"] is False
    assert ad["_manual_stub"] is False
    assert ad["_rolling_stub"] is False


def test_make_ad_coerces_date_objects_to_iso_strings() -> None:
    """The orchestrator + JSON layer expect ISO strings, not datetime/date.
    The factory must call `.isoformat()` on date-like inputs so callers
    can pass either."""
    ad = make_ad(
        id="x", title="x", original_url="https://example.org",
        snapshot_fetched_at=datetime(2026, 5, 4, 12, 0, tzinfo=timezone.utc),
        publication_date=date(2026, 1, 1),
        closing_date=date(2026, 6, 30),
    )
    assert ad["snapshot_fetched_at"] == "2026-05-04T12:00:00+00:00"
    assert ad["publication_date"] == "2026-01-01"
    assert ad["closing_date"] == "2026-06-30"


def test_make_ad_passes_through_string_dates_unchanged() -> None:
    """Callers that already have ISO strings should not have them
    re-parsed; the factory passes strings straight through."""
    ad = make_ad(
        id="x", title="x", original_url="https://example.org",
        snapshot_fetched_at="2026-05-04T12:00:00+00:00",
        publication_date="2026-01-01",
        closing_date="2026-06-30",
    )
    assert ad["snapshot_fetched_at"] == "2026-05-04T12:00:00+00:00"
    assert ad["publication_date"] == "2026-01-01"
    assert ad["closing_date"] == "2026-06-30"


def test_make_ad_extras_pass_through() -> None:
    """Parser-attached extras (apply_url, info_url, etc.) make it onto the
    final dict at the right keys — this is the bug the factory was
    introduced to prevent."""
    ad = make_ad(
        id="x", title="x", original_url="https://example.org",
        snapshot_fetched_at=datetime(2026, 5, 4, tzinfo=timezone.utc),
        apply_url="https://example.org/apply",
        info_url="https://example.org/info",
        annexure_pdf_url="https://example.org/ann.pdf",
        publications_required="2 SCI papers",
        unit_eligibility="PhD + 3 yrs",
        pdf_parsed=True,
        rolling_stub=True,
    )
    assert ad["apply_url"] == "https://example.org/apply"
    assert ad["info_url"] == "https://example.org/info"
    assert ad["annexure_pdf_url"] == "https://example.org/ann.pdf"
    assert ad["publications_required"] == "2 SCI papers"
    assert ad["unit_eligibility"] == "PhD + 3 yrs"
    assert ad["_pdf_parsed"] is True
    assert ad["_rolling_stub"] is True


def test_make_ad_category_breakdown_dict_pass_through() -> None:
    """Reservation category breakdowns are dicts (UR/SC/ST/OBC/EWS/PwBD →
    int). The factory must not coerce or flatten them."""
    breakdown = {"UR": 2, "SC": 1, "ST": 1, "OBC": 2, "EWS": 1, "PwBD": 0}
    ad = make_ad(
        id="x", title="x", original_url="https://example.org",
        snapshot_fetched_at=datetime(2026, 5, 4, tzinfo=timezone.utc),
        category_breakdown=breakdown,
    )
    assert ad["category_breakdown"] == breakdown
