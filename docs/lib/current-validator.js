// docs/lib/current-validator.js — browser-safe shape gate for current.json.
//
// This is intentionally lighter than docs/lib/schema.js. The Zod schema is
// useful in Vitest as executable documentation; this module is dependency-free
// so app.js can import it directly on GitHub Pages without a build step.

const URL_FIELDS = ["apply_url", "original_url", "info_url", "annexure_pdf_url"];
const SAFE_SCHEMES = new Set(["http:", "https:", "mailto:", "file:"]);
const UNSAFE_TEXT_RE = /<\s*script\b|javascript\s*:|data\s*:\s*text\/html/i;

function isObject(value) {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

function isSafeUrl(value) {
  const s = String(value ?? "").trim();
  if (!s) return true;
  if (s.startsWith("#") || s.startsWith("/") || s.startsWith("./") || s.startsWith("../")) return true;
  try {
    const parsed = new URL(s, "https://whoseuniversity.org");
    return SAFE_SCHEMES.has(parsed.protocol.toLowerCase());
  } catch {
    return false;
  }
}

function hasUnsafeString(value) {
  if (typeof value === "string") return UNSAFE_TEXT_RE.test(value);
  if (Array.isArray(value)) return value.some(hasUnsafeString);
  if (isObject(value)) return Object.values(value).some(hasUnsafeString);
  return false;
}

function validateAd(ad, index) {
  const errors = [];
  if (!isObject(ad)) return [`ads[${index}] must be an object`];
  if (!String(ad.id ?? "").trim()) errors.push(`ads[${index}].id must be non-empty`);
  if (!String(ad.institution_id ?? "").trim()) errors.push(`ads[${index}].institution_id must be non-empty`);
  for (const field of URL_FIELDS) {
    const value = ad[field];
    if (value == null || value === "") continue;
    if (typeof value !== "string") errors.push(`ads[${index}].${field} must be a string or null`);
    else if (!isSafeUrl(value)) errors.push(`ads[${index}].${field} has unsafe URL scheme`);
  }
  if (hasUnsafeString(ad)) errors.push(`ads[${index}] contains unsafe script-like content`);
  return errors;
}

export function validateCurrentShape(parsed) {
  if (!isObject(parsed)) {
    return { ok: false, ads: [], invalid: [], errors: ["current.json must be an object"] };
  }
  if (!Array.isArray(parsed.ads)) {
    return { ok: false, ads: [], invalid: [], errors: ["current.json ads must be an array"] };
  }

  const ads = [];
  const invalid = [];
  for (let i = 0; i < parsed.ads.length; i++) {
    const errors = validateAd(parsed.ads[i], i);
    if (errors.length) invalid.push({ index: i, ad: parsed.ads[i], errors });
    else ads.push(parsed.ads[i]);
  }

  const errors = [];
  if (parsed.ads.length === 0) errors.push("current.json ads must be non-empty");
  if (typeof parsed.ad_count === "number" && parsed.ad_count !== parsed.ads.length) {
    errors.push(`ad_count is ${parsed.ad_count}, but ads contains ${parsed.ads.length} records`);
  }

  return { ok: errors.length === 0, ads, invalid, errors };
}
