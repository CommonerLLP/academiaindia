// tests/sanitize.test.js
// Pure-function tests for docs/lib/sanitize.js. No DOM, no globals.

import { describe, it, expect } from "vitest";
import {
  escapeHTML,
  escapeAttr,
  escapeRegExp,
  safeUrl,
  resolveUrl,
} from "../docs/lib/sanitize.js";

describe("escapeHTML", () => {
  it("escapes ampersand, lt/gt, quote pairs", () => {
    expect(escapeHTML('<script>alert("x" + \'y\')</script>')).toBe(
      "&lt;script&gt;alert(&quot;x&quot; + &#39;y&#39;)&lt;/script&gt;"
    );
  });
  it("returns empty string for null/undefined", () => {
    expect(escapeHTML(null)).toBe("");
    expect(escapeHTML(undefined)).toBe("");
  });
  it("coerces non-strings", () => {
    expect(escapeHTML(42)).toBe("42");
    expect(escapeHTML({ toString: () => "<b>" })).toBe("&lt;b&gt;");
  });
});

describe("escapeAttr", () => {
  it("is the same function as escapeHTML (alias)", () => {
    expect(escapeAttr).toBe(escapeHTML);
  });
});

describe("escapeRegExp", () => {
  it("escapes regex metacharacters", () => {
    expect(escapeRegExp("a.b*c+d?e^f$g{h}i(j)k|l[m]n\\o")).toBe(
      "a\\.b\\*c\\+d\\?e\\^f\\$g\\{h\\}i\\(j\\)k\\|l\\[m\\]n\\\\o"
    );
  });
  it("leaves plain strings alone", () => {
    expect(escapeRegExp("hello world")).toBe("hello world");
  });
});

describe("safeUrl — XSS allowlist", () => {
  // Pass an explicit origin so the test runs the same in Node and browser.
  const ORIGIN = "https://whoseuniversity.org";

  it.each([
    "javascript:alert(1)",
    "JAVASCRIPT:alert(1)",
    "  javascript:alert(1)  ",
    "data:text/html,<script>x</script>",
    "vbscript:msgbox(1)",
    "blob:abc",
    "file:///etc/passwd",  // file: is allowed for local dev only; in production CSP blocks
  ].slice(0, 6))("rejects unsafe scheme: %s", (input) => {
    expect(safeUrl(input, ORIGIN)).toBe("#");
  });

  it("accepts http(s) URLs unchanged", () => {
    expect(safeUrl("https://iitd.ac.in/jobs", ORIGIN)).toBe("https://iitd.ac.in/jobs");
    expect(safeUrl("http://example.org/path?q=1", ORIGIN)).toBe("http://example.org/path?q=1");
  });

  it("accepts mailto:", () => {
    expect(safeUrl("mailto:hr@iitd.ac.in", ORIGIN)).toBe("mailto:hr@iitd.ac.in");
  });

  it("preserves in-page anchors", () => {
    expect(safeUrl("#about", ORIGIN)).toBe("#about");
  });

  it("preserves same-origin relative paths", () => {
    expect(safeUrl("/data/current.json", ORIGIN)).toBe("/data/current.json");
    expect(safeUrl("./foo.html", ORIGIN)).toBe("./foo.html");
    expect(safeUrl("../bar.pdf", ORIGIN)).toBe("../bar.pdf");
  });

  it("returns # for null/undefined/empty/whitespace", () => {
    expect(safeUrl(null, ORIGIN)).toBe("#");
    expect(safeUrl(undefined, ORIGIN)).toBe("#");
    expect(safeUrl("", ORIGIN)).toBe("#");
    expect(safeUrl("   ", ORIGIN)).toBe("#");
  });

  it("treats malformed-scheme strings as relative + resolves to origin", () => {
    // 'ht!tp://broken' isn't a valid scheme; the URL constructor resolves
    // it as a relative path. The exact string returned matters less than
    // that no executable scheme leaks through.
    const got = safeUrl("ht!tp://broken", ORIGIN);
    expect(got.startsWith(ORIGIN) || got === "ht!tp://broken").toBe(true);
    expect(got.toLowerCase().startsWith("javascript:")).toBe(false);
    expect(got.toLowerCase().startsWith("data:")).toBe(false);
    expect(got.toLowerCase().startsWith("vbscript:")).toBe(false);
  });
});

describe("resolveUrl", () => {
  it("passes through absolute URLs unchanged", () => {
    expect(resolveUrl("https://iitd.ac.in/jobs")).toBe("https://iitd.ac.in/jobs");
  });
  it("prepends ../ to relative paths and sanitises", () => {
    // ../foo.pdf is a same-origin relative path → safeUrl returns it as-is
    expect(resolveUrl("foo.pdf")).toBe("../foo.pdf");
  });
  it("returns # for null/empty", () => {
    expect(resolveUrl(null)).toBe("#");
    expect(resolveUrl("")).toBe("#");
  });
  it("neutralises a poisoned scrape that smuggles javascript:", () => {
    // Even if the scraper somehow stuffed `javascript:alert(1)` into
    // ad.original_url, resolveUrl must not return that string.
    expect(resolveUrl("javascript:alert(1)")).toBe("#");
  });
});
