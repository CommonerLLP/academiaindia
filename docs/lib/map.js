// docs/lib/map.js — Leaflet map initialisation + marker updates.

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

// ---------- Multi-campus support ----------
export const CAMPUS_OVERRIDES = {
  "azim-premji-university": [
    { city: "Bhopal", state: "Madhya Pradesh", lat: 23.233, lon: 77.434, pattern: /\bBhopal\b/i },
    { city: "Ranchi", state: "Jharkhand",      lat: 23.344, lon: 85.310, pattern: /\bRanchi\b/i },
  ],
};

export function markerKeyForAd(ad) {
  const iid = ad?.institution_id;
  if (!iid) return null;
  const campuses = CAMPUS_OVERRIDES[iid];
  if (!campuses) return iid;
  const text = `${ad.title || ""} ${ad.raw_text_excerpt || ""} ${ad.pdf_excerpt || ""}`.toLowerCase();
  for (const c of campuses) {
    if (c.pattern.test(text)) return `${iid}::${c.city}`;
  }
  return iid;
}

let MAP = null;
let CLUSTER_GROUP = null;
const MARKERS = {};

// ---------- Icons ----------
const SYMBOLS = {
  cap: "M12 3L1 9l11 6 9-4.91V17h2V9L12 3z M5 13.18v4L12 21l7-3.82v-4L12 17.18 5 13.18z",
  building: "M12 7V3H2v18h20V7H12zM6 19H4v-2h2v2zm0-4H4v-2h2v2zm0-4H4V9h2v2zm0-4H4V5h2v2zm4 12H8v-2h2v2zm0-4H8v-2h2v2zm0-4H8V9h2v2zm0-4H8V5h2v2zm10 12h-8v-8h8v8zm-2-6h-4v4h4v-4z",
  chart: "M5 9.2h3V19H5zM10.6 5h2.8v14h-2.8zm5.6 8H19v6h-2.8z",
};

const getSymbolPath = (type) => {
  const t = type || "";
  if (t.includes("University")) return SYMBOLS.cap;
  if (["IIT", "NIT", "IIIT", "IISc", "IISER"].includes(t)) return SYMBOLS.building;
  if (t === "IIM") return SYMBOLS.chart;
  return SYMBOLS.cap;
};

const createMarkerIcon = (type, color, count = 0, isActive = false) => {
  const symbol = getSymbolPath(type);
  const showCount = count > 0;
  const width = showCount ? (count > 9 ? 48 : 42) : 16;
  const height = 24;
  const safeColor = color || "#888";

  let html = "";
  if (showCount) {
    const activeClass = isActive ? "custom-marker-active has-field-match" : "custom-marker-active";
    html = `
      <div class="${activeClass}" style="--marker-bg: ${safeColor}; width: ${width}px; height: ${height}px;">
        <svg width="12" height="12" viewBox="0 0 24 24"><path d="${symbol}" fill="white" /></svg>
        <span>${count}</span>
      </div>
    `;
  } else {
    html = `
      <div class="custom-marker-inactive">
        <svg width="8" height="8" viewBox="0 0 24 24"><path d="${symbol}" fill="#999" /></svg>
      </div>
    `;
  }

  return L.divIcon({
    className: "map-pill-wrap",
    html: html,
    iconSize: [width, height + 6],
    iconAnchor: [width / 2, height + 6],
    popupAnchor: [0, -(height + 6)],
  });
};

const createClusterIcon = (cluster) => {
  const markers = cluster.getAllChildMarkers();
  let totalJobs = 0;
  const instsInCluster = new Set();
  
  markers.forEach(m => {
    totalJobs += (m._currentTotalCount || 0);
    instsInCluster.add(m._instId);
  });

  const count = totalJobs;
  const instCount = instsInCluster.size;
  const width = count > 99 ? 64 : 54;
  const height = 28;
  const clusterColor = "#123f73";

  return L.divIcon({
    className: "map-cluster-pill-wrap",
    html: `
      <div class="custom-marker-active cluster-pill" style="--marker-bg: ${clusterColor}; width: ${width}px; height: ${height}px; border-width: 3px; font-size: 11px; gap: 2px;">
        <span style="font-weight: 400; opacity: 0.9;">${instCount}🏛️</span>
        <span style="border-left: 1px solid rgba(255,255,255,0.3); padding-left: 4px;">${count}</span>
      </div>
    `,
    iconSize: [width, height],
    iconAnchor: [width / 2, height / 2],
  });
};

export function initMap() {
  if (MAP) { MAP.invalidateSize(); return; }
  const container = document.getElementById("map-container");
  if (!container) return;
  
  MAP = L.map(container).setView([22.5, 82], 5);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    maxZoom: 18,
  }).addTo(MAP);

  // Initialize Cluster Group with Airbnb-style tuning
  CLUSTER_GROUP = L.markerClusterGroup({
    showCoverageOnHover: false,
    maxClusterRadius: 70, // Bunches markers within 70px
    disableClusteringAtZoom: 10, // At zoom 10, always show individual institutions
    spiderfyOnMaxZoom: true,
    iconCreateFunction: createClusterIcon
  });
  MAP.addLayer(CLUSTER_GROUP);

  for (const inst of Object.values(state.INSTITUTIONS)) {
    if (!inst.lat || !inst.lon) continue;
    const color = TYPE_COLORS[inst.type] || "#888";
    
    const marker = L.marker([inst.lat, inst.lon], {
      icon: createMarkerIcon(inst.type, color),
      interactive: true,
      keyboard: true,
      title: inst.name
    });
    
    marker._instId = inst.id;
    marker._campusCity = inst.city;
    marker._currentTotalCount = 0; // Track for cluster aggregation
    MARKERS[inst.id] = marker;
    CLUSTER_GROUP.addLayer(marker);

    // Alternate campuses
    const campuses = CAMPUS_OVERRIDES[inst.id];
    if (campuses) {
      for (const c of campuses) {
        const key = `${inst.id}::${c.city}`;
        const cm = L.marker([c.lat, c.lon], {
          icon: createMarkerIcon(inst.type, color),
          interactive: true,
          keyboard: true,
          title: `${inst.name} (${c.city})`
        });
        cm._instId = inst.id;
        cm._campusCity = c.city;
        cm._campusState = c.state;
        cm._currentTotalCount = 0;
        MARKERS[key] = cm;
        CLUSTER_GROUP.addLayer(cm);
      }
    }
  }

  const legend = document.getElementById("map-legend");
  if (legend) {
    legend.innerHTML = [
      `<div class="map-legend-item"><div class="map-legend-dot" style="background:#000080" aria-label="Blue"></div>Central University</div>`,
      `<div class="map-legend-item"><div class="map-legend-dot" style="background:#58a6ff" aria-label="Light Blue"></div>Technical (IIT/IISc)</div>`,
      `<div class="map-legend-item"><div class="map-legend-dot" style="background:#F47C20" aria-label="Saffron"></div>IIM / Private</div>`,
      `<div class="map-legend-item"><div class="map-legend-dot" style="background:#123f73; border-radius: 4px;" aria-label="Navy"></div>Regional Cluster</div>`
    ].join("");
  }
}

export function updateMapMarkers(filteredAds) {
  const instEl = document.getElementById("map-inst-count");
  const adEl = document.getElementById("map-ad-count");
  
  const fieldCount = {}, totalCount = {}, instsSeen = new Set();
  for (const ad of filteredAds) {
    const key = markerKeyForAd(ad);
    if (!key) continue;
    totalCount[key] = (totalCount[key] || 0) + 1;
    if (!fieldTags(ad).includes("Other")) fieldCount[key] = (fieldCount[key] || 0) + 1;
    instsSeen.add(key.includes("::") ? key.split("::")[0] : key);
  }

  if (instEl) instEl.textContent = instsSeen.size;
  if (adEl) adEl.textContent = filteredAds.length;

  if (!MAP || !CLUSTER_GROUP) return;

  for (const [key, marker] of Object.entries(MARKERS)) {
    const instId = marker._instId;
    const inst = state.INSTITUTIONS[instId] || {};
    const fieldMatched = fieldCount[key] || 0;
    const total = totalCount[key] || 0;
    const color = TYPE_COLORS[inst.type] || "#888";
    
    // Store live count on marker for cluster calculation
    marker._currentTotalCount = total;
    
    marker.setIcon(createMarkerIcon(inst.type, color, total, fieldMatched > 0));
    marker.setOpacity(total === 0 ? 0.4 : 1.0);
    
    const coverageUrl = inst.career_page_url_guess || "#";
    const hssLine = fieldMatched > 0 ? `<div class="popup-hss">▲ ${fieldMatched} field-matched ad${fieldMatched > 1 ? "s" : ""}</div>` : "";
    const totalLine = total > 0 ? `${total} ad${total !== 1 ? "s" : ""} match filters` : `no ads match filters`;

    const displayCity = marker._campusCity || inst.city;
    const displayState = marker._campusState || inst.state;
    const campusSuffix = key.includes("::") ? ` — ${displayCity} campus` : "";
    
    marker.bindPopup(`
      <strong>${escapeHTML(inst.name)}${escapeHTML(campusSuffix)}</strong><br/>
      <span style="color:var(--muted)">${escapeHTML(typeLabel(inst.type))} · ${escapeHTML([displayCity, displayState].filter(Boolean).join(", "))}</span>
      ${hssLine}
      <div style="margin-top:6px">${totalLine}</div>
      <div style="margin-top:4px"><a class="popup-link" href="${escapeAttr(safeUrl(coverageUrl))}" target="_blank" rel="noopener noreferrer">career page →</a></div>`);
  }

  // Force cluster refresh to pick up new internal marker counts
  CLUSTER_GROUP.refreshClusters();
}
