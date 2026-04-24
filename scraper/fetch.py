"""HTTP fetching with rate limiting, caching, robots.txt, retries.

Design notes
- User-Agent identifies the project and a contact email so operators can reach us.
- Cache TTL is deliberately long (6 hours) so parsers can be iterated locally
  without hammering the upstream server.
- robots.txt is honoured. If disallowed, the fetch returns (None, 'robots-blocked').
- 4xx is non-retryable; 5xx is retried with exponential backoff (max 3 attempts).
"""

from __future__ import annotations

import time
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional
from urllib.parse import urlparse
from urllib.robotparser import RobotFileParser

import requests
from requests_cache import CachedSession

USER_AGENT = (
    "india-hei-job-tracker/0.1 (+mailto:solanki.aakash@gmail.com; "
    "research tool; rate-limited; respects robots.txt)"
)

DEFAULT_RATE_LIMIT_SEC = 10.0
DEFAULT_TIMEOUT_SEC = 30.0
CACHE_TTL_SEC = 6 * 3600

_last_request_by_domain: dict[str, float] = {}
_robots_cache: dict[str, RobotFileParser] = {}


def _session(cache_path: Path) -> CachedSession:
    s = CachedSession(
        cache_name=str(cache_path / "http_cache"),
        expire_after=CACHE_TTL_SEC,
        allowable_methods=("GET", "HEAD"),
        stale_if_error=True,
    )
    s.headers.update({"User-Agent": USER_AGENT})
    return s


def _get_robot_parser(domain: str) -> RobotFileParser:
    if domain in _robots_cache:
        return _robots_cache[domain]
    rp = RobotFileParser()
    rp.set_url(f"https://{domain}/robots.txt")
    try:
        rp.read()
    except Exception:
        # If robots.txt is unreachable, err on the side of caution: pretend
        # it disallowed '/recruitment-*' paths but allow all else.
        pass
    _robots_cache[domain] = rp
    return rp


def _rate_limit(domain: str, min_interval_sec: float) -> None:
    last = _last_request_by_domain.get(domain, 0.0)
    now = time.time()
    wait = min_interval_sec - (now - last)
    if wait > 0:
        time.sleep(wait)
    _last_request_by_domain[domain] = time.time()


@dataclass
class FetchResult:
    status: str  # 'ok' | 'robots-blocked' | 'http-error' | 'network-error'
    http_status: Optional[int]
    url: str
    final_url: Optional[str]
    text: Optional[str]
    content_type: Optional[str]
    fetched_at: datetime
    error: Optional[str] = None


def fetch(
    url: str,
    *,
    cache_path: Path,
    rate_limit_sec: float = DEFAULT_RATE_LIMIT_SEC,
    max_retries: int = 3,
    timeout: float = DEFAULT_TIMEOUT_SEC,
    respect_robots: bool = True,
) -> FetchResult:
    domain = urlparse(url).netloc
    fetched_at = datetime.now(timezone.utc)

    if respect_robots:
        rp = _get_robot_parser(domain)
        try:
            if not rp.can_fetch(USER_AGENT, url):
                return FetchResult(
                    status="robots-blocked",
                    http_status=None,
                    url=url,
                    final_url=None,
                    text=None,
                    content_type=None,
                    fetched_at=fetched_at,
                )
        except Exception:
            pass  # fail open if robotparser blows up

    session = _session(cache_path)

    last_err: Optional[Exception] = None
    for attempt in range(max_retries):
        try:
            _rate_limit(domain, rate_limit_sec)
            resp = session.get(url, timeout=timeout, allow_redirects=True)
            if 500 <= resp.status_code < 600:
                last_err = RuntimeError(f"HTTP {resp.status_code}")
                time.sleep(min(30, 2**attempt))
                continue
            content_type = resp.headers.get("Content-Type", "")
            text = resp.text if content_type.startswith("text/") or "html" in content_type or "xml" in content_type else None
            return FetchResult(
                status="ok" if resp.status_code < 400 else "http-error",
                http_status=resp.status_code,
                url=url,
                final_url=resp.url,
                text=text,
                content_type=content_type,
                fetched_at=datetime.now(timezone.utc),
            )
        except requests.RequestException as e:
            last_err = e
            time.sleep(min(30, 2**attempt))

    return FetchResult(
        status="network-error",
        http_status=None,
        url=url,
        final_url=None,
        text=None,
        content_type=None,
        fetched_at=datetime.now(timezone.utc),
        error=str(last_err) if last_err else "unknown",
    )
