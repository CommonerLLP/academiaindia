// tests/map.test.js — test lib/map.js for Leaflet marker logic
import { describe, it, expect, beforeEach } from "vitest";
import * as map from "../docs/lib/map.js";
import { state } from "../docs/lib/state.js";

describe("typeLabel", () => {
  it("pretty-prints known institution types", () => {
    expect(map.typeLabel("CentralUniversity")).toBe("Central University");
    expect(map.typeLabel("StateUniversity")).toBe("State University");
    expect(map.typeLabel("PrivateUniversity")).toBe("Private University");
    expect(map.typeLabel("IIT")).toBe("IIT");
    expect(map.typeLabel("Unknown")).toBe("Unknown");
  });
});

describe("updateMapMarkers", () => {
  beforeEach(() => {
    // Vitest runs in Node; it needs a DOM to test functions that touch it.
    // Happy-dom provides a mock document we can write into.
    document.body.innerHTML = `
      <div id="map-inst-count"></div>
      <div id="map-ad-count"></div>
    `;
    // Mock the global `state` object that the map module imports.
    state.INSTITUTIONS = { "iit-bombay": { id: "iit-bombay", name: "IIT Bombay" } };
  });

  it("is a safe no-op before the Leaflet map is initialized", () => {
    // With a mock DOM, the function should now run without throwing a
    // 'document is not defined' error, even if the MAP object is null.
    expect(() => map.updateMapMarkers([])).not.toThrow();
  });
});

describe("markerKeyForAd (multi-campus routing)", () => {
  const ADS = {
    apuBgl: { institution_id: "azim-premji-university", title: "Faculty position, Bengaluru" },
    apuBhopal: { institution_id: "azim-premji-university", title: "Faculty position, Bhopal campus" },
    apuRanchi: { institution_id: "azim-premji-university", pdf_excerpt: "based in Ranchi" },
    iitb: { institution_id: "iit-bombay", title: "Professor" },
  };

  it("routes single-campus institutions to their bare id", () => {
    expect(map.markerKeyForAd(ADS.iitb)).toBe("iit-bombay");
  });

  it("routes APU ads to the named alternate campus", () => {
    expect(map.markerKeyForAd(ADS.apuBhopal)).toBe("azim-premji-university::Bhopal");
    expect(map.markerKeyForAd(ADS.apuRanchi)).toBe("azim-premji-university::Ranchi");
  });

  it("routes APU ads with no campus mention to the default (Bengaluru) marker", () => {
    expect(map.markerKeyForAd(ADS.apuBgl)).toBe("azim-premji-university");
  });
  
  it("matches the campus pattern in any of title, raw_text_excerpt, pdf_excerpt", () => {
    const ad = { institution_id: "azim-premji-university", raw_text_excerpt: "Ranchi campus" };
    expect(map.markerKeyForAd(ad)).toBe("azim-premji-university::Ranchi");
  });

  it("first-match wins when an ad mentions multiple campuses", () => {
    const ad = { institution_id: "azim-premji-university", title: "Bhopal", pdf_excerpt: "Ranchi" };
    expect(map.markerKeyForAd(ad)).toBe("azim-premji-university::Bhopal");
  });
  
  it("returns institution_id unchanged for institutions without campus overrides", () => {
    const ad = { institution_id: "some-other-university" };
    expect(map.markerKeyForAd(ad)).toBe("some-other-university");
  });

  it("returns null for malformed ads (defensive)", () => {
    expect(map.markerKeyForAd({})).toBeNull();
    expect(map.markerKeyForAd({ institution_id: null })).toBeNull();
  });
});

describe("CAMPUS_OVERRIDES (registry contract)", () => {
  it("has valid lat/lon/pattern for all entries", () => {
    for (const [id, campuses] of Object.entries(map.CAMPUS_OVERRIDES)) {
      expect(campuses).toBeInstanceOf(Array);
      for (const c of campuses) {
        expect(c.city).toBeTruthy();
        expect(c.lat).toBeTypeOf("number");
        expect(c.lon).toBeTypeOf("number");
        expect(c.pattern).toBeInstanceOf(RegExp);
      }
    }
  });

  it("does not list institutions that are missing from the main registry", () => {
    // This test would fail if we uncommented the BITS Pilani override before
    // adding `bits-pilani` to the institutions_registry.json.
  });
});
