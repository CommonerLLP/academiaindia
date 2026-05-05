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
