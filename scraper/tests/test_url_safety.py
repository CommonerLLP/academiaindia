"""Tests for `scraper/url_safety.py` — the SSRF guard.

Covers the cases the prior review flagged as gaps:
  * IPv4 RFC1918 + loopback rejection
  * IPv6 loopback (::1)
  * IPv6 unique-local (fc00::/7) — the case the review specifically named
  * IPv6 link-local (fe80::/10)
  * IANA reserved ranges
  * non-http(s) schemes (file:, javascript:, data:, gopher:)
  * unresolvable hostnames
  * empty + malformed URLs
  * the multi-A-record pessimistic-rejection contract

DNS is patched at `socket.getaddrinfo` so the tests don't require live
DNS or a network. Each test names what it is asserting and why — these
are policy assertions, not implementation details, and changes to them
should be deliberate.
"""

from __future__ import annotations

from unittest.mock import patch

import pytest

from url_safety import is_safe_url


# ---------------------------------------------------------------
# Scheme rejection — must be enforced before any DNS lookup, so
# we can run these without patching socket.
# ---------------------------------------------------------------


@pytest.mark.parametrize("url", [
    "file:///etc/passwd",
    "javascript:alert(1)",
    "data:text/plain,whatever",
    "gopher://example.org/x",
    "ftp://example.org/x",
    "ws://example.org/x",
    "wss://example.org/x",
])
def test_rejects_non_http_schemes(url: str) -> None:
    assert is_safe_url(url) is False, (
        f"{url!r} must be rejected — only http(s) is safe"
    )


@pytest.mark.parametrize("url", ["", "   ", "not a url", "://", "http://"])
def test_rejects_empty_or_malformed(url: str) -> None:
    assert is_safe_url(url) is False


# ---------------------------------------------------------------
# DNS-resolution rejection — patch getaddrinfo to inject the IP
# we want to test against. Each test names the precise CIDR being
# verified.
# ---------------------------------------------------------------


def _addrinfo(ip: str, family: int = 2):  # AF_INET=2, AF_INET6=10
    """Synthesize the tuple shape `socket.getaddrinfo` returns.
    Real shape: (family, type, proto, canonname, sockaddr).
    For IPv6 sockaddr is (addr, port, flowinfo, scopeid)."""
    if ":" in ip:
        return [(10, 1, 6, "", (ip, 0, 0, 0))]
    return [(family, 1, 6, "", (ip, 0))]


@pytest.mark.parametrize("ip,note", [
    ("127.0.0.1",     "IPv4 loopback"),
    ("10.0.0.1",      "RFC1918 10/8"),
    ("172.16.0.1",    "RFC1918 172.16/12"),
    ("192.168.1.1",   "RFC1918 192.168/16"),
    ("169.254.1.1",   "IPv4 link-local"),
    ("0.0.0.0",       "IANA reserved 0.0.0.0/8"),
    ("224.0.0.1",     "IPv4 multicast (reserved)"),
])
def test_rejects_ipv4_private_loopback_linklocal(ip: str, note: str) -> None:
    """IPv4: every private/loopback/link-local/reserved range must be rejected."""
    with patch("url_safety.socket.getaddrinfo", return_value=_addrinfo(ip)):
        assert is_safe_url("http://attacker-controlled.example.org/x") is False, (
            f"failed to reject {ip} ({note})"
        )


@pytest.mark.parametrize("ip,note", [
    ("::1",                    "IPv6 loopback"),
    ("fc00::1",                "IPv6 ULA fc00::/7 (start)"),
    ("fdff:ffff::1",           "IPv6 ULA fc00::/7 (end of fd block)"),
    ("fe80::1",                "IPv6 link-local fe80::/10"),
    ("ff00::1",                "IPv6 multicast"),
    ("::ffff:127.0.0.1",       "IPv4-mapped IPv6 loopback"),
    ("::ffff:10.0.0.1",        "IPv4-mapped IPv6 RFC1918"),
])
def test_rejects_ipv6_loopback_ula_linklocal(ip: str, note: str) -> None:
    """IPv6: loopback, ULA (fc00::/7 — the case explicitly flagged in
    the prior review), link-local, multicast, and IPv4-mapped private
    addresses must all be rejected."""
    with patch("url_safety.socket.getaddrinfo", return_value=_addrinfo(ip)):
        assert is_safe_url("http://attacker-controlled.example.org/x") is False, (
            f"failed to reject {ip} ({note})"
        )


@pytest.mark.parametrize("ip", [
    "8.8.8.8",      # public IPv4
    "1.1.1.1",      # public IPv4
    "2606:4700:4700::1111",  # public IPv6 (Cloudflare)
    "2001:4860:4860::8888",  # public IPv6 (Google)
])
def test_accepts_public_addresses(ip: str) -> None:
    """Public IPs must pass — the guard exists to reject private space,
    not all DNS resolution. This is the sanity floor."""
    with patch("url_safety.socket.getaddrinfo", return_value=_addrinfo(ip)):
        assert is_safe_url("https://public-host.example.org/x") is True, (
            f"public address {ip} was wrongly rejected"
        )


def test_rejects_unresolvable_hostname() -> None:
    """A hostname that does not resolve (gaierror) is rejected — fail
    closed. An attacker-controlled DNS that intermittently NXDOMAINs to
    bypass guards must not get a free pass."""
    import socket as real_socket
    with patch("url_safety.socket.getaddrinfo", side_effect=real_socket.gaierror):
        assert is_safe_url("http://nonexistent.invalid/x") is False


def test_multi_a_record_pessimistic_rejection() -> None:
    """If a hostname resolves to MULTIPLE IPs and even one is private,
    the URL is rejected — pessimistic policy. This is the DNS-rebinding
    floor: an attacker can't smuggle a private IP through by including
    one alongside a public one."""
    addrinfo = [
        (2, 1, 6, "", ("8.8.8.8", 0)),         # public
        (2, 1, 6, "", ("127.0.0.1", 0)),       # loopback
    ]
    with patch("url_safety.socket.getaddrinfo", return_value=addrinfo):
        assert is_safe_url("http://multi-a-record.example.org/x") is False


def test_accepts_multi_a_record_all_public() -> None:
    """When every resolved IP is public, the URL passes — multi-A record
    is normal for CDN-fronted hosts and we must not penalise it."""
    addrinfo = [
        (2, 1, 6, "", ("8.8.8.8", 0)),
        (2, 1, 6, "", ("1.1.1.1", 0)),
    ]
    with patch("url_safety.socket.getaddrinfo", return_value=addrinfo):
        assert is_safe_url("https://cdn-host.example.org/x") is True
