# GitHub Actions — Weekly Sweep

**Why this workflow exists.** Cowork's sandbox blocks outbound HTTP to every `*.ac.in`, `*.nic.in`, `*.edu.in`, and `*.samarth.ac.in` host at the egress proxy. GitHub-hosted Ubuntu runners have unblocked outbound internet, so the live-scrape pipeline runs there and opens a PR with updated `data/`. Your Cowork session then re-renders the artifact from the committed `data/current.json` after that PR lands.

## One-time setup (about 10 minutes)

### 1. Initialise the repo locally

On your laptop (not in Cowork):

```bash
cd ~/Library/Mobile\ Documents/com~apple~CloudDocs/...../adp/india-hei-job-tracker
# (or wherever the folder is synced — the path depends on your iCloud / OneDrive layout)

git init -b main
git add -A
git commit -m "initial commit: india-hei-job-tracker with IITD + IITB ingest"
```

### 2. Create a GitHub repository

```bash
# Requires the gh CLI. If you don't have it: brew install gh && gh auth login
gh repo create india-hei-job-tracker --private --source=. --push
```

If you prefer the web UI: create a new private repo at https://github.com/new, then

```bash
git remote add origin git@github.com:<your-username>/india-hei-job-tracker.git
git push -u origin main
```

The repo should be **private** unless you actively want it public — your job-search history is not something I'd put under a public-facing commit log.

### 3. Verify the workflow is active

Open the repo's Actions tab on GitHub. You should see "weekly-sweep" listed. On first push it will *not* run automatically (the cron hasn't fired yet); you can trigger it manually:

- Actions tab → "weekly-sweep" workflow → "Run workflow" button → select `main` branch → optionally set `limit` (e.g. `10` for a test run against the first 10 institutions) → "Run workflow"

The first manual run takes 3–8 minutes depending on how many institutions respond slowly. Watch the logs; at the end you'll see:

- `=== HSS summary for <timestamp> ===` with the classifier breakdown and the HSS-match records that Bablu's profile cares about
- A pull request titled `weekly sweep: N records`
- An uploaded artifact `sweep-log-<run-id>` retained for 14 days

### 4. Schedule

The workflow runs automatically every Monday at **03:30 IST (Sunday 22:00 UTC)**. Change the cron in `.github/workflows/weekly-sweep.yml` if you want a different time. GitHub's free-tier cron is best-effort and may run up to 15 minutes late under load.

### 5. Sync the data back to your laptop

Three options — pick whatever fits your existing workflow:

**(a) iCloud / OneDrive sync.** If your local copy of `india-hei-job-tracker/` is inside your synced folder, `git pull` in the morning brings the new `data/` down. Easy.

**(b) Dropbox.** Same as above — `git pull` after sync.

**(c) Plain git pull.** No cloud sync; just `cd india-hei-job-tracker && git pull` when you want fresh data.

Then in your next Cowork session, open the artifact — Cowork picks up the committed `data/current.json` when I regenerate the artifact via `update_artifact`.

## What the workflow does, step by step

1. **Checkout** the repo on an Ubuntu 22.04 runner.
2. **Install** Python 3.11 + `pdfplumber`, `pydantic`, `requests`, `requests-cache`, `beautifulsoup4`, `lxml` from `requirements-scraper.txt`.
3. **Run `python scraper/run.py`** — walks `data/institutions_registry.json`, fetches each career page at 1 req / 10 s per domain, dispatches to institution-specific parsers in `scraper/parsers/` with generic fallback, writes `data/current.json` + `data/archive/YYYY-MM-DD.json` + `data/coverage_report.json`.
4. **Print a coverage summary** — which institutions succeeded, which failed, parser-failure notes.
5. **Print HSS summary** — the classifier output filtered to the five categories that match your CV (sociology / anthropology / STS / dev studies / digital societies / public policy centres), so the run log is immediately informative rather than a 105-line dump.
6. **Validate `docs/data/current.json`** with `scripts/validate_current.py`. The gate blocks empty/malformed output, unsafe rendered URL schemes, script-like strings, missing IDs, and ad-count drops greater than 20% from the prior committed copy.
7. **Open a pull request for `docs/data/`** with a descriptive title. If the repository has auto-merge enabled, the workflow requests squash auto-merge after the PR is created.
8. **Upload `sweep-summary.txt` + `coverage_report.json`** as a GitHub Actions artifact for 14-day debugging history.

## Failure modes to expect and how they're handled

- **Institution site down or 5xx.** `scraper/fetch.py` backs off 30 s on 4xx/5xx and records `fetch_status: fetch-error`. If the output still passes validation, the workflow opens a PR; the next weekly run retries.
- **Institution site restructured, parser broken.** The record's `parse_confidence` drops; if generic fallback finds ads, they're emitted with confidence ≤ 0.4. You see the issue in the artifact's parser-confidence chip on that card. Fix the parser, push, the next sweep picks it up.
- **robots.txt disallows scraping.** `scraper/fetch.py` respects it and records `fetch_status: robots-blocked`. Those institutions need PDF-ingest (`scraper/ingest_pdf.py`) instead.
- **Samarth institutions.** `curec.samarth.ac.in` is a public search portal but its ToS is unverified; we do not scrape it yet. When / if ToS permits, add `samarth` parser.
- **Cron skipped by GitHub.** Free-tier cron is best-effort. If it has been more than eight days since the last sweep PR, run `workflow_dispatch` manually. (Or, if it becomes a recurring problem, move to a paid plan or switch to a self-hosted runner on your laptop — the workflow file doesn't need to change.)

## Cost

- GitHub Actions free tier: 2,000 private-repo minutes per month.
- Each weekly sweep takes ~5–10 minutes.
- Monthly cost: 20–50 minutes. Comfortably inside free tier.
- Zero Anthropic / Cowork cost — the scrape happens on GitHub's infrastructure, not mine.

## Rotating to laptop-side runs

If GitHub becomes annoying (repo visibility politics, private-repo limits, whatever), the same `scraper/run.py` runs on your laptop without modification:

```bash
cd ~/path/to/india-hei-job-tracker
pip install -r requirements-scraper.txt
python scraper/run.py
```

Writes the same `data/` files. No cron? Either set up a local `launchd` job (macOS) or just run it when you remember.
