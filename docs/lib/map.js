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

// ---------- Icons ----------

const PIN_PATH = "M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z";
const SYMBOLS = {
  cap: "M12 3L1 9l11 6 9-4.91V17h2V9L12 3z M5 13.18v4L12 21l7-3.82v-4L12 17.18 5 13.18z",
  building: "M12 7V3H2v18h20V7H12zM6 19H4v-2h2v2zm0-4H4v-2h2v2zm0-4H4V9h2v2zm0-4H4V5h2v2zm4 12H8v-2h2v2zm0-4H8v-2h2v2zm0-4H8V9h2v2zm0-4H8V5h2v2zm10 12h-8v-8h8v8zm-2-6h-4v4h4v-4z",
  chart: "M5 9.2h3V19H5zM10.6 5h2.8v14h-2.8zm5.6 8H19v6h-2.8z",
};

const getSymbolPath = (type) => {
  if (type.includes("University")) return SYMBOLS.cap;
  if (["IIT", "NIT", "IIIT", "IISc", "IISER"].includes(type)) return SYMBOLS.building;
  if (type === "IIM") return SYMBOLS.chart;
  return "";
};

const createMarkerIcon = (type, color, isActive = false) => {
  const symbol = getSymbolPath(type);
  const size = isActive ? 36 : 28;
  const strokeColor = isActive ? "var(--warn)" : "rgba(255,255,255,0.8)";
  const strokeWidth = isActive ? 2.5 : 1;

  return L.divIcon({
    className: "custom-marker",
    html: `
      <svg width="${size}" height="${size}" viewBox="0 0 24 24" style="filter: drop-shadow(0 2px 2px rgba(0,0,0,0.3));">
        <path d="${PIN_PATH}" fill="${color}" stroke="${strokeColor}" stroke-width="${strokeWidth}" />
        <path d="${symbol}" fill="white" transform="scale(0.5) translate(12, 6)" />
      </svg>
    `,
    iconSize: [size, size],
    iconAnchor: [size / 2, size],
    popupAnchor: [0, -size],
  });
};

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
    const marker = L.marker([inst.lat, inst.lon], {
      icon: createMarkerIcon(inst.type, color),
      interactive: true,
    });
    marker.on("add", () => {
      const el = marker.getElement();
      if (el) {
        el.setAttribute("tabindex", "0");
        el.setAttribute("role", "button");
        el.setAttribute("aria-label", `${inst.name} (${typeLabel(inst.type)})`);
        el.addEventListener("keydown", (e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            marker.openPopup();
          }
        });
      }
    });
    marker.addTo(MAP);
    marker._instId = inst.id;
    marker._campusCity = inst.city;
    MARKERS[inst.id] = marker;
    typeSeen.add(inst.type);

    // Create additional markers for alternate campuses.
    const campuses = CAMPUS_OVERRIDES[inst.id];
    if (campuses) {
      for (const c of campuses) {
        const key = `${inst.id}::${c.city}`;
        const cm = L.marker([c.lat, c.lon], {
          icon: createMarkerIcon(inst.type, color),
          interactive: true,
        });
        cm.on("add", () => {
          const el = cm.getElement();
          if (el) {
            el.setAttribute("tabindex", "0");
            el.setAttribute("role", "button");
            el.setAttribute("aria-label", `${inst.name} — ${c.city} campus (${typeLabel(inst.type)})`);
            el.addEventListener("keydown", (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                cm.openPopup();
              }
            });
          }
        });
        cm.addTo(MAP);
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
    
    // Update marker icon to reflect activity
    if (total === 0) {
      marker.setIcon(createMarkerIcon(inst.type, "#ccc", false));
      marker.setOpacity(0.4);
    } else {
      marker.setIcon(createMarkerIcon(inst.type, color, fieldMatched > 0));
      marker.setOpacity(1.0);
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
