VENV   := .venv
PYTHON := $(VENV)/bin/python
PORT   := 8765

$(PYTHON):
	python3 -m venv $(VENV)
	$(VENV)/bin/pip install -q -r requirements-scraper.txt

.PHONY: serve sweep report help

serve:
	@echo "Dashboard → http://localhost:$(PORT)/dashboard/"
	@python3 -m http.server $(PORT)

sweep: $(PYTHON)
	$(PYTHON) scraper/run.py $(ARGS)
	@find sources -name "*.pdf" | while read pdf; do \
	  inst=$$(basename $$(dirname "$$pdf")); \
	  echo "merging $$pdf ($$inst)"; \
	  $(PYTHON) scraper/ingest_pdf.py --pdf "$$pdf" --institution "$$inst" --merge 2>&1 | tail -1; \
	done

report: $(PYTHON)
	$(PYTHON) scraper/hss_report.py

help:
	@echo "make serve   — serve dashboard at http://localhost:$(PORT)/dashboard/"
	@echo "make sweep   — run scraper (optional: ARGS='--limit 5')"
	@echo "make report  — print HSS + coverage summary"
