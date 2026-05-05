// docs/lib/sanitize.js — pure HTML- and URL-safety helpers.
//
// All functions here are pure (no DOM, no globals, no side effects) so
// they're trivially testable. Both docs/app.js (in browser, as ESM) and
// the Vitest suite (in Node) import from this module.

/** Escape HTML entities so a string is safe to inject into innerHTML. */
export function escapeHTML(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;",
  }[c]));
}

/** Same as escapeHTML — semantics differ but both produce attr-safe output. */
export const escapeAttr = escapeHTML;

/** Escape regex metacharacters so a string can be embedded in a regex. */
export function escapeRegExp(s) {
  return String(s ?? "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// URL allowlist. Renderer is fed third-party scrape data; an `apply_url`
// of "javascript:alert(1)" or "data:text/html,…" would otherwise execute
// or smuggle content on click. Validate every rendered href: only http,
// https, mailto, and file (for local dev) are honoured. Anything else is
// neutralised to "#" — the link still renders, but cannot navigate.
//
// `origin` is injected so the function works in Node tests (where
// window.location is undefined).
const SAFE_SCHEMES = new Set(["http:", "https:", "mailto:", "file:"]);
export function safeUrl(u, origin = (typeof window !== "undefined" ? window.location.origin : "http://localhost")) {
  if (u == null) return "#";
  const s = String(u).trim();
  if (!s) return "#";
  if (s.startsWith("#")) return s;                                   // in-page anchor
  if (s.startsWith("/") || s.startsWith("./") || s.startsWith("../")) return s; // same-origin
  try {
    const parsed = new URL(s, origin);
    if (SAFE_SCHEMES.has(parsed.protocol.toLowerCase())) {
      return parsed.toString();
    }
  } catch (_) { /* fall through */ }
  return "#";
}

/** Resolve relative-path URLs (legacy ../ prefix) and sanitise scheme.
 *
 * Order matters: validate scheme FIRST, then prefix. Otherwise an input
 * like "javascript:alert(1)" gets prefixed to "../javascript:alert(1)"
 * which safeUrl would accept as a same-origin path (and the browser would
 * resolve to <origin>/javascript:alert(1) — a 404, but a confusing one).
 * Better to neutralise to "#" so the link signals "not navigable". */
export function resolveUrl(u) {
  if (u == null) return "#";
  const s = String(u).trim();
  if (!s) return "#";
  // Has any scheme (matches /^[scheme]:/)? Validate scheme via safeUrl.
  if (/^[a-z][a-z0-9+.-]*:/i.test(s)) return safeUrl(s);
  // No scheme. Path-like inputs are safe; prefix legacy bare paths with ../
  // for the scraper-cache resolution.
  if (s.startsWith("/") || s.startsWith("#")) return s;
  return "../" + s;
}
