// tests/map.test.js
// Lightweight checks for map helpers that do not require Leaflet.

import { beforeAll, describe, expect, it } from "vitest";

let map;

beforeAll(async () => {
  globalThis.localStorage = {
    getItem() { return "[]"; },
    setItem() {},
  };
  map = await import("../docs/lib/map.js");
});

describe("typeLabel", () => {
  it("expands registry type codes for display", () => {
    expect(map.typeLabel("CentralUniversity")).toBe("Central University");
    expect(map.typeLabel("PrivateUniversity")).toBe("Private University");
    expect(map.typeLabel("IIT")).toBe("IIT");
  });
});

describe("updateMapMarkers", () => {
  it("is a safe no-op before the Leaflet map is initialized", () => {
    expect(() => map.updateMapMarkers([{ institution_id: "iit-delhi" }])).not.toThrow();
  });
});

describe("markerKeyForAd (multi-campus routing)", () => {
  it("routes single-campus institutions to their bare id", () => {
    expect(map.markerKeyForAd({ institution_id: "iit-delhi", title: "Faculty" }))
      .toBe("iit-delhi");
    expect(map.markerKeyForAd({ institution_id: "iim-bangalore", title: "Faculty" }))
      .toBe("iim-bangalore");
  });

  it("routes APU ads to the named alternate campus", () => {
    expect(
      map.markerKeyForAd({
        institution_id: "azim-premji-university",
        title: "Faculty Positions — Bhopal Campus",
        raw_text_excerpt: "",
      }),
    ).toBe("azim-premji-university::Bhopal");

    expect(
      map.markerKeyForAd({
        institution_id: "azim-premji-university",
        title: "Hiring at the Ranchi campus",
        raw_text_excerpt: "",
      }),
    ).toBe("azim-premji-university::Ranchi");
  });

  it("routes APU ads with no campus mention to the default (Bengaluru) marker", () => {
    expect(
      map.markerKeyForAd({
        institution_id: "azim-premji-university",
        title: "Assistant Professor — School of Liberal Studies",
        raw_text_excerpt: "Apply by 30 June.",
      }),
    ).toBe("azim-premji-university");
  });

  it("matches the campus pattern in any of title, raw_text_excerpt, pdf_excerpt", () => {
    expect(
      map.markerKeyForAd({
        institution_id: "azim-premji-university",
        title: "Assistant Professor",
        raw_text_excerpt: "The position is at the Bhopal campus.",
      }),
    ).toBe("azim-premji-university::Bhopal");

    expect(
      map.markerKeyForAd({
        institution_id: "azim-premji-university",
        title: "Assistant Professor",
        raw_text_excerpt: "",
        pdf_excerpt: "Applications invited for posts at Ranchi.",
      }),
    ).toBe("azim-premji-university::Ranchi");
  });

  it("first-match wins when an ad mentions multiple campuses", () => {
    // CAMPUS_OVERRIDES order is Bhopal then Ranchi; an ad mentioning
    // both should route to Bhopal.
    expect(
      map.markerKeyForAd({
        institution_id: "azim-premji-university",
        title: "Faculty positions at Bhopal and Ranchi campuses",
        raw_text_excerpt: "",
      }),
    ).toBe("azim-premji-university::Bhopal");
  });

  it("returns institution_id unchanged for institutions without campus overrides", () => {
    // BITS Pilani, IIT Madras, etc. have multiple campuses in real life
    // but no CAMPUS_OVERRIDES entry yet (see deferred-list comment in
    // map.js). They should pass through unchanged.
    expect(
      map.markerKeyForAd({
        institution_id: "bits-pilani",
        title: "Faculty at Goa campus",
        raw_text_excerpt: "",
      }),
    ).toBe("bits-pilani");
  });

  it("returns the input unchanged for malformed ads (defensive)", () => {
    expect(map.markerKeyForAd({})).toBeUndefined();
    expect(map.markerKeyForAd({ institution_id: null })).toBeNull();
  });
});

describe("CAMPUS_OVERRIDES (registry contract)", () => {
  it("only defines campuses for institutions whose main campus has registry coords", () => {
    // Half-shipped multi-campus support — where the main campus has
    // no lat/lon — silently drops ads that don't match any pattern,
    // because the bare-id marker doesn't exist in MARKERS. Defensive
    // contract: every key must correspond to an institution whose
    // main-campus marker actually exists.
    //
    // The registry isn't loaded in unit tests, so we just enforce the
    // current allow-list explicitly. Adding a new institution to
    // CAMPUS_OVERRIDES requires verifying its main-campus coords are
    // already in `institutions_registry.json`.
    expect(Object.keys(map.CAMPUS_OVERRIDES).sort()).toEqual([
      "azim-premji-university",
    ]);
  });

  it("all override entries include city, state, lat, lon and a regex pattern", () => {
    for (const [iid, entries] of Object.entries(map.CAMPUS_OVERRIDES)) {
      expect(Array.isArray(entries), `${iid} must map to an array`).toBe(true);
      for (const e of entries) {
        expect(typeof e.city).toBe("string");
        expect(typeof e.state).toBe("string");
        expect(typeof e.lat).toBe("number");
        expect(typeof e.lon).toBe("number");
        expect(e.pattern).toBeInstanceOf(RegExp);
      }
    }
  });
});
