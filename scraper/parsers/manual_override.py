"""Manual-override parser: load hand-transcribed JobAd records from JSON.

Why this exists
---------------
A small number of listings reach this project via channels the
scrapers cannot reach: WhatsApp circulars, mailing-list forwards,
recruitment cards passed hand-to-hand. Before this module existed,
the only way to surface such listings was to type the JobAd dict
directly into `docs/data/current.json`. That worked exactly once
per entry: every nightly sweep regenerated `current.json` from the
scrapers and clobbered the manual entry. The 2026-05-04 sweep
silently dropped the Ashoka Sociology & Anthropology Visiting
Faculty record this way.

This module fixes the problem by treating manual entries as their
own data source. Hand-transcribed records live in
`docs/data/manual_overrides.json` (a JSON array of full JobAd dicts).
The orchestrator calls `load_manual_overrides()` after the main
registry loop and merges the records into the output. Because the
merge runs every sweep, manual entries persist through regeneration.

Schema contract
---------------
Each record in `manual_overrides.json` MUST be a dict that conforms
to the JobAd shape produced by `ad_factory.py` — same required keys
(`id`, `institution_id`, `title`, `original_url`), same optional
metadata fields. By convention manual records also carry:

    "_manual_stub": true
    "_source_method": "manual transcription from circulated card"
    "_source_note": "<provenance explanation>"
    "parse_confidence": <0.4 or lower>

These flags surface the provenance gap to downstream readers — the
listing card renders a yellow "manual entry" pill and the
`_source_note` becomes a hover-tooltip. Setting `parse_confidence`
≤ 0.4 is conventional, not enforced.

Network discipline
------------------
This parser does not hit the network. It reads a local file. That
keeps it safe to run inside the orchestrator's main loop and inside
contract tests (which forbid network access).
"""

from __future__ import annotations

import json
from pathlib import Path


def load_manual_overrides(manual_path: Path) -> list[dict]:
    """Load hand-transcribed JobAd records from `manual_path`.

    Returns an empty list if the file doesn't exist or is malformed —
    a malformed manual file should never break the nightly sweep, only
    forfeit its own entries for that run.
    """
    if not manual_path.exists():
        return []
    try:
        with manual_path.open(encoding="utf-8") as f:
            data = json.load(f)
    except json.JSONDecodeError:
        return []
    if not isinstance(data, list):
        return []
    return [r for r in data if isinstance(r, dict) and r.get("id") and r.get("institution_id") and r.get("title")]
