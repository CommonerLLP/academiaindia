"""Single shared factory for building JobAd dicts across all parsers.

Why this exists
---------------
Before this module, three parsers used three different ad-construction
patterns:

  - `iit_rolling`:  built a `JobAd` Pydantic instance, called `model_dump()`,
                    then patched extras into the resulting dict.
  - `iim_recruit`:  built a raw dict literal with all 22 keys per call.
  - `iit_kanpur`:   another raw dict literal, slightly different field order.

That drift made it easy to forget a field (e.g. `_pdf_parsed`) in one parser
but not the others, leaving the dashboard with cards that displayed
differently across institutions for no design-intentional reason. This
factory normalises construction in one place; parsers pass only the fields
they actually know about and get a fully-typed dict back.
"""

from __future__ import annotations

import hashlib
from datetime import datetime
from typing import Optional

from constants import PLACEHOLDER_INSTITUTION_ID


def stable_id(*parts: str) -> str:
    """SHA-256 of `parts` joined by NUL, first 16 hex chars. Idempotent across
    runs — same inputs always produce the same id, which the orchestrator
    relies on for dedup.
    """
    m = hashlib.sha256()
    for p in parts:
        m.update(str(p or "").encode("utf-8"))
        m.update(b"\x00")
    return m.hexdigest()[:16]


def make_ad(
    *,
    id: str,
    title: str,
    original_url: str,
    snapshot_fetched_at,
    institution_id: str = PLACEHOLDER_INSTITUTION_ID,
    ad_number: Optional[str] = None,
    department: Optional[str] = None,
    discipline: Optional[str] = None,
    post_type: str = "Faculty",
    contract_status: str = "Unknown",
    category_breakdown: Optional[dict] = None,
    number_of_posts: Optional[int] = None,
    pay_scale: Optional[str] = None,
    publication_date: Optional[str] = None,
    closing_date=None,
    parse_confidence: float = 0.5,
    raw_text_excerpt: Optional[str] = None,
    # Parser-attached extras:
    apply_url: Optional[str] = None,
    info_url: Optional[str] = None,
    annexure_pdf_url: Optional[str] = None,
    publications_required: Optional[str] = None,
    unit_eligibility: Optional[str] = None,
    pdf_parsed: bool = False,
    manual_stub: bool = False,
    rolling_stub: bool = False,
) -> dict:
    """Build a JobAd dict with consistent shape across parsers.

    All parsers should funnel through here. Required keyword-only args force
    the caller to be explicit about what they know, and unknowns default
    cleanly. The returned dict is the same shape the orchestrator expects.

    Why a dict and not a `JobAd.model_dump()`: the schema declares extras as
    Optional and `model_dump()` round-trips would silently re-validate types
    (e.g. converting a date string back through pydantic's date parser). The
    factory is the validation point — if you pass garbage, the dashboard
    will show garbage, but the orchestrator will not crash.
    """
    fetched_str = (
        snapshot_fetched_at.isoformat()
        if hasattr(snapshot_fetched_at, "isoformat")
        else str(snapshot_fetched_at)
    )
    closing_str = (
        closing_date.isoformat()
        if hasattr(closing_date, "isoformat")
        else closing_date
    )
    pub_str = (
        publication_date.isoformat()
        if hasattr(publication_date, "isoformat")
        else publication_date
    )
    return {
        "id": id,
        "institution_id": institution_id,
        "ad_number": ad_number,
        "title": title,
        "department": department,
        "discipline": discipline,
        "post_type": post_type,
        "contract_status": contract_status,
        "category_breakdown": category_breakdown,
        "number_of_posts": number_of_posts,
        "pay_scale": pay_scale,
        "publication_date": pub_str,
        "closing_date": closing_str,
        "original_url": original_url,
        "snapshot_fetched_at": fetched_str,
        "parse_confidence": parse_confidence,
        "raw_text_excerpt": raw_text_excerpt,
        # extras
        "apply_url": apply_url,
        "info_url": info_url,
        "annexure_pdf_url": annexure_pdf_url,
        "publications_required": publications_required,
        "unit_eligibility": unit_eligibility,
        "_pdf_parsed": pdf_parsed,
        "_manual_stub": manual_stub,
        "_rolling_stub": rolling_stub,
    }
