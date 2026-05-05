// tests/current-validator.test.js
// Browser-safe current.json boundary checks used by docs/app.js.

import { describe, it, expect } from "vitest";
import { validateCurrentShape } from "../docs/lib/current-validator.js";

describe("validateCurrentShape", () => {
  it("accepts a realistic minimal current.json payload", () => {
    const result = validateCurrentShape({
      ad_count: 2,
      ads: [
        { id: "a1", institution_id: "iit-delhi", original_url: "https://home.iitd.ac.in/jobs" },
        { id: "a2", institution_id: "jnu", apply_url: "/apply.html" },
      ],
    });

    expect(result.ok).toBe(true);
    expect(result.ads.map(ad => ad.id)).toEqual(["a1", "a2"]);
    expect(result.invalid).toEqual([]);
    expect(result.errors).toEqual([]);
  });

  it("rejects top-level malformed payloads", () => {
    expect(validateCurrentShape(null).ok).toBe(false);
    expect(validateCurrentShape({ ads: "not an array" }).ok).toBe(false);
    expect(validateCurrentShape({ ads: [] }).ok).toBe(false);
  });

  it("flags ad_count mismatches without dropping otherwise valid ads", () => {
    const result = validateCurrentShape({
      ad_count: 99,
      ads: [{ id: "a1", institution_id: "iit-delhi" }],
    });

    expect(result.ok).toBe(false);
    expect(result.ads.length).toBe(1);
    expect(result.errors[0]).toMatch(/ad_count is 99/);
  });

  it("drops ads missing canonical identifiers", () => {
    const result = validateCurrentShape({
      ads: [
        { id: "good", institution_id: "iit-delhi" },
        { id: "", institution_id: "iit-bombay" },
        { id: "missing-inst" },
      ],
    });

    expect(result.ok).toBe(true);
    expect(result.ads.map(ad => ad.id)).toEqual(["good"]);
    expect(result.invalid).toHaveLength(2);
  });

  it("drops ads with unsafe rendered URLs", () => {
    const result = validateCurrentShape({
      ads: [
        { id: "good", institution_id: "iit-delhi", apply_url: "mailto:hr@example.org" },
        { id: "bad-js", institution_id: "iit-delhi", apply_url: "javascript:alert(1)" },
        { id: "bad-data", institution_id: "iit-delhi", original_url: "data:text/html,<script>x</script>" },
      ],
    });

    expect(result.ads.map(ad => ad.id)).toEqual(["good"]);
    expect(result.invalid.map(row => row.index)).toEqual([1, 2]);
  });

  it("recursively drops ads containing script-like strings", () => {
    const result = validateCurrentShape({
      ads: [
        { id: "good", institution_id: "iit-delhi", structured_position: { areas: ["Sociology"] } },
        { id: "bad", institution_id: "iit-delhi", structured_position: { areas: ["<script>alert(1)</script>"] } },
      ],
    });

    expect(result.ads.map(ad => ad.id)).toEqual(["good"]);
    expect(result.invalid[0].errors.join(" ")).toMatch(/unsafe script-like/);
  });
});
