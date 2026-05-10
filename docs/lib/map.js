// docs/lib/map.js — Leaflet map initialisation + marker updates.
//
// initMap creates the map once (idempotent: a second call just invalidates
// size in case the tab became visible). updateMapMarkers re-paints the
// existing markers based on whatever filter slice the listings tab is
// currently showing — so the map and the listings stay in sync.
//
// Leaflet itself is loaded as a global from CDN — referenced as L. The
// map div #map-container and the legend div #map-legend live in index.html.
//
// MAP and MARKERS are module-local mutable state; nobody outside this
// module needs to read them, hence no exports.

import { state } from "./state.js";
import { fieldTags } from "./classify.js";
import { escapeHTML, escapeAttr, safeUrl } from "./sanitize.js";
import { TYPE_COLORS } from "./card-helpers.js";
// NB: card-helpers.js exports a heuristic `detectAdCampus(ad)` that
// scans free-text for "<City> Campus" / "Campus: <City>" / "based in
// <City>". We deliberately do NOT use it here — the map needs a
// strict whitelist (per-institution, per-campus, with known coords)
// rather than open-ended capture, so we ship CAMPUS_OVERRIDES below.
// `detectAdCampus` is still the right tool for the card label, where
// false-positives are cosmetic; here a false-positive would put the
// marker in the wrong place.

/** Pretty-print an institution-type code for the legend / chip / tooltip. */
export const typeLabel = (type) => ({
  CentralUniversity: "Central University",
  StateUniversity: "State University",
  PrivateUniversity: "Private University",
}[type] || type);

// ---------- Multi-campus support ----------
// A small number of institutions in the registry have one entry but
// run multiple geographic campuses. The registry's lat/lon is the
// "main" campus; ads that explicitly name an alternate campus in
// their text get plotted at that campus's coords instead. Ads that
// don't name a campus stay on the default (main-campus) marker.
//
// Schema: CAMPUS_OVERRIDES[institution_id] = [
//   { city, state, lat, lon, pattern: /\\bCityName\\b/i },
//   ...
// ]
// `pattern` is tested against the ad's title + excerpt + pdf-excerpt.
// First match wins, so order entries by specificity if cities overlap.
//
// Coverage today (deliberately minimal; expand only when both the
// registry has the main campus AND the alternates' lat/lon are
// publicly verifiable):
//
// - Azim Premji University (registry: Bengaluru). Bhopal opened
//   2023, Ranchi opened 2025.
//
// Deferred:
//
// - BITS Pilani (Pilani / Goa / Hyderabad / Dubai). The registry
//   entry `bits-pilani` has no lat/lon, so the main-campus marker
//   isn't created in `initMap()` at all — adding only Goa /
//   Hyderabad here would mean ads not naming either silently
//   disappear from the map. Wire this up after the main-campus
//   coords land in `institutions_registry.json`.
// - IIT Madras (Chennai + Zanzibar) — Zanzibar is too far off the
//   India bounding-box to plot meaningfully on the current map.
export const CAMPUS_OVERRIDES = {
  "azim-premji-university": [
    { city: "Bhopal", state: "Madhya Pradesh", lat: 23.233, lon: 77.434, pattern: /\bBhopal\b/i },
    { city: "Ranchi", state: "Jharkhand",      lat: 23.344, lon: 85.310, pattern: /\bRanchi\b/i },
  ],
};

/** Pure helper: given an ad, return the marker key it should be
 *  counted under. Returns the composite key `"instId::City"` for an
 *  alternate campus, or the bare `institution_id` for the default
 *  (main-campus) marker. Exported so tests can pin the routing.
 */
export function markerKeyForAd(ad) {
  const iid = ad?.institution_id;
  if (!iid) return iid;
  const campuses = CAMPUS_OVERRIDES[iid];
  if (!campuses) return iid;
  const text = `${ad.title || ""} ${ad.raw_text_excerpt || ""} ${ad.pdf_excerpt || ""}`;
  for (const c of campuses) {
    if (c.pattern.test(text)) return `${iid}::${c.city}`;
  }
  return iid;
}

let MAP = null;
const MARKERS = {};

export function initMap() {
  if (MAP) { MAP.invalidateSize(); return; }
  MAP = L.map("map-container").setView([22.5, 82], 5);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    maxZoom: 18,
  }).addTo(MAP);

  const typeSeen = new Set();
  for (const inst of Object.values(state.INSTITUTIONS)) {
    if (!inst.lat || !inst.lon) continue;
    const color = TYPE_COLORS[inst.type] || "#888";
    const marker = L.circleMarker([inst.lat, inst.lon], {
      radius: 7, color, fillColor: color, fillOpacity: 0.85, weight: 1,
    }).addTo(MAP);
    marker._instId = inst.id;
    marker._campusCity = inst.city;
    MARKERS[inst.id] = marker;
    typeSeen.add(inst.type);

    // Create additional markers for alternate campuses.
    const campuses = CAMPUS_OVERRIDES[inst.id];
    if (campuses) {
      for (const c of campuses) {
        const key = `${inst.id}::${c.city}`;
        const cm = L.circleMarker([c.lat, c.lon], {
          radius: 7, color, fillColor: color, fillOpacity: 0.85, weight: 1,
        }).addTo(MAP);
        cm._instId = inst.id;
        cm._campusCity = c.city;
        cm._campusState = c.state;
        MARKERS[key] = cm;
      }
    }
  }

  const legend = document.getElementById("map-legend");
  legend.innerHTML = [...typeSeen].filter(Boolean).sort().map(t =>
    `<div class="map-legend-item"><div class="map-legend-dot" style="background:${TYPE_COLORS[t] || '#888'}"></div>${typeLabel(t)}</div>`
  ).join("") +
  `<div class="map-legend-item"><div class="map-legend-dot" style="background:#1F4E79; outline:2px solid var(--warn); outline-offset:1px;"></div>Field-matched ads open</div>`;
}

export function updateMapMarkers(filteredAds) {
  if (!MAP) return;
  const fieldCount = {}, totalCount = {};
  for (const ad of filteredAds) {
    const key = markerKeyForAd(ad);
    totalCount[key] = (totalCount[key] || 0) + 1;
    if (!fieldTags(ad).includes("Other")) fieldCount[key] = (fieldCount[key] || 0) + 1;
  }
  for (const [key, marker] of Object.entries(MARKERS)) {
    // For alternate campus markers, look up the parent institution.
    const instId = marker._instId;
    const inst = state.INSTITUTIONS[instId] || {};
    const fieldMatched = fieldCount[key] || 0;
    const total = totalCount[key] || 0;
    const color = TYPE_COLORS[inst.type] || "#888";
    if (total === 0) {
      marker.setStyle({ radius: 5, color: "#ccc", fillColor: "#ccc", fillOpacity: 0.3, weight: 1 });
    } else {
      marker.setStyle({
        radius: fieldMatched > 0 ? 10 : 7,
        color: fieldMatched > 0 ? "#b45309" : color,
        fillColor: color, fillOpacity: 0.85,
        weight: fieldMatched > 0 ? 2.5 : 1,
      });
    }
    const coverageUrl = inst.career_page_url_guess || "#";
    const hssLine = fieldMatched > 0 ? `<div class="popup-hss">▲ ${fieldMatched} field-matched ad${fieldMatched > 1 ? "s" : ""}</div>` : "";
    const totalLine = total > 0
      ? `${total} ad${total !== 1 ? "s" : ""} match filters &nbsp;·&nbsp; <a class="popup-link" href="${escapeAttr(safeUrl(coverageUrl))}" target="_blank" rel="noopener noreferrer">career page →</a>`
      : `no ads match current filters &nbsp;·&nbsp; <a class="popup-link" href="${escapeAttr(safeUrl(coverageUrl))}" target="_blank" rel="noopener noreferrer">career page →</a>`;

    // Display campus-specific name for alternate campuses.
    const displayCity = marker._campusCity || inst.city;
    const displayState = marker._campusState || inst.state;
    const campusSuffix = key.includes("::") ? ` — ${displayCity} campus` : "";
    marker.bindPopup(`
      <strong>${escapeHTML(inst.name)}${escapeHTML(campusSuffix)}</strong><br/>
      <span style="color:var(--muted)">${escapeHTML(typeLabel(inst.type))} · ${escapeHTML([displayCity, displayState].filter(Boolean).join(", "))}</span>
      ${hssLine}
      <div style="margin-top:6px">${totalLine}</div>`);
  }

  // Update the map summary bar with counts so the user sees filter feedback.
  // Count unique institutions (collapse campus variants to parent id).
  const instsSeen = new Set();
  for (const key of Object.keys(totalCount)) {
    instsSeen.add(key.includes("::") ? key.split("::")[0] : key);
  }
  const instEl = document.getElementById("map-inst-count");
  const adEl = document.getElementById("map-ad-count");
  if (instEl) instEl.textContent = instsSeen.size;
  if (adEl) adEl.textContent = filteredAds.length;
}
