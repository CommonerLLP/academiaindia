# India HEI Job Tracker — common operations.
#
# Why a Makefile and not a README of commands:
# - `.venv/bin/python` is the only invocation that works (bare `python` picks
#   up Homebrew Python without our deps). Hardcoding it here prevents cryptic
#   ImportErrors.
# - Targets document what the repo *can* do without grepping scripts.
#
# `make help` lists everything.

VENV   := .venv
PYTHON := $(VENV)/bin/python
PIP    := $(VENV)/bin/pip
PORT   := 8765

$(PYTHON):
	python3 -m venv $(VENV)
	$(PIP) install -q -r requirements.txt

.PHONY: serve sweep scrape scrape-fresh refresh-pdfs report test deps prune-archive clean help

# ---- core operations -------------------------------------------------------

serve:
	@echo "Dashboard → http://localhost:$(PORT)/dashboard/"
	@python3 -m http.server $(PORT)

# Run the orchestrator and write data/current.json + coverage_report.json.
# `make sweep ARGS='--limit 5'` to smoke-test against just 5 institutions.
sweep: $(PYTHON)
	$(PYTHON) scraper/run.py $(ARGS)
	@find sources -name "*.pdf" 2>/dev/null | while read pdf; do \
	  inst=$$(basename $$(dirname "$$pdf")); \
	  echo "merging $$pdf ($$inst)"; \
	  $(PYTHON) scraper/ingest_pdf.py --pdf "$$pdf" --institution "$$inst" --merge 2>&1 | tail -1; \
	done

scrape: sweep  # canonical alias

# Force-fresh scrape: bust the PDF cache so download_pdf re-fetches every
# upstream PDF instead of serving the cached copy. Use this when you suspect
# upstream has updated their rolling-ad (e.g. AP-1 → AP-2 at IIT Delhi).
scrape-fresh: refresh-pdfs sweep

refresh-pdfs:
	rm -rf .cache/pdfs/

# ---- ops -------------------------------------------------------------------

report: $(PYTHON)
	$(PYTHON) scraper/hss_report.py

test: $(PYTHON)
	$(PYTHON) -m pytest scraper/tests/ -v

deps:
	$(PIP) install -r requirements.txt

# Retention: keep daily archives for last 30 days, weekly for last year, then
# quarterly. Without pruning the archive grows by ~1MB/day indefinitely.
prune-archive: $(PYTHON)
	$(PYTHON) scraper/prune_archive.py --keep-days 30

# ---- maintenance -----------------------------------------------------------

clean:
	find . -name __pycache__ -type d -exec rm -rf {} +
	rm -rf .cache/

help:
	@echo "Core:"
	@echo "  make serve         — serve dashboard at http://localhost:$(PORT)/dashboard/"
	@echo "  make sweep         — run scraper (alias: make scrape)"
	@echo "  make scrape-fresh  — busts PDF cache before scraping"
	@echo "  make refresh-pdfs  — drop .cache/pdfs/ to force re-download next sweep"
	@echo "Ops:"
	@echo "  make report        — print HSS + coverage summary"
	@echo "  make test          — run unit tests under scraper/tests/"
	@echo "  make prune-archive — apply 30-day retention to data/archive/"
	@echo "  make deps          — install pinned dependencies into .venv"
	@echo "  make clean         — drop .cache/ and __pycache__/"
