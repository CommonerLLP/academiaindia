"""Archive retention: keep recent dailies, then weekly, then quarterly.

Without this, `data/archive/{date}.json` grows by ~1MB per scrape day forever.
The retention policy:

  - Last 30 days   : keep every file
  - Last 365 days  : keep one per ISO week (the Monday-of-week file)
  - Older          : keep one per quarter (the first file of each quarter)

Run via `make prune-archive` or directly:
    python scraper/prune_archive.py --keep-days 30 --keep-weeks 52
    python scraper/prune_archive.py --dry-run        # show what would go

The script is idempotent: re-running has no effect once the policy is applied.
"""

from __future__ import annotations

import argparse
import re
from datetime import date, timedelta
from pathlib import Path


ARCHIVE_FILENAME_RE = re.compile(r"^(\d{4})-(\d{2})-(\d{2})\.json$")


def classify(file_date: date, today: date, keep_days: int, keep_weeks: int) -> str:
    """Return one of:
       'recent'    — within keep_days days, always keep
       'weekly'    — between keep_days and keep_weeks weeks ago
       'quarterly' — older than keep_weeks weeks
    """
    age = (today - file_date).days
    if age <= keep_days:
        return "recent"
    if age <= keep_weeks * 7:
        return "weekly"
    return "quarterly"


def select_to_keep(files: list[Path], today: date, keep_days: int, keep_weeks: int) -> set[Path]:
    """From the list of dated archive files, return the ones to keep under
    the retention policy. The deletion list is everything else.
    """
    keep: set[Path] = set()
    weekly_seen: set[tuple[int, int]] = set()  # (iso-year, iso-week) pairs already kept
    quarterly_seen: set[tuple[int, int]] = set()  # (year, quarter) pairs already kept

    for f in sorted(files):
        m = ARCHIVE_FILENAME_RE.match(f.name)
        if not m:
            continue
        try:
            d = date(int(m.group(1)), int(m.group(2)), int(m.group(3)))
        except ValueError:
            continue
        bucket = classify(d, today, keep_days, keep_weeks)
        if bucket == "recent":
            keep.add(f)
        elif bucket == "weekly":
            iso_y, iso_w, _ = d.isocalendar()
            key = (iso_y, iso_w)
            if key not in weekly_seen:
                weekly_seen.add(key)
                keep.add(f)
        else:  # quarterly
            q = (d.month - 1) // 3 + 1
            key = (d.year, q)
            if key not in quarterly_seen:
                quarterly_seen.add(key)
                keep.add(f)
    return keep


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--archive-dir", default="data/archive",
                    help="Directory containing YYYY-MM-DD.json snapshots.")
    ap.add_argument("--keep-days", type=int, default=30,
                    help="Keep every snapshot from the last N days. Default: 30.")
    ap.add_argument("--keep-weeks", type=int, default=52,
                    help="Beyond keep-days, keep one snapshot per ISO week up to "
                         "this many weeks back. Default: 52.")
    ap.add_argument("--dry-run", action="store_true",
                    help="Print what would be removed but don't delete.")
    args = ap.parse_args()

    archive_dir = Path(args.archive_dir)
    if not archive_dir.exists():
        print(f"archive dir not found: {archive_dir}")
        return
    files = [p for p in archive_dir.iterdir() if p.is_file() and ARCHIVE_FILENAME_RE.match(p.name)]
    if not files:
        print(f"no archive files in {archive_dir}")
        return

    today = date.today()
    keep = select_to_keep(files, today, args.keep_days, args.keep_weeks)
    drop = [f for f in files if f not in keep]

    print(f"archive: {len(files)} files; keeping {len(keep)}, dropping {len(drop)}")
    for f in sorted(drop):
        if args.dry_run:
            print(f"  [dry-run] would remove {f.name}")
        else:
            f.unlink()
            print(f"  removed {f.name}")


if __name__ == "__main__":
    main()
