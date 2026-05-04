"""Shared pytest config — make `scraper/` importable so tests can do
`from pdf_extractor import ...` exactly as the orchestrator does.
"""

import sys
from pathlib import Path

# `scraper/tests/conftest.py` → `scraper/` is parent.
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
