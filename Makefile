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
PORT   := 8000

$(PYTHON):
	python3 -m venv $(VENV)
	$(PIP) install -r requirements.txt -r requirements-dev.txt

.PHONY: serve sweep scrape scrape-fresh refresh-pdfs report test deps prune-archive clean help \
        corpus-crawl corpus-parse corpus-export corpus-consolidate corpus-refresh

# ---- parliamentary corpus refresh -----------------------------------------
#
# As of 2026-05-06 the LS + RS crawler is the public package
# `sansad-semantic-crawler` (PolyForm-NC), pinned in requirements.txt at
# v0.1.0. The host project supplies the topic profile (`notes/topics/
# cei-vacancies.json`, gitignored — encodes the faculty-vacancy +
# reservation + Mission Mode regex lens) and the output directory
# (`data/_sansad_crawl/`, also gitignored).
#
# Three legacy scripts (`scripts/sansad_crawl.py`,
# `scripts/sansad_rs_crawl.py`, `scripts/sansad_download_pdfs.py`) were
# retired in the same commit; their LS-side schema (`questiontype` /
# `questionno` / `members`) was the only schema variation that the
# consolidation step had to remap, and consolidate_corpus.py now reads
# the package's canonical schema directly.

TOPIC_PROFILE := notes/topics/cei-vacancies.json
CORPUS_OUT    := data/_sansad_crawl

corpus-crawl: $(PYTHON)
	@test -f $(TOPIC_PROFILE) || { echo "missing $(TOPIC_PROFILE) — see CONTRIBUTING.md for the topic-profile contract"; exit 1; }
	$(PYTHON) -m sansad_semantic_crawler crawl \
	  --topic $(TOPIC_PROFILE) \
	  --out   $(CORPUS_OUT) \
	  $(ARGS)

corpus-parse: $(PYTHON)
	$(PYTHON) -m sansad_semantic_crawler parse \
	  --topic $(TOPIC_PROFILE) \
	  --out   $(CORPUS_OUT)

corpus-export: $(PYTHON)
	$(PYTHON) -m sansad_semantic_crawler export \
	  --topic $(TOPIC_PROFILE) \
	  --out   $(CORPUS_OUT) \
	  --format json

corpus-consolidate: $(PYTHON)
	$(PYTHON) scripts/consolidate_corpus.py

# Full pipeline: crawl, parse, then consolidate. Skips export (the host
# project consumes the canonical merged manifest, not the package's
# summary JSON). Pass `ARGS='--max-buckets 1 --max-records 5 --no-download'`
# for a smoke run before committing to a full crawl.
corpus-refresh: corpus-crawl corpus-parse corpus-consolidate


# ---- core operations -------------------------------------------------------

serve:
	@echo "Site → http://localhost:$(PORT)/"
	@python3 -m http.server $(PORT) --directory docs

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
	$(PIP) install -r requirements.txt -r requirements-dev.txt

# Retention: keep daily archives for last 30 days, weekly for last year, then
# quarterly. Without pruning the archive grows by ~1MB/day indefinitely.
prune-archive: $(PYTHON)
	$(PYTHON) scraper/prune_archive.py --keep-days 30

# ---- maintenance -----------------------------------------------------------

clean:
	find . -name __pycache__ -type d -exec rm -rf {} +
	rm -rf .cache/

help:
	@echo "Core (vacancy scraper):"
	@echo "  make serve         — serve site at http://localhost:$(PORT)/"
	@echo "  make sweep         — run scraper (alias: make scrape)"
	@echo "  make scrape-fresh  — busts PDF cache before scraping"
	@echo "  make refresh-pdfs  — drop .cache/pdfs/ to force re-download next sweep"
	@echo "Parliamentary corpus (sansad-semantic-crawler):"
	@echo "  make corpus-refresh    — crawl + parse + consolidate (full pipeline)"
	@echo "  make corpus-crawl      — crawl LS + RS into data/_sansad_crawl/ (use ARGS='--max-records 5 --no-download' to smoke-test)"
	@echo "  make corpus-parse      — extract text from downloaded PDFs"
	@echo "  make corpus-consolidate — merge into corpus/parliamentary_corpus.jsonl"
	@echo "Ops:"
	@echo "  make report        — print HSS + coverage summary"
	@echo "  make test          — run unit tests under scraper/tests/"
	@echo "  make prune-archive — apply 30-day retention to data/archive/"
	@echo "  make deps          — install pinned dependencies into .venv"
	@echo "  make clean         — drop .cache/ and __pycache__/"
