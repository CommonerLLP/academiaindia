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

/** Pretty-print an institution-type code for the legend / chip / tooltip. */
export const typeLabel = (type) => ({
  CentralUniversity: "Central University",
  StateUniversity: "State University",
  PrivateUniversity: "Private University",
}[type] || type);

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
    MARKERS[inst.id] = marker;
    typeSeen.add(inst.type);
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
    const iid = ad.institution_id;
    totalCount[iid] = (totalCount[iid] || 0) + 1;
    if (!fieldTags(ad).includes("Other")) fieldCount[iid] = (fieldCount[iid] || 0) + 1;
  }
  for (const [id, marker] of Object.entries(MARKERS)) {
    const inst = state.INSTITUTIONS[id];
    const fieldMatched = fieldCount[id] || 0;
    const total = totalCount[id] || 0;
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
    marker.bindPopup(`
      <strong>${escapeHTML(inst.name)}</strong><br/>
      <span style="color:var(--muted)">${escapeHTML(typeLabel(inst.type))} · ${escapeHTML([inst.city, inst.state].filter(Boolean).join(", "))}</span>
      ${hssLine}
      <div style="margin-top:6px">${totalLine}</div>`);
  }
}
