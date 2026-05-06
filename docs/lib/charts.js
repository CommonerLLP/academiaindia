// docs/lib/charts.js — Vacancies / Gap-tab chart renderers.
//
// Extracted from app.js as a single module. All functions are pure SVG-
// string generators: they take `snaps` (vacancy_snapshots.json) or no
// argument, and return an HTML/SVG string. No DOM access, no global
// state, no side effects. The only external dependency is escapeHTML
// (for label sanitisation).


// Parliamentary-questions corpus + questioner roster — moved here from
// app.js since the chart functions are the only consumers.
export const LS_DISCLOSURE = [
  // RS — early baseline
  { qno: "RS AU1338", date: "2020-09-22", subject: "VC vacancies (refused timeline)",            asker: "C.M. Ramesh",         total: "N", cat: "N", inst: "N" },
  { qno: "RS AU1938", date: "2022-08-03", subject: "Vacancies in Central Universities",          asker: "Sumer Singh Solanki", total: "Y", cat: "N", inst: "P" },
  { qno: "RS AS374",  date: "2022-04-06", subject: "Status of vacancies in CUs",                 asker: "Sujeet Kumar",        total: "Y", cat: "N", inst: "P" },
  { qno: "RS AU841",  date: "2022-02-09", subject: "Tamil Dept faculty at DU",                   asker: "P. Wilson",           total: "Y", cat: "Y", inst: "Y" },
  { qno: "RS AS153",  date: "2023-03-15", subject: "Faculty Vacancies CUs/IITs/IIMs (PwBD!)",   asker: "C.M. Ramesh",         total: "Y", cat: "Y", inst: "P" },
  { qno: "RS AS215",  date: "2023-08-09", subject: "Vacancies in Central Universities",          asker: "John Brittas",        total: "Y", cat: "N", inst: "N" },
  { qno: "RS AU2273", date: "2023-08-09", subject: "Monthly monitoring mechanism",                asker: "M. Mohamed Abdulla",  total: "Y", cat: "N", inst: "P" },
  { qno: "RS AU2280", date: "2023-08-09", subject: "Technical staff vacancies (univ-wise)",       asker: "Muzibulla Khan",      total: "Y", cat: "N", inst: "Y" },
  { qno: "RS AU2282", date: "2023-08-09", subject: "CU Anantapuram",                              asker: "V. Vijayasai Reddy", total: "Y", cat: "N", inst: "Y" },
  { qno: "RS AU1941", date: "2023-12-20", subject: "Vacancies in CUs/IITs (Vaiko)",               asker: "Vaiko",               total: "P", cat: "Y", inst: "N" },
  { qno: "RS AU512",  date: "2024-02-07", subject: "Backlog OBC/SC/ST/EWS vacancies",             asker: "Ram Nath Thakur",     total: "P", cat: "Y", inst: "N" },
  // LS — start of LS corpus
  { qno: "LS AU81",   date: "2024-07-22", subject: "Reserved Vacancies in HEIs",                    asker: "Dharmendra Yadav",      total: "Y", cat: "Y", inst: "N" },
  { qno: "LS AS99",   date: "2024-07-29", subject: "Vacant Teaching Posts in CUs",                   asker: "Bachhav Shobha Dinesh", total: "Y", cat: "N", inst: "P" },
  { qno: "LS AU1122", date: "2024-07-29", subject: "Vacancies in IIT Tirupati",                      asker: "Balashowry Vallabhaneni", total: "Y", cat: "N", inst: "Y" },
  { qno: "RS AU191",  date: "2024-07-24", subject: "Faculty vacancies in HEIs",                     asker: "(RS unknown)",         total: "P", cat: "N", inst: "N" },
  { qno: "RS AU1796", date: "2024-08-07", subject: "Vacancies in HEIs",                             asker: "(RS unknown)",         total: "P", cat: "N", inst: "N" },
  { qno: "LS AU47",   date: "2024-11-25", subject: "Vacant Teaching Posts in CUs",                   asker: "Parambil + Selvaganapathi + Veeraswamy", total: "Y", cat: "Y", inst: "N" },
  { qno: "RS AU178",  date: "2024-11-27", subject: "Vacancies in Central Universities",              asker: "Rajeev Shukla",        total: "Y", cat: "N", inst: "N" },
  { qno: "RS AU185",  date: "2024-11-27", subject: "Vacancies in CU Koraput, Odisha",                asker: "Muzibulla Khan",       total: "Y", cat: "N", inst: "Y" },
  { qno: "RS AU195",  date: "2024-11-27", subject: "Vacancies in CFHEIs (Mukul Wasnik)",             asker: "Mukul Wasnik",         total: "Y", cat: "Y", inst: "N" },
  { qno: "RS AU994",  date: "2024-12-04", subject: "Vacancies in CUs (Derek O'Brien)",               asker: "Derek O'Brien",        total: "Y", cat: "Y", inst: "P" },
  { qno: "LS AU2298", date: "2024-12-09", subject: "VC + Professors at LNIPE",                       asker: "Bharat Singh Kushwah", total: "Y", cat: "N", inst: "Y" },
  { qno: "RS AS255",  date: "2024-12-18", subject: "Vacancies of faculty in IITs/NITs/IIMs",         asker: "M. Thambidurai",       total: "P", cat: "N", inst: "N" },
  { qno: "RS AU2597", date: "2024-12-18", subject: "Teaching/Non-Teaching vacancies in CUs",         asker: "Debashish Samantaray", total: "Y", cat: "N", inst: "N" },
  { qno: "RS AU2613", date: "2024-12-18", subject: "Details of vacancies of teachers in HEIs",       asker: "Javed Ali Khan + Ramji Lal Suman", total: "N", cat: "N", inst: "N" },
  { qno: "LS AU1111", date: "2025-02-10", subject: "Sanctioned Posts and Vacancies in HEIs",         asker: "K Radhakrishnan",      total: "N", cat: "N", inst: "N" },
  { qno: "LS AS328",  date: "2025-03-24", subject: "Vacant Teaching Posts in CUs (State-wise)",      asker: "K Gopinath",           total: "Y", cat: "N", inst: "P" },
  { qno: "RS AU3570", date: "2025-04-02", subject: "IIT Bhubaneswar (refused SC/ST data)",           asker: "Bishi + Sulata Deo",   total: "Y", cat: "N", inst: "Y" },
  { qno: "LS AU45",   date: "2025-07-21", subject: "Vacancy of Teaching Posts in Central Inst.",    asker: "Murari Lal Meena + Babu Singh Kushwaha", total: "N", cat: "N", inst: "N" },
  { qno: "RS AU365 ★", date: "2025-07-23", subject: "Reserved-cat vacancies (KHARGE)",                asker: "Mallikarjun Kharge (LoP RS)", total: "Y", cat: "Y", inst: "Y" },
  { qno: "RS AU369",  date: "2025-07-23", subject: "Vacancies in KVS/NVS/NCERT",                     asker: "Ajay Makan",           total: "Y", cat: "N", inst: "Y" },
  { qno: "LS AU1206", date: "2025-07-28", subject: "Vacancies of Faculties in CUs",                  asker: "Sayani Ghosh + Selvaraj V + Subbarayan K", total: "Y", cat: "N", inst: "N" },
  { qno: "LS AU2348", date: "2025-08-04", subject: "Vacancies in NITs, IITs, Medical Inst.",         asker: "Raja A",               total: "P", cat: "N", inst: "P" },
  { qno: "LS AU2497", date: "2025-08-04", subject: "Vacancies in IIT Guwahati",                      asker: "Kamakhya Prasad Tasa", total: "N", cat: "N", inst: "N" },
  { qno: "RS AU1949", date: "2025-08-06", subject: "Vacancies in IITs",                              asker: "Vikramjit Singh Sahney", total: "N", cat: "N", inst: "N" },
  { qno: "RS AU1962", date: "2025-08-06", subject: "Vacancies in CUs (Jose K. Mani)",                asker: "Jose K. Mani",         total: "Y", cat: "Y", inst: "N" },
  { qno: "LS AU3613", date: "2025-08-11", subject: "Vacancy of Faculties in HEIs",                   asker: "Sanjay Uttamrao Deshmukh", total: "P", cat: "N", inst: "P" },
  { qno: "LS AU3515", date: "2025-08-11", subject: "Vacancies in Schools, Colleges, Universities",  asker: "Warring + Hansdak + Kale", total: "P", cat: "N", inst: "N" },
  { qno: "RS AU354",  date: "2025-12-03", subject: "Vacancies in CUs (Prakash Chik Baraik)",         asker: "Prakash Chik Baraik",  total: "P", cat: "Y", inst: "N" },
  { qno: "RS AU1145", date: "2025-12-10", subject: "Vacancies in CUs (Brittas — second time)",       asker: "John Brittas",         total: "N", cat: "Y", inst: "N" },
  { qno: "LS AU2521", date: "2025-12-15", subject: "Director vacant — NIT Srinagar",                 asker: "Mian Altaf Ahmad",      total: "N", cat: "N", inst: "Y" },
  { qno: "LS AU318",  date: "2026-02-02", subject: "Vacant Posts at VBU + IIT KGP + IIM Calcutta",   asker: "Mala Roy",             total: "N", cat: "N", inst: "N" },
  { qno: "LS AU414",  date: "2026-02-02", subject: "Vacant Associate Professor posts (category-wise)", asker: "Faggan Singh Kulaste", total: "N", cat: "N", inst: "N" },
  { qno: "RS AU539",  date: "2026-02-04", subject: "CU/IIT/NIT/IIM faculty (Abdul Wahab)",           asker: "Abdul Wahab",          total: "N", cat: "N", inst: "N" },
  { qno: "LS AU1476", date: "2026-02-09", subject: "Filling up of Faculty Vacancies (post-SC order)", asker: "Abdussamad Samadani + Hayer", total: "N", cat: "N", inst: "N" },
  { qno: "LS AS207",  date: "2026-02-13", subject: "Vacancy in AIIMS",                               asker: "Kishori Lal + Bapi Haldar", total: "Y", cat: "N", inst: "Y" },
  { qno: "LS AU2457", date: "2026-02-13", subject: "Vacancies in Central Medical Institutes",       asker: "(MoHFW)",               total: "Y", cat: "Y", inst: "Y" },
  { qno: "RS AU2118", date: "2026-03-11", subject: "Faculty vacancies in CUs (Tankha)",              asker: "Vivek K. Tankha",      total: "N", cat: "N", inst: "N" },
  { qno: "RS AU2120", date: "2026-03-11", subject: "Vacancies in HEIs (Sushmita Dev)",               asker: "Sushmita Dev",         total: "N", cat: "N", inst: "N" },
  { qno: "LS AU3535", date: "2026-03-13", subject: "Vacant Posts in AIIMS and JIPMER",               asker: "(MoHFW)",               total: "Y", cat: "P", inst: "Y" },
  { qno: "LS AU3742", date: "2026-03-16", subject: "Vacant Teaching/Non-Teaching Posts in CUs",      asker: "Iqra Choudhary + Priya Saroj + Behanan + Pushpendra Saroj", total: "N", cat: "N", inst: "N" },
  { qno: "LS AU3814", date: "2026-03-16", subject: "Recruitment of Reserved Vacancies in CUs/IITs",  asker: "Sudha R + Raja A",     total: "N", cat: "N", inst: "N" },
  { qno: "LS AU4638", date: "2026-03-20", subject: "Vacancies of Teaching/Non-Teaching Staff",       asker: "(MoHFW)",               total: "Y", cat: "N", inst: "Y" },
  { qno: "RS AU3334", date: "2026-03-20", subject: "Vacancies in HEIs",                              asker: "(RS Mar 2026)",        total: "P", cat: "N", inst: "N" },
  { qno: "LS AU5040", date: "2026-03-23", subject: "Teaching Posts in CUs/Central Institutes",       asker: "Lalji Verma",          total: "P", cat: "Y", inst: "N" },
  { qno: "RS AU3643", date: "2026-03-24", subject: "HEI vacancies",                                  asker: "(RS Mar 2026)",        total: "P", cat: "N", inst: "N" },
  { qno: "LS AU5842", date: "2026-03-30", subject: "VC, Registrars, Academic Administrators in HEIs", asker: "Sayani Ghosh",         total: "P", cat: "Y", inst: "N" },
];

export const LS_QUESTIONERS = [
  { name: "Sayani Ghosh", party: "TMC", state: "West Bengal", count: 2 },
  { name: "Raja A", party: "DMK", state: "Tamil Nadu", count: 2 },
  { name: "Sudha R", party: "DMK", state: "Tamil Nadu", count: 1 },
  { name: "Dharmendra Yadav", party: "SP", state: "Uttar Pradesh", count: 1 },
  { name: "Selvaganapathi T.M.", party: "DMK", state: "Tamil Nadu", count: 1 },
  { name: "Shafi Parambil", party: "INC", state: "Kerala", count: 1 },
  { name: "Kalanidhi Veeraswamy", party: "DMK", state: "Tamil Nadu", count: 1 },
  { name: "K Radhakrishnan", party: "CPI(M)", state: "Kerala", count: 1 },
  { name: "K Gopinath", party: "DMK", state: "Tamil Nadu", count: 1 },
  { name: "Murari Lal Meena", party: "INC", state: "Rajasthan", count: 1 },
  { name: "Babu Singh Kushwaha", party: "SP", state: "Uttar Pradesh", count: 1 },
  { name: "Selvaraj V", party: "CPI", state: "Tamil Nadu", count: 1 },
  { name: "Subbarayan K", party: "CPI(M)", state: "Tamil Nadu", count: 1 },
  { name: "Iqra Choudhary", party: "SP", state: "Uttar Pradesh", count: 1 },
  { name: "Priya Saroj", party: "SP", state: "Uttar Pradesh", count: 1 },
  { name: "Pushpendra Saroj", party: "SP", state: "Uttar Pradesh", count: 1 },
  { name: "Benny Behanan", party: "INC", state: "Kerala", count: 1 },
  { name: "Lalji Verma", party: "SP", state: "Uttar Pradesh", count: 1 },
  { name: "Mala Roy", party: "TMC", state: "West Bengal", count: 1 },
  { name: "Abdussamad Samadani", party: "IUML", state: "Kerala", count: 1 },
  { name: "Gurmeet Singh Meet Hayer", party: "AAP", state: "Punjab", count: 1 },
  { name: "Sanjay Uttamrao Deshmukh", party: "SS(UBT)", state: "Maharashtra", count: 1 },
  // RS questioners
  { name: "Mallikarjun Kharge ★", party: "INC (LoP RS)", state: "Karnataka", count: 1 },
  { name: "John Brittas", party: "CPI(M)", state: "Kerala", count: 2 },
  { name: "C.M. Ramesh", party: "BJP", state: "Andhra Pradesh", count: 2 },
  { name: "Mukul Wasnik", party: "INC", state: "Maharashtra", count: 1 },
  { name: "Derek O'Brien", party: "TMC", state: "West Bengal", count: 1 },
  { name: "Vaiko", party: "MDMK", state: "Tamil Nadu", count: 1 },
  { name: "M. Mohamed Abdulla", party: "DMK", state: "Tamil Nadu", count: 1 },
  { name: "Muzibulla Khan", party: "BJD", state: "Odisha", count: 2 },
  { name: "V. Vijayasai Reddy", party: "YSRCP", state: "Andhra Pradesh", count: 1 },
  { name: "M. Thambidurai", party: "AIADMK", state: "Tamil Nadu", count: 1 },
  { name: "P. Wilson", party: "DMK", state: "Tamil Nadu", count: 1 },
  { name: "Ram Nath Thakur", party: "JD(U)", state: "Bihar", count: 1 },
  { name: "Rajeev Shukla", party: "INC", state: "Uttar Pradesh", count: 1 },
  { name: "Debashish Samantaray", party: "BJD", state: "Odisha", count: 1 },
  { name: "Javed Ali Khan", party: "SP", state: "Uttar Pradesh", count: 1 },
  { name: "Ramji Lal Suman", party: "SP", state: "Uttar Pradesh", count: 1 },
  { name: "Niranjan Bishi", party: "BJD", state: "Odisha", count: 1 },
  { name: "Sulata Deo", party: "BJD", state: "Odisha", count: 1 },
  { name: "Sushmita Dev", party: "TMC", state: "West Bengal", count: 1 },
  { name: "Vivek K. Tankha", party: "INC", state: "Madhya Pradesh", count: 1 },
  { name: "Jose K. Mani", party: "KC(M)", state: "Kerala", count: 1 },
  { name: "Vikramjit Singh Sahney", party: "AAP", state: "Punjab", count: 1 },
  { name: "Prakash Chik Baraik", party: "INC", state: "Jharkhand", count: 1 },
  { name: "Abdul Wahab", party: "IUML", state: "Kerala", count: 1 },
  { name: "Sumer Singh Solanki", party: "BJP", state: "Madhya Pradesh", count: 1 },
  { name: "Sujeet Kumar", party: "BJD", state: "Odisha", count: 1 },
  { name: "Ajay Makan", party: "INC", state: "Delhi", count: 1 },
  { name: "Bharat Singh Kushwah", party: "BJP", state: "Madhya Pradesh", count: 1 },
];

import { escapeHTML, escapeAttr } from "./sanitize.js";
import { state } from "./state.js";

// Module-local cache of vacancy_snapshots.json. Populated on first
// renderVacancies() call. Was a let in app.js until charts moved here.
let VACANCY_DATA = null;

export const STATUTORY_TARGETS = { GEN: 50.5, SC: 15, ST: 7.5, OBC: 27 };
export const CAT_FULL_NAMES = {
  GEN: "General (incl. EWS)",
  SC: "Scheduled Castes",
  ST: "Scheduled Tribes",
  OBC: "Other Backward Classes",
};

// Compute vacancy-rate per category and "realisation index" (observed share
// of in-position posts ÷ statutory share). Realisation < 1 = under-filled.
export function computeIneq(snap) {
  const c = snap.by_category;
  if (!c?.GEN || c.GEN.sanctioned == null) return null;
  const totalInPos = ["GEN","SC","ST","OBC"].reduce((s,k)=>s+(c[k].in_position||0),0);
  const out = {};
  for (const k of ["GEN","SC","ST","OBC"]) {
    const san = c[k].sanctioned || 0, inp = c[k].in_position || 0, vac = c[k].vacant || 0;
    out[k] = {
      sanctioned: san, in_position: inp, vacant: vac,
      vacancy_rate: san > 0 ? (vac/san)*100 : 0,
      observed_share: totalInPos > 0 ? (inp/totalInPos)*100 : 0,
      realisation: STATUTORY_TARGETS[k] > 0 ? ((inp/totalInPos)*100) / STATUTORY_TARGETS[k] : null,
    };
  }
  return { totalInPos, totalSan: ["GEN","SC","ST","OBC"].reduce((s,k)=>s+(c[k].sanctioned||0),0), byCat: out };
}

export function vacRateChart(label, snap) {
  const ineq = computeIneq(snap);
  if (!ineq) return "";
  const maxV = Math.max(...["GEN","SC","ST","OBC"].map(k => ineq.byCat[k].vacancy_rate), 50);
  const genV = ineq.byCat.GEN.vacancy_rate;
  const baselinePct = (genV / maxV) * 100;
  const rows = ["GEN","SC","ST","OBC"].map(k => {
    const r = ineq.byCat[k];
    const w = (r.vacancy_rate / maxV) * 100;
    return `<div class="vrbar-row">
      <span class="vrbar-cat">${k}</span>
      <div class="vrbar-track">
        <div class="vrbar-fill cat-${k}" style="width: ${w.toFixed(1)}%"></div>
        ${k !== "GEN" ? `<div class="vrbar-baseline" style="left: ${baselinePct.toFixed(1)}%" title="GEN baseline ${genV.toFixed(0)}%"></div>` : ""}
      </div>
      <span class="vrbar-pct">${r.vacancy_rate.toFixed(0)}%<span class="raw">${r.vacant}/${r.sanctioned}</span></span>
    </div>`;
  }).join("");
  return `<div class="viz-card">
    <div class="viz-hdr">${label}: vacancy rate by category</div>
    <div class="viz-sub">Share of <em>sanctioned</em> posts that remain unfilled. The vertical line on each lower bar marks the GEN vacancy rate — a within-snapshot baseline. Bars longer than the line indicate that reserved posts are vacant at higher rates than general-category posts, the canonical signature of "<em>not finding suitable candidates</em>" as a discretionary brake on reserved hiring (Subramanian 2019; Thorat and Newman 2010).</div>
    ${rows}
    <div class="vrbar-baseline-lbl">▍ vertical line = GEN vacancy rate (${genV.toFixed(0)}%)</div>
  </div>`;
}

export function realisationChart(label, snap) {
  const ineq = computeIneq(snap);
  if (!ineq) return "";
  // Show only reserved categories on this chart (GEN-as-residual is mechanically inverse).
  const rows = ["SC","ST","OBC"].map(k => {
    const r = ineq.byCat[k];
    const realPct = (r.realisation || 0) * 100;       // 100% = fully realised
    const clipped = Math.min(realPct, 110);
    const under = realPct < 95;
    return `<div class="real-row">
      <span class="real-cat">${k} <span style="color:var(--muted); font-weight:400">·</span> <span style="font-size:11px; color:var(--muted)">target ${STATUTORY_TARGETS[k]}%</span></span>
      <div class="real-rail">
        <div class="real-mark cat-${k}" style="left: calc(${(clipped/110)*100}% - 7px); background: ${k==='SC'?'#b46438':k==='ST'?'#a32626':'#b88a2e'};" title="${realPct.toFixed(0)}% of mandated share"></div>
        <div class="real-target-line" style="left: ${(100/110)*100}%"></div>
        <span class="real-target-lbl" style="left: ${(100/110)*100}%">100% target</span>
      </div>
      <span class="real-val ${under?'under':''}">${realPct.toFixed(0)}%</span>
    </div>`;
  }).join("");
  return `<div class="viz-card">
    <div class="viz-hdr">${label}: reservation realisation index</div>
    <div class="viz-sub">For each reserved category: observed share of in-position faculty divided by statutory mandated share, expressed as a percentage. <strong>100% = the mandate is met.</strong> Anything below is structural under-filling. The realisation index isolates the gap that aggregate vacancy figures hide.</div>
    ${rows}
  </div>`;
}

// ============================================================
// CORPUS-LEVEL STATISTICS
// Computed by scripts/analyze_corpus.py over the full 546-question
// parliamentary corpus (213 LS + 333 RS, Sep 2020 – Mar 2026).
// Inlined here so the dashboard works without a runtime fetch.
// ============================================================
export const CORPUS_STATS = {
  chart0: {"years":["2020","2021","2022","2023","2024","2025"],"Lok Sabha":[11,52,22,0,32,96],"Rajya Sabha":[12,70,80,93,47,31]},
  chart5: {"years":["2020","2021","2022","2023","2024","2025"],"category_pct":[0.0,0.8,3.9,3.2,1.3,0.8],"institution_pct":[0.0,2.5,4.9,3.2,5.1,2.4],"aggregate_pct":[13.0,13.1,11.8,17.2,21.5,11.8],"n_per_year":[23,122,102,93,79,127]},
  chartx: {"years":["2020","2021","2022","2023","2024","2025"],"n_per_year":[23,122,102,93,79,127],"mission_mode_pct":[0.0,3.3,20.6,18.3,20.3,13.4],"autonomy_pct":[0.0,0.0,0.0,0.0,5.1,3.9],"flexi_cadre_pct":[0.0,0.8,1.0,2.2,2.5,2.4],"no_suitable_pct":[0.0,0.0,0.0,0.0,0.0,0.0],"rozgar_mela_pct":[0.0,0.0,0.0,1.1,1.3,0.8],"cei_rtc_act_pct":[0.0,7.4,7.8,3.2,13.9,7.9]},
  charty: {"clusters":[
    {"id":3,"size":153,"label":"Central University vacancies","topic":"vacancy"},
    {"id":1,"size":94, "label":"IIM/IIT/NIT recruitment","topic":"vacancy"},
    {"id":6,"size":92, "label":"Reservation, fees, funding","topic":"reservation"},
    {"id":5,"size":68, "label":"School teachers (KV/NV)","topic":"school"},
    {"id":0,"size":66, "label":"New CU establishment","topic":"establishment"},
    {"id":2,"size":64, "label":"NEP 2020 / education quality","topic":"policy"},
    {"id":7,"size":51, "label":"New IIT/IIM establishment","topic":"establishment"},
    {"id":4,"size":43, "label":"Caste discrimination, student suicides","topic":"discrimination"}
  ]}
};

// JBM Chart 0: Volume-of-asking. Stacked bars — year × house. The opener
// that establishes the corpus dataset before the seven points.
export function chart0_volume() {
  const d = CORPUS_STATS.chart0;
  const W = 760, H = 320;
  const ml = 60, mr = 80, mt = 50, mb = 60;
  const plotW = W - ml - mr, plotH = H - mt - mb;
  const barW = plotW / d.years.length * 0.7;
  const barGap = plotW / d.years.length * 0.3;
  const totals = d.years.map((y, i) => d["Lok Sabha"][i] + d["Rajya Sabha"][i]);
  const yMax = Math.ceil(Math.max(...totals) / 25) * 25;
  const yS = v => mt + plotH - (v / yMax) * plotH;
  const xS = i => ml + i * (barW + barGap) + barGap/2;

  const grand = totals.reduce((a,b) => a+b, 0);
  const grandLS = d["Lok Sabha"].reduce((a,b)=>a+b,0);
  const grandRS = d["Rajya Sabha"].reduce((a,b)=>a+b,0);

  const yTicks = [0, yMax/2, yMax].map(t => `
    <line class="grid-y" x1="${ml}" y1="${yS(t)}" x2="${ml+plotW}" y2="${yS(t)}"/>
    <text class="axis-label" x="${ml-8}" y="${yS(t)+4}" text-anchor="end">${t}</text>
  `).join("");

  const bars = d.years.map((y, i) => {
    const x = xS(i);
    const ls = d["Lok Sabha"][i], rs = d["Rajya Sabha"][i];
    const lsH = (ls / yMax) * plotH;
    const rsH = (rs / yMax) * plotH;
    const lsY = mt + plotH - lsH;
    const rsY = lsY - rsH;
    return `
      <rect x="${x}" y="${rsY}" width="${barW}" height="${rsH}" fill="var(--jbm-emph)"/>
      <rect x="${x}" y="${lsY}" width="${barW}" height="${lsH}" fill="var(--jbm-promise)"/>
      <text class="data-label" x="${x + barW/2}" y="${rsY - 6}" text-anchor="middle" fill="var(--ink)" style="font-weight:700;">${ls + rs}</text>
      <text class="axis-label" x="${x + barW/2}" y="${mt + plotH + 18}" text-anchor="middle">${y}</text>
    `;
  }).join("");

  const legend = `
    <rect x="${ml}" y="${mt - 28}" width="14" height="12" fill="var(--jbm-promise)"/>
    <text class="data-label" x="${ml + 18}" y="${mt - 18}" fill="var(--ink)">Lok Sabha (${grandLS})</text>
    <rect x="${ml + 130}" y="${mt - 28}" width="14" height="12" fill="var(--jbm-emph)"/>
    <text class="data-label" x="${ml + 148}" y="${mt - 18}" fill="var(--ink)">Rajya Sabha (${grandRS})</text>
  `;

  const body = `<svg class="jbm-svg" viewBox="0 0 ${W} ${H}">
    ${legend}
    ${yTicks}
    <text class="axis-title" x="${ml}" y="${mt - 38}">Parliamentary questions tabled per year (${grand} total)</text>
    ${bars}
  </svg>`;

  return chartCard({
    title: `546 questions in five years. The pace is accelerating.`,
    deck: `Parliamentary questions on faculty vacancy at India's centrally-funded HEIs, 2020–2025. Each bar split between Lok Sabha (cobalt) and Rajya Sabha (red). 2023's Lok Sabha gap reflects the inter-Lok Sabha-term silence; the 18th Lok Sabha (mid-2024 onward) inherits and intensifies what RS opposition had been doing alone.`,
    body,
    source: `Compiled from elibrary.sansad.in (Lok Sabha; DSpace API) and rsdoc.nic.in (Rajya Sabha) by systematic crawl, May 2026. 213 LS + 333 RS = 546 unique questions on faculty vacancy in centrally-funded HEIs.`,
  });
}

// JBM Chart 5 (rebuild): year-over-year disclosure quality. Three lines —
// what % of answers gave aggregate, category, institution-wise data.
export function chart5_disclosure_v2() {
  const d = CORPUS_STATS.chart5;
  const W = 760, H = 360;
  const ml = 60, mr = 220, mt = 60, mb = 60;
  const plotW = W - ml - mr, plotH = H - mt - mb;
  const yMax = 25;
  const yS = v => mt + plotH - (v / yMax) * plotH;
  const xS = i => ml + (i / (d.years.length - 1)) * plotW;

  const yTicks = [0, 5, 10, 15, 20, 25].map(t => `
    <line class="grid-y" x1="${ml}" y1="${yS(t)}" x2="${ml+plotW}" y2="${yS(t)}"/>
    <text class="axis-label" x="${ml-8}" y="${yS(t)+4}" text-anchor="end">${t}%</text>
  `).join("");
  const xTicks = d.years.map((y, i) => `
    <text class="axis-label" x="${xS(i)}" y="${mt + plotH + 18}" text-anchor="middle">${y}</text>
    <text class="axis-label" x="${xS(i)}" y="${mt + plotH + 32}" text-anchor="middle" style="font-size:9.5px; fill:var(--muted);">n=${d.n_per_year[i]}</text>
  `).join("");

  const lines = [
    { key: "aggregate_pct",   label: "Any vacancy number",      color: "var(--jbm-context)", style: "" },
    { key: "institution_pct", label: "Institution-wise data",   color: "#c97a4a",             style: "" },
    { key: "category_pct",    label: "SC/ST/OBC breakdown",     color: "var(--jbm-emph)",     style: "stroke-width:3" },
  ];

  const lineEls = lines.map(L => {
    const path = d[L.key].map((v, i) => `${i === 0 ? 'M' : 'L'} ${xS(i)} ${yS(v)}`).join(" ");
    const dots = d[L.key].map((v, i) => `<circle cx="${xS(i)}" cy="${yS(v)}" r="4" fill="${L.color}" stroke="var(--panel)" stroke-width="1.5"/>`).join("");
    const lastV = d[L.key][d[L.key].length - 1];
    const lastX = xS(d.years.length - 1);
    const lastY = yS(lastV);
    return `
      <path d="${path}" stroke="${L.color}" fill="none" stroke-width="2" style="${L.style}"/>
      ${dots}
      <text class="data-label" x="${lastX + 10}" y="${lastY + 4}" fill="${L.color}" style="font-weight:700;">${L.label}</text>
      <text class="axis-label" x="${lastX + 10}" y="${lastY + 18}" fill="${L.color}" style="font-size:10.5px;">${lastV}% in 2025</text>
    `;
  }).join("");

  // Annotation pointing at the 2022 peak of category disclosure
  const peakIdx = d.category_pct.indexOf(Math.max(...d.category_pct));
  const peakX = xS(peakIdx), peakY = yS(d.category_pct[peakIdx]);
  const anno = `
    <line class="anno-line" x1="${peakX}" y1="${peakY - 8}" x2="${peakX + 24}" y2="${peakY - 40}"/>
    <text class="anno-text emph" x="${peakX + 28}" y="${peakY - 40}">Peak: ${d.category_pct[peakIdx]}% in ${d.years[peakIdx]}</text>
    <text class="anno-text emph" x="${peakX + 28}" y="${peakY - 26}">— and even at peak, fewer</text>
    <text class="anno-text emph" x="${peakX + 28}" y="${peakY - 12}">than 1 in 25 answers gave it.</text>
  `;

  const body = `<svg class="jbm-svg" viewBox="0 0 ${W} ${H}">
    ${yTicks}
    ${xTicks}
    <text class="axis-title" x="${ml}" y="${mt - 30}">% of answers that disclosed the named information ↓</text>
    ${lineEls}
    ${anno}
  </svg>`;

  return chartCard({
    title: `In five years of asking, fewer than 4% of answers gave the caste breakdown — and the rate is collapsing`,
    deck: `Year-over-year disclosure quality across 546 parliamentary answers. Each line shows what fraction of answers in that year contained the named information. The SC/ST/OBC category breakdown — the only number that would expose the actual cadre composition — peaked at 3.9% in 2022 and has been declining since.`,
    body,
    source: `Computed by scripts/analyze_corpus.py over the consolidated 546-question corpus. "Aggregate" = any vacancy number disclosed; "Institution-wise" = at least 2 named institutes with counts; "Category" = at least 3 explicit SC/ST/OBC numbers AND the categories appearing in proximity. The detector is generous; the actual share of substantively-detailed disclosures is lower still.`,
  });
}

// JBM Chart X: rhetorical-instrument frequency over time. Each line shows
// what % of answers in that year contained one of the four boilerplate
// patterns identified through close reading.
export function chartx_boilerplate() {
  const d = CORPUS_STATS.chartx;
  const W = 760, H = 360;
  const ml = 60, mr = 200, mt = 60, mb = 60;
  const plotW = W - ml - mr, plotH = H - mt - mb;
  const yMax = 25;
  const yS = v => mt + plotH - (v / yMax) * plotH;
  const xS = i => ml + (i / (d.years.length - 1)) * plotW;
  const yTicks = [0, 5, 10, 15, 20, 25].map(t => `
    <line class="grid-y" x1="${ml}" y1="${yS(t)}" x2="${ml+plotW}" y2="${yS(t)}"/>
    <text class="axis-label" x="${ml-8}" y="${yS(t)+4}" text-anchor="end">${t}%</text>
  `).join("");
  const xTicks = d.years.map((y, i) => `
    <text class="axis-label" x="${xS(i)}" y="${mt + plotH + 18}" text-anchor="middle">${y}</text>
  `).join("");
  const lines = [
    { key: "mission_mode_pct", label: "“Mission Mode”",            color: "var(--jbm-emph)" },
    { key: "cei_rtc_act_pct",  label: "“CEI(RTC) Act, 2019”",      color: "#c97a4a" },
    { key: "autonomy_pct",     label: "“no active role…”",    color: "#a32626" },
    { key: "flexi_cadre_pct",  label: "“flexi cadre” (IITs)",      color: "#6b8aab" },
  ];
  const lineEls = lines.map(L => {
    const path = d[L.key].map((v, i) => `${i === 0 ? 'M' : 'L'} ${xS(i)} ${yS(v)}`).join(" ");
    const dots = d[L.key].map((v, i) => `<circle cx="${xS(i)}" cy="${yS(v)}" r="3.5" fill="${L.color}" stroke="var(--panel)" stroke-width="1.5"/>`).join("");
    const lastV = d[L.key][d[L.key].length - 1];
    const lastX = xS(d.years.length - 1);
    const lastY = yS(lastV);
    return `
      <path d="${path}" stroke="${L.color}" fill="none" stroke-width="2"/>
      ${dots}
      <text class="data-label" x="${lastX + 10}" y="${lastY + 4}" fill="${L.color}" style="font-weight:700;">${L.label}</text>
    `;
  }).join("");

  const body = `<svg class="jbm-svg" viewBox="0 0 ${W} ${H}">
    ${yTicks}${xTicks}
    <text class="axis-title" x="${ml}" y="${mt - 30}">% of answers containing the verbatim phrase ↓</text>
    ${lineEls}
  </svg>`;

  return chartCard({
    title: `The rhetorical apparatus took off in 2022 — exactly when the legislative pressure required something to deflect it`,
    deck: `Frequency of four key boilerplate phrases across 546 parliamentary answers. <strong>"Mission Mode" did not exist in 2020 answers.</strong> By 2022 it appeared in 1 of 5 answers — the substitution counter that lets the Ministry claim activity in lieu of disclosing vacancy. The "no active role of the Ministry" autonomy doctrine is even newer: zero use before 2024, then deployed strategically.`,
    body,
    source: `Phrase-frequency detection by regex across full PDF text of 546 answers. Each line is the percentage of that year's answers in which the phrase appears at least once. "Mission Mode" was officially launched September 2022; the curve confirms the rhetorical adoption that followed.`,
  });
}

// JBM Chart Y: topic clusters. Horizontal bar chart of the eight semantic
// clusters into which the 546 questions group.
export function charty_topics() {
  const d = CORPUS_STATS.charty.clusters;
  const total = d.reduce((s, c) => s + c.size, 0);
  const max = Math.max(...d.map(c => c.size));

  // Order by size, color by topic family
  const colorByTopic = {
    vacancy: "var(--jbm-emph)",
    reservation: "#c97a4a",
    discrimination: "#a32626",
    establishment: "var(--jbm-promise)",
    policy: "var(--jbm-context)",
    school: "var(--muted)",
  };

  const W = 760, H = 60 + d.length * 36 + 30;
  const ml = 220, mr = 80, mt = 50;
  const plotW = W - ml - mr;
  const xS = v => ml + (v / max) * plotW;

  const bars = d.map((c, i) => {
    const y = mt + i * 36 + 4;
    const barH = 26;
    const fill = colorByTopic[c.topic] || "var(--jbm-context)";
    const pct = (c.size / total * 100).toFixed(0);
    return `
      <text class="data-label" x="${ml - 12}" y="${y + barH/2 + 4}" text-anchor="end" fill="var(--ink)" style="font-weight:600;">${escapeHTML(c.label)}</text>
      <rect x="${ml}" y="${y}" width="${xS(c.size) - ml}" height="${barH}" fill="${fill}"/>
      <text class="data-label" x="${xS(c.size) + 8}" y="${y + barH/2 + 4}" fill="${fill}" style="font-weight:700;">${c.size} <tspan fill="var(--muted)" style="font-weight:500;">(${pct}%)</tspan></text>
    `;
  }).join("");

  const body = `<svg class="jbm-svg" viewBox="0 0 ${W} ${H}">
    <text class="axis-title" x="${ml}" y="${mt - 18}">Topical clusters in the 546-question corpus, by size</text>
    ${bars}
  </svg>`;

  return chartCard({
    title: `What MPs actually ask about: caste discrimination is its own topic — 43 questions across five years`,
    deck: `Eight semantic clusters identified by k-means over the question-level mean embeddings (BAAI/bge-small-en-v1.5) of the 546-question corpus. Cluster labels are inferred from the questions closest to each centroid. <strong>The "caste discrimination" cluster (43 questions) is direct evidence that opposition MPs are pushing this issue beyond just vacancy counting</strong> — the questions in that cluster name student suicides, casteist bias in selection committees, and SC/ST representation specifically.`,
    body,
    source: `Computed by scripts/analyze_corpus.py: each PDF's text is split into chunks, embedded into 384-dim vectors (BAAI/bge-small-en-v1.5), aggregated to a per-question mean vector, then k-means clustered (k=8). Cluster sizes sum to ${total}.`,
  });
}

// ============================================================
// JBM CHART SYSTEM — applied uniformly to every viz on the page
// ============================================================
export function chartCard({ title, deck, body, source }) {
  return `<div class="jbm-card">
    <h4 class="jbm-title">${title}</h4>
    ${deck ? `<p class="jbm-deck">${deck}</p>` : ""}
    <div class="jbm-chart">${body}</div>
    ${source ? `<div class="jbm-source"><strong>Source:</strong> ${source}</div>` : ""}
  </div>`;
}

// JBM Chart 1: Vacancy time-series with disclosure-regression annotation.
export function chart1_vacancyTimeline(snaps) {
  const data = snaps
    .filter(s => s.institution_group === "all_central_universities" && s.totals?.vacant != null && (s.post_type || "").toLowerCase().includes("faculty"))
    .map(s => ({
      date: s.as_of,
      vacant: s.totals.vacant,
      hasCategory: !!(s.by_category && s.by_category.SC && s.by_category.SC.vacant != null),
      qref: s.source.question_no ? `${s.source.house?.split(' ')[0] || ''} Q${s.source.question_no}` : "",
    }))
    .sort((a, b) => (a.date || "").localeCompare(b.date || ""));
  if (data.length < 3) return "";

  const W = 760, H = 380;
  const ml = 60, mr = 40, mt = 60, mb = 60;
  const plotW = W - ml - mr, plotH = H - mt - mb;
  const minD = new Date(data[0].date).getTime(), maxD = new Date(data[data.length-1].date).getTime();
  const yMax = Math.ceil(Math.max(...data.map(d => d.vacant)) / 1000) * 1000;
  const xS = d => ml + ((new Date(d).getTime() - minD) / (maxD - minD || 1)) * plotW;
  const yS = v => mt + plotH - (v / yMax) * plotH;

  const yTicks = [0, yMax/4, yMax/2, 3*yMax/4, yMax];
  const grid = yTicks.map(t => `<line class="grid-y" x1="${ml}" y1="${yS(t)}" x2="${ml+plotW}" y2="${yS(t)}"/><text class="axis-label" x="${ml-8}" y="${yS(t)+4}" text-anchor="end">${t.toLocaleString('en-IN')}</text>`).join("");

  const xTicks = data.map(d => {
    const x = xS(d.date);
    const lbl = new Date(d.date).toLocaleDateString('en-IN', { month: 'short', year: '2-digit' });
    return `<text class="axis-label" x="${x}" y="${mt+plotH+18}" text-anchor="middle">${lbl}</text>`;
  }).join("");

  const cutIdx = data.findIndex((d, i) => i > 0 && data[i-1].hasCategory && !d.hasCategory);
  let pathDis = "", pathWit = "";
  data.forEach((d, i) => {
    const x = xS(d.date), y = yS(d.vacant);
    if (cutIdx === -1 || i <= cutIdx) pathDis += (pathDis ? " L " : "M ") + x + " " + y;
    if (cutIdx !== -1 && i >= cutIdx - 1) pathWit += (pathWit ? " L " : "M ") + x + " " + y;
  });
  const dots = data.map(d => {
    const x = xS(d.date), y = yS(d.vacant);
    const fill = d.hasCategory ? "var(--jbm-promise)" : "var(--jbm-emph)";
    return `<circle cx="${x}" cy="${y}" r="5" fill="${fill}" stroke="var(--panel)" stroke-width="2"/>
            <text class="data-label" x="${x}" y="${y - 14}" text-anchor="middle" fill="${fill}">${d.vacant.toLocaleString('en-IN')}</text>`;
  }).join("");

  let anno = "";
  if (cutIdx > 0) {
    const cx = xS(data[cutIdx].date), cy = yS(data[cutIdx].vacant);
    anno = `
      <line class="anno-line" x1="${cx}" y1="${cy + 18}" x2="${cx + 60}" y2="${cy + 60}"/>
      <text class="anno-text emph" x="${cx + 64}" y="${cy + 64}">Mar 2025 →</text>
      <text class="anno-text" x="${cx + 64}" y="${cy + 80}">Ministry stops naming the</text>
      <text class="anno-text" x="${cx + 64}" y="${cy + 96}">SC, ST, and OBC seats</text>
      <text class="anno-text" x="${cx + 64}" y="${cy + 112}">that remain vacant.</text>
    `;
  }

  const body = `
    <svg class="jbm-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="Vacant teaching posts in Central Universities, 2022–2025">
      ${grid}${xTicks}
      <text class="axis-title" x="${ml}" y="${mt - 28}">Vacant teaching posts ↓</text>
      <text class="data-label" x="${ml + 6}" y="${mt - 8}" fill="var(--jbm-promise)">● Category breakdown given</text>
      <text class="data-label" x="${ml + 240}" y="${mt - 8}" fill="var(--jbm-emph)">● Category breakdown withheld</text>
      <path d="${pathDis}" stroke="var(--jbm-promise)" stroke-width="2.5" fill="none"/>
      <path d="${pathWit}" stroke="var(--jbm-emph)" stroke-width="2.5" fill="none" stroke-dasharray="6,4"/>
      ${dots}
      ${anno}
    </svg>`;

  return chartCard({
    title: `When the Ministry stopped counting Bahujan seats`,
    deck: `Vacant teaching posts in India's 45 Central Universities, as disclosed in answers to Lok Sabha and Rajya Sabha questions over three years.`,
    body,
    source: `LS AU81 (Jul 2024); LS AU47 (Nov 2024); LS AS328 (Mar 2025); LS AU1206 (Jul 2025); RS AS153 (Mar 2023); RS AU1938 (Aug 2022). Each point is one parliamentary answer; the categorical breakdown disappears at the dashed segment.`,
  });
}

// JBM Chart 2: Mandate vs reality slope chart.
export function chart2_mandateVsReality(snaps) {
  const mm = snaps.find(s => s.institution_group === "all_chei_mission_mode" && s.by_category && (s.by_category.SC?.in_position || 0) > 0);
  if (!mm) return "";
  const c = mm.by_category;
  const cats = [
    { key: "GEN", name: "General",  fills: c.GEN?.in_position || 0, mandate: 40.5, role: "context" },
    { key: "OBC", name: "OBC",      fills: c.OBC?.in_position || 0, mandate: 27.0, role: "context" },
    { key: "SC",  name: "SC",       fills: c.SC?.in_position || 0,  mandate: 15.0, role: "context" },
    { key: "EWS", name: "EWS",      fills: c.EWS?.in_position || 0, mandate: 10.0, role: "emph" },
    { key: "ST",  name: "ST",       fills: c.ST?.in_position || 0,  mandate: 7.5,  role: "context" },
  ];
  const total = cats.reduce((s, x) => s + x.fills, 0);
  if (total === 0) return "";
  const W = 760, H = 340;
  const xL = 200, xR = 540, mt = 50, mb = 70;
  const yMin = 0, yMax = 65;
  const yTop = mt, yBot = H - mb;
  const yS = v => yBot - ((v - yMin) / (yMax - yMin)) * (yBot - yTop);

  const elems = cats.map(cat => {
    const sharePct = (cat.fills / total) * 100;
    const realisation = (sharePct / cat.mandate) * 100;
    const yMan = yS(cat.mandate), yAct = yS(sharePct);
    const stroke = cat.role === "emph" ? "var(--jbm-emph)" : (cat.name === "General" ? "#6b6b6b" : "var(--jbm-context)");
    const sw = cat.role === "emph" ? 3 : 2;
    const labelColor = cat.role === "emph" ? "var(--jbm-emph)" : (cat.name === "General" ? "var(--ink)" : "var(--muted)");
    return `
      <line x1="${xL}" y1="${yMan}" x2="${xR}" y2="${yAct}" stroke="${stroke}" stroke-width="${sw}" fill="none"/>
      <circle cx="${xL}" cy="${yMan}" r="5" fill="${stroke}"/>
      <circle cx="${xR}" cy="${yAct}" r="5" fill="${stroke}"/>
      <text class="data-label" x="${xL - 10}" y="${yMan + 4}" text-anchor="end" fill="${labelColor}">${cat.name} ${cat.mandate}%</text>
      <text class="data-label" x="${xR + 10}" y="${yAct + 4}" text-anchor="start" fill="${labelColor}">${sharePct.toFixed(1)}%</text>
      <text class="axis-label" x="${xR + 10}" y="${yAct + 18}" fill="${labelColor}" style="font-style:italic">${realisation.toFixed(0)}% of mandate</text>
    `;
  }).join("");

  const body = `
    <svg class="jbm-svg" viewBox="0 0 ${W} ${H}">
      <text class="axis-title" x="${xL}" y="30" text-anchor="middle">MANDATED SHARE</text>
      <text class="axis-title" x="${xR}" y="30" text-anchor="middle">ACTUAL SHARE</text>
      ${elems}
      <line class="anno-line" x1="${xR + 110}" y1="${yS(3.07)}" x2="${xR + 84}" y2="${yS(3.07)}"/>
      <text class="anno-text emph" x="${xR + 116}" y="${yS(3.07) + 4}">EWS — short by 7 points</text>
      <text class="anno-text" x="${xR + 110}" y="${yS(58.5) + 4}" style="fill:var(--muted)">General — captures the surplus</text>
    </svg>`;

  return chartCard({
    title: `What the Constitution promised, and what was delivered`,
    deck: `Mandated share (left) vs actual share (right) of cumulative Mission Mode faculty appointments across centrally-funded HEIs, September 2022 to January 2026. Lines that slope downward = under-realised category. EWS achieves 31% of its mandate.`,
    body,
    source: `Lok Sabha Q. 5842 (30 Mar 2026), Ministry of Education. Total faculty filled: ${total.toLocaleString('en-IN')}. Mandate: SC 15%, ST 7.5%, OBC 27%, EWS 10%; General-residual ~40.5% post-103rd Amendment.`,
  });
}

// JBM Chart 3: Kharge rank-by-category vacancy as a clean SVG bar chart.
export function chart3_kharge(snaps) {
  const k = snaps.find(s => s._kharge_disclosure);
  if (!k || !k._rank_wise_vacancy) return "";
  const ranks = ["Assistant Professor", "Associate Professor", "Professor"];
  const cats = ["SC", "ST", "OBC"];
  const rv = k._rank_wise_vacancy;
  const data = ranks.map(r => ({
    rank: r,
    SC: rv[r]?.SC || 0,
    ST: rv[r]?.ST || 0,
    OBC: rv[r]?.OBC || 0,
    total: (rv[r]?.SC || 0) + (rv[r]?.ST || 0) + (rv[r]?.OBC || 0),
  }));
  const max = Math.max(...data.map(d => d.total));
  const maxIdx = data.findIndex(d => d.total === max);

  const W = 760, H = 280;
  const ml = 180, mr = 60, mt = 60, mb = 50;
  const plotW = W - ml - mr;
  const rowH = (H - mt - mb) / data.length;
  const xS = v => ml + (v / Math.ceil(max / 200) / 200) * plotW;
  const xMaxScale = Math.ceil(max / 200) * 200;

  const xTicks = [0, xMaxScale/4, xMaxScale/2, 3*xMaxScale/4, xMaxScale].map(t => `
    <line class="grid-y" x1="${ml + (t/xMaxScale)*plotW}" y1="${mt}" x2="${ml + (t/xMaxScale)*plotW}" y2="${mt + data.length * rowH}"/>
    <text class="axis-label" x="${ml + (t/xMaxScale)*plotW}" y="${mt + data.length * rowH + 18}" text-anchor="middle">${t}</text>
  `).join("");

  const colors = { SC: "#b46438", ST: "#a32626", OBC: "#b88a2e" };
  const bars = data.map((d, i) => {
    const y = mt + i * rowH + 8;
    const barH = rowH - 16;
    const isEmph = i === maxIdx;
    let acc = 0;
    const segs = cats.map(cat => {
      const w = (d[cat] / xMaxScale) * plotW;
      const seg = `<rect x="${ml + acc}" y="${y}" width="${w}" height="${barH}" fill="${colors[cat]}" opacity="${isEmph ? 1 : 0.55}"/>`;
      acc += w;
      return seg;
    }).join("");
    return `
      ${segs}
      <text class="data-label ${isEmph ? 'bold' : 'context'}" x="${ml - 12}" y="${y + barH/2 + 4}" text-anchor="end" fill="${isEmph ? 'var(--ink)' : 'var(--muted)'}">${d.rank}</text>
      <text class="data-label" x="${ml + acc + 10}" y="${y + barH/2 + 4}" fill="${isEmph ? 'var(--jbm-emph)' : 'var(--muted)'}" style="font-weight:${isEmph ? '800' : '600'}">${d.total} vacant</text>
    `;
  }).join("");

  // Legend at top
  const legend = `
    <text class="data-label" x="${ml}" y="${mt - 18}" fill="${colors.SC}">■ SC</text>
    <text class="data-label" x="${ml + 60}" y="${mt - 18}" fill="${colors.ST}">■ ST</text>
    <text class="data-label" x="${ml + 120}" y="${mt - 18}" fill="${colors.OBC}">■ OBC</text>
  `;

  // Inline highlight on the worst-served row (no protruding annotation)
  const worstY = mt + maxIdx * rowH + 8;
  const worstH = rowH - 16;
  const highlight = `<rect x="${ml - 170}" y="${worstY - 4}" width="${plotW + 178}" height="${worstH + 8}" fill="rgba(200,16,46,0.06)" stroke="var(--jbm-emph)" stroke-width="1" stroke-dasharray="3,2"/>`;
  const inlineNote = `<text class="anno-text emph" x="${ml - 170}" y="${worstY + worstH + 18}" style="font-size:11px;">↑ The bridge rank — the most reserved seats sit empty here</text>`;

  const body = `
    <svg class="jbm-svg" viewBox="0 0 ${W} ${H}">
      <text class="axis-title" x="${ml}" y="${mt - 38}">Vacant reserved-category teaching posts in CUs, by rank</text>
      ${highlight}
      ${xTicks}
      ${legend}
      ${bars}
      ${inlineNote}
    </svg>`;

  return chartCard({
    title: `The seats Kharge was told about — and no one else`,
    deck: `Reserved-category vacancies in Central Universities by faculty rank, as on 1 July 2025. Disclosed by the Ministry of Education to Mallikarjun Kharge (Leader of Opposition, Rajya Sabha) on 23 July 2025. Withheld from every other parliamentarian who asked.`,
    body,
    source: `Rajya Sabha Unstarred Q. 365, 23 Jul 2025. The bridge rank — Associate Professor — is the worst-served: more reserved-category posts sit empty there than at the entry or apex levels. Bahujan candidates who do enter at Assistant Professor are not progressing through the cadre.`,
  });
}

// JBM Chart 4: AIIMS network as a STRIP PLOT — distribution of vacancy rates.
// Each institute is one dot on a horizontal axis; outliers are labeled.
// The shape of the distribution IS the finding (clustering toward severe).
export function chart4_aiims(snaps) {
  const a = snaps.find(s => s.institution_group === "all_aiims");
  if (!a || !a._per_institution) return "";
  const data = [...a._per_institution].sort((x, y) => x.vacancy_rate - y.vacancy_rate);
  const t = a.totals;
  const overallRate = (t.vacant / t.sanctioned) * 100;

  const W = 760, H = 220;
  const ml = 60, mr = 60, mt = 60, mb = 80;
  const plotW = W - ml - mr;
  const xMin = 0, xMax = 70;
  const xS = v => ml + ((v - xMin) / (xMax - xMin)) * plotW;

  // Bee-swarm-style vertical jitter to avoid overlap on near-identical x
  const dotR = 6, jitter = [];
  data.forEach((d) => {
    const x = xS(d.vacancy_rate);
    let level = 0;
    while (jitter.some(j => j.level === level && Math.abs(j.x - x) < dotR * 2 + 2)) level++;
    jitter.push({ x, level, d });
  });
  const baseY = mt + 60;
  const dots = jitter.map(({ x, level, d }) => {
    const isSevere = d.vacancy_rate >= 50;
    const isHigh = d.vacancy_rate >= 40;
    const fill = isSevere ? "var(--jbm-emph)" : isHigh ? "#c97a4a" : "var(--jbm-context)";
    const y = baseY - level * (dotR * 2 + 2);
    return `<circle cx="${x}" cy="${y}" r="${dotR}" fill="${fill}" stroke="var(--panel)" stroke-width="1.5"/>`;
  }).join("");

  // Label outliers: top 3 worst + best
  const top3 = data.slice(-3).reverse();
  const best = data[0];
  const labels = [...top3, best].map(d => {
    const placement = jitter.find(j => j.d === d);
    if (!placement) return "";
    const lblY = baseY - placement.level * (dotR * 2 + 2) - dotR - 6;
    const isSevere = d.vacancy_rate >= 50;
    const fill = isSevere ? "var(--jbm-emph)" : "var(--muted)";
    return `<text class="data-label" x="${placement.x}" y="${lblY}" text-anchor="middle" fill="${fill}" style="font-weight:${isSevere ? 700 : 600}">AIIMS ${escapeHTML(d.name)} ${d.vacancy_rate.toFixed(0)}%</text>`;
  }).join("");

  // X-axis with major ticks
  const xTicks = [0, 10, 20, 30, 40, 50, 60, 70].map(v => `
    <line class="grid-y" x1="${xS(v)}" y1="${baseY + dotR + 4}" x2="${xS(v)}" y2="${baseY + dotR + 12}"/>
    <text class="axis-label" x="${xS(v)}" y="${baseY + dotR + 28}" text-anchor="middle">${v}%</text>
  `).join("");
  const xAxisLine = `<line class="grid-y" x1="${ml}" y1="${baseY + dotR + 4}" x2="${ml + plotW}" y2="${baseY + dotR + 4}" stroke-width="1.5" style="stroke:var(--ink); opacity:0.6;"/>`;

  // Network average reference
  const avgX = xS(overallRate);
  const avgRef = `
    <line x1="${avgX}" y1="${mt - 10}" x2="${avgX}" y2="${baseY + dotR + 4}" stroke="var(--ink)" stroke-width="1.5" stroke-dasharray="4,3" opacity="0.45"/>
    <text class="anno-text" x="${avgX}" y="${mt - 16}" text-anchor="middle" style="font-weight:700;">Network average ${overallRate.toFixed(0)}%</text>
  `;

  const body = `<svg class="jbm-svg" viewBox="0 0 ${W} ${H}">
    <text class="axis-title" x="${ml}" y="${mt - 30}">Faculty vacancy rate, by AIIMS (n=${data.length})</text>
    ${avgRef}
    ${xAxisLine}
    ${xTicks}
    ${dots}
    ${labels}
  </svg>`;

  return chartCard({
    title: `The new AIIMS were built to bring care closer. Half are running on half-strength`,
    deck: `Each dot is one of the ${data.length} operational All India Institutes of Medical Sciences. Position on the horizontal axis is the institute's faculty vacancy rate. Note the clustering: most of the recently-opened AIIMS sit between 35% and 60% vacancy.`,
    body,
    source: `Lok Sabha Starred Q. 207 (13 Feb 2026), Ministry of Health and Family Welfare. ${t.in_position.toLocaleString('en-IN')} of ${t.sanctioned.toLocaleString('en-IN')} faculty in position network-wide (${overallRate.toFixed(1)}% vacant). Each of these institutes was opened under the Pradhan Mantri Swasthya Suraksha Yojana (PMSSY) to deliver tertiary medical care to under-served regions; the policy's stated goal is undermined when staffing concentrates at AIIMS Delhi, which is itself 34% vacant.`,
  });
}

// JBM Chart 5 (rebuilt): disclosure as a TIMELINE.
// Three small-multiples — Aggregate / Caste / Institution — each a row of
// dots ordered by date. Color = disclosure quality. The eye reads time
// left-to-right, and the visible dropoff in the "Caste" row IS the finding.
export function chart5_disclosure() {
  // Convert questions to time-positioned points
  const pts = LS_DISCLOSURE
    .map(r => ({ ...r, t: new Date(r.date).getTime() }))
    .filter(r => !isNaN(r.t))
    .sort((a, b) => a.t - b.t);
  const minT = pts[0].t, maxT = pts[pts.length - 1].t;

  const W = 760, H = 360;
  const ml = 130, mr = 50, mt = 50, mb = 80;
  const plotW = W - ml - mr;
  const dims = [
    { key: "total", label: "Aggregate vacancy", explainer: "How many faculty posts are vacant?" },
    { key: "cat",   label: "By caste category", explainer: "How many of those are SC / ST / OBC / EWS / PwBD?" },
    { key: "inst",  label: "By institution",    explainer: "Which colleges and IITs / IIMs?" },
  ];
  const rowH = (H - mt - mb) / dims.length;
  const xS = t => ml + ((t - minT) / (maxT - minT || 1)) * plotW;

  const colorFor = v => v === "Y" ? "var(--jbm-promise)" : v === "P" ? "#c97a4a" : "var(--jbm-emph)";

  // Year labels along bottom
  const years = [2020, 2021, 2022, 2023, 2024, 2025, 2026];
  const yearTicks = years.map(y => {
    const t = new Date(y + "-01-01").getTime();
    if (t < minT - 31536000000 || t > maxT + 31536000000) return "";
    const x = xS(t);
    if (x < ml - 5 || x > ml + plotW + 5) return "";
    return `
      <line class="grid-y" x1="${x}" y1="${mt}" x2="${x}" y2="${H - mb}"/>
      <text class="axis-label" x="${x}" y="${H - mb + 18}" text-anchor="middle">${y}</text>
    `;
  }).join("");

  // Dots per dimension
  const rows = dims.map((dim, i) => {
    const y = mt + i * rowH + rowH / 2;
    const dots = pts.map(p => {
      const v = p[dim.key];
      const cx = xS(p.t);
      const isKharge = (p.qno || "").includes("AU365");
      const r = isKharge && dim.key === "cat" ? 7 : 5;
      const stroke = isKharge && dim.key === "cat" ? "var(--ink)" : "white";
      return `<circle cx="${cx}" cy="${y}" r="${r}" fill="${colorFor(v)}" stroke="${stroke}" stroke-width="${isKharge && dim.key === 'cat' ? 2 : 1.5}" opacity="0.9"/>`;
    }).join("");
    return `
      <text class="axis-title" x="${ml - 12}" y="${y - 4}" text-anchor="end" style="font-weight:700; fill:var(--ink); text-transform:none; letter-spacing:0;">${dim.label}</text>
      <text class="axis-label" x="${ml - 12}" y="${y + 12}" text-anchor="end" style="font-style:italic;">${dim.explainer}</text>
      <line class="grid-y" x1="${ml}" y1="${y}" x2="${ml + plotW}" y2="${y}"/>
      ${dots}
    `;
  }).join("");

  // Annotations at inflection points
  const findIdx = (yyyy_mm) => pts.findIndex(p => (p.date || "").startsWith(yyyy_mm));
  const khargeIdx = pts.findIndex(p => (p.qno || "").includes("AU365"));
  const annoX = khargeIdx >= 0 ? xS(pts[khargeIdx].t) : 0;
  const annoY = mt + 1 * rowH + rowH/2; // caste row
  const annotation = khargeIdx >= 0 ? `
    <line class="anno-line" x1="${annoX}" y1="${annoY - 14}" x2="${annoX}" y2="${mt - 16}"/>
    <text class="anno-text emph" x="${annoX}" y="${mt - 22}" text-anchor="middle">Kharge — the only rank-by-category disclosure</text>
  ` : "";

  // Legend at bottom
  const legend = `
    <circle cx="${ml + 4}" cy="${H - 22}" r="5" fill="var(--jbm-promise)" stroke="var(--panel)" stroke-width="1.5"/>
    <text class="axis-label" x="${ml + 14}" y="${H - 18}">Disclosed</text>
    <circle cx="${ml + 100}" cy="${H - 22}" r="5" fill="var(--warn)" stroke="var(--panel)" stroke-width="1.5"/>
    <text class="axis-label" x="${ml + 110}" y="${H - 18}">Partial</text>
    <circle cx="${ml + 180}" cy="${H - 22}" r="5" fill="var(--jbm-emph)" stroke="var(--panel)" stroke-width="1.5"/>
    <text class="axis-label" x="${ml + 190}" y="${H - 18}">Withheld</text>
  `;

  const body = `<svg class="jbm-svg" viewBox="0 0 ${W} ${H}">
    ${yearTicks}
    ${rows}
    ${annotation}
    ${legend}
  </svg>`;

  // The key counts that drive the title
  const totalQs = pts.length;
  const casteY = pts.filter(p => p.cat === "Y").length;
  const casteWindow = pts.filter(p => p.cat === "Y" && p.t < new Date("2024-12-31").getTime()).length;
  const casteRecent = pts.filter(p => p.cat === "Y" && p.t >= new Date("2025-03-01").getTime()).length;

  return chartCard({
    title: `What the Ministry has disclosed, plotted in time`,
    deck: `Every parliamentary question on faculty vacancy in our corpus, plotted by date. Each row is one dimension of disclosure. The middle row tells the story: <strong>${casteWindow} of the ${casteY} caste-disclosed answers came before December 2024. After Mar 2025 the breakdowns vanish — except for the one Mallikarjun Kharge extracted in July 2025, and the post-Supreme-Court Mission Mode tally of March 2026.</strong>`,
    body,
    source: `Compiled from ${totalQs} Lok Sabha and Rajya Sabha questions answered between September 2020 and March 2026. "Aggregate" = total vacancy disclosed; "Caste" = SC/ST/OBC breakdown disclosed; "Institution" = institute-wise data disclosed. The Mar 2026 cluster of green/orange dots in the Caste row is the post-Article-142 restoration — 11 days after the Court's order, the Ministry restored category-wise <em>cumulative fills</em>, not vacancies.`,
  });
}

// JBM Chart 6: STACKED BARS BY PARTY — state on Y, segments by political family.
// The story is BOTH the geographic concentration AND the political composition:
// the question-tabling work is opposition work, in opposition states, with the
// ruling coalition's contribution visible as a near-empty sliver.
export function chart6_whoIsAsking() {
  // Group parties into political families for legibility
  const family = (party) => {
    const p = (party || "").toUpperCase();
    if (p.includes("BJP") || p.includes("JD(U)")) return "Ruling coalition";
    if (p.includes("DMK") || p.includes("CPI") || p.includes("MDMK")) return "Dravidian / Left";
    if (p.includes("SP") || p.includes("RJD") || p.includes("BSP")) return "Hindi-belt opposition";
    if (p.includes("INC")) return "Congress";
    if (p.includes("TMC") || p.includes("AAP") || p.includes("KC(M)") || p.includes("IUML") || p.includes("BJD") || p.includes("YSRCP") || p.includes("SS(UBT)") || p.includes("AIADMK")) return "Regional opposition";
    return "Other";
  };
  const familyColors = {
    "Dravidian / Left":      "#a32626",
    "Hindi-belt opposition": "#c97a4a",
    "Congress":              "var(--jbm-promise)",
    "Regional opposition":   "#6b8aab",
    "Ruling coalition":      "var(--jbm-context)",
    "Other":                 "var(--muted)",
  };
  const familyOrder = ["Dravidian / Left","Hindi-belt opposition","Congress","Regional opposition","Ruling coalition","Other"];

  // Aggregate state x family
  const byState = {};
  for (const mp of LS_QUESTIONERS) {
    if (!byState[mp.state]) byState[mp.state] = {};
    const f = family(mp.party);
    byState[mp.state][f] = (byState[mp.state][f] || 0) + mp.count;
  }
  const sorted = Object.entries(byState)
    .map(([state, fams]) => ({ state, fams, total: Object.values(fams).reduce((a,b)=>a+b,0) }))
    .sort((a,b) => b.total - a.total);
  const max = Math.max(...sorted.map(s => s.total));

  const W = 760, rowH = 26, ml = 140, mr = 50, mt = 70, mb = 30;
  const plotW = W - ml - mr;
  const H = mt + sorted.length * rowH + mb;
  const xS = v => (v / max) * plotW;

  // Family legend at top — direct labels
  const legend = familyOrder.filter(f => sorted.some(s => s.fams[f])).map((f, i) => {
    const x = ml + i * 120;
    return `<rect x="${x}" y="${mt - 30}" width="12" height="12" fill="${familyColors[f]}"/>
            <text class="axis-label" x="${x + 16}" y="${mt - 20}" style="font-size:10.5px;">${escapeHTML(f)}</text>`;
  }).join("");

  // Stacked bars
  const bars = sorted.map((s, i) => {
    const y = mt + i * rowH + 4;
    const barH = rowH - 8;
    let acc = 0;
    const segs = familyOrder.map(f => {
      const v = s.fams[f] || 0;
      if (v === 0) return "";
      const w = xS(v);
      const seg = `<rect x="${ml + acc}" y="${y}" width="${w}" height="${barH}" fill="${familyColors[f]}"/>`;
      acc += w;
      return seg;
    }).join("");
    return `
      <text class="data-label" x="${ml - 10}" y="${y + barH/2 + 4}" text-anchor="end" fill="var(--ink)" style="font-weight:600;">${escapeHTML(s.state)}</text>
      ${segs}
      <text class="data-label" x="${ml + xS(s.total) + 8}" y="${y + barH/2 + 4}" fill="var(--ink)" style="font-weight:700;">${s.total}</text>
    `;
  }).join("");

  // Annotation: the ruling-coalition contribution is structural, not coincidental
  const rulingTotal = sorted.reduce((sum, s) => sum + (s.fams["Ruling coalition"] || 0), 0);
  const overallTotal = sorted.reduce((sum, s) => sum + s.total, 0);
  const rulingPct = (rulingTotal / overallTotal * 100).toFixed(0);

  const body = `<svg class="jbm-svg" viewBox="0 0 ${W} ${H}">
    <text class="axis-title" x="${ml}" y="${mt - 50}">Parliamentary questions tabled, by home state and political family of the asking MP</text>
    ${legend}
    ${bars}
  </svg>`;

  const cards = LS_QUESTIONERS.sort((a,b) => b.count - a.count || a.name.localeCompare(b.name))
    .map(mp => `<div class="mp-card"><span class="mp-name">${escapeHTML(mp.name)}${mp.count > 1 ? ` <span style="color:var(--muted); font-weight:500;">·${mp.count}×</span>` : ""}</span><span class="mp-aff">${escapeHTML(mp.party)} <span class="mp-state">· ${escapeHTML(mp.state)}</span></span></div>`).join("");

  return chartCard({
    title: `The accountability work falls to opposition states. The ruling coalition has tabled ${rulingPct}% of these questions`,
    deck: `Each row is one Indian state. Each row's segments show the political family of the MPs from that state who tabled questions on faculty vacancy. The ruling coalition's visible sliver is the entire BJP and JD(U) contribution to this corpus over five years.`,
    body: body + `<details style="margin-top:18px;"><summary style="cursor:pointer; font-size:12px; font-weight:600; color:var(--accent);">Show all ${LS_QUESTIONERS.length} MPs by name</summary><div class="mps-grid" style="margin-top:12px;">${cards}</div></details>`,
    source: `Compiled from 80+ Lok Sabha and Rajya Sabha Q&As on faculty vacancy in centrally-funded HEIs, Sep 2020 – Mar 2026. Party-family classification: <em>Dravidian / Left</em> = DMK, CPI, CPI(M), MDMK; <em>Hindi-belt opposition</em> = SP, RJD, BSP; <em>Regional opposition</em> = TMC, AAP, BJD, YSRCP, AIADMK, KC(M), IUML, SS(UBT); <em>Ruling coalition</em> = BJP, JD(U).`,
  });
}

// JBM Chart 7: LOLLIPOP CHART — country R&D %GDP. Different visual register
// from the bar charts above; circle at the value, line back to zero, single
// outlier emphasised.
export function chart7_rdGap() {
  const data = [
    { c: "Israel",      pct: 5.71 }, { c: "South Korea", pct: 4.93 },
    { c: "USA",         pct: 3.46 }, { c: "Japan",       pct: 3.30 },
    { c: "Germany",     pct: 3.13 }, { c: "UK",          pct: 2.90 },
    { c: "China",       pct: 2.43 }, { c: "Brazil",      pct: 1.21 },
    { c: "India",       pct: 0.65, emph: true },
  ];
  const xMax = 6.0;
  const W = 760, rowH = 30, ml = 140, mr = 100, mt = 50, mb = 30;
  const plotW = W - ml - mr;
  const H = mt + data.length * rowH + mb;
  const xS = v => ml + (v / xMax) * plotW;

  // X-axis ticks
  const xTicks = [0, 1, 2, 3, 4, 5, 6].map(t => `
    <line class="grid-y" x1="${xS(t)}" y1="${mt}" x2="${xS(t)}" y2="${mt + data.length * rowH}"/>
    <text class="axis-label" x="${xS(t)}" y="${mt - 8}" text-anchor="middle">${t}%</text>
  `).join("");

  // Lollipops
  const lollies = data.map((d, i) => {
    const y = mt + i * rowH + rowH / 2;
    const x = xS(d.pct);
    const fill = d.emph ? "var(--jbm-emph)" : "var(--jbm-context)";
    const txt = d.emph ? "var(--ink)" : "var(--muted)";
    const stickStroke = d.emph ? "var(--jbm-emph)" : "var(--jbm-context)";
    return `
      <text class="data-label" x="${ml - 10}" y="${y + 4}" text-anchor="end" fill="${txt}" style="font-weight:${d.emph ? 700 : 500}">${escapeHTML(d.c)}</text>
      <line x1="${ml}" y1="${y}" x2="${x}" y2="${y}" stroke="${stickStroke}" stroke-width="${d.emph ? 2.5 : 1.5}" opacity="${d.emph ? 1 : 0.55}"/>
      <circle cx="${x}" cy="${y}" r="${d.emph ? 7 : 5}" fill="${fill}" stroke="var(--panel)" stroke-width="1.5"/>
      <text class="data-label" x="${x + (d.emph ? 12 : 10)}" y="${y + 4}" fill="${fill}" style="font-weight:${d.emph ? 800 : 600}">${d.pct.toFixed(2)}%</text>
    `;
  }).join("");

  // Annotation INSIDE chart bounds — placed left of India's lollipop, not right
  const india = data[data.length - 1];
  const korea = data.find(d => d.c === "South Korea");
  const ratio = (korea.pct / india.pct).toFixed(1);
  const annoY = mt + (data.length - 1) * rowH + rowH / 2;
  const anno = `
    <text class="anno-text emph" x="${xS(2.2)}" y="${annoY - 20}" text-anchor="start">↓ India: ${ratio}× less than Korea</text>
    <line class="anno-line" x1="${xS(2.2)}" y1="${annoY - 14}" x2="${xS(0.85)}" y2="${annoY - 4}"/>
  `;

  const body = `<svg class="jbm-svg" viewBox="0 0 ${W} ${H}">
    <text class="axis-title" x="${ml}" y="${mt - 28}">Gross expenditure on R&amp;D as % of GDP, most recent year</text>
    ${xTicks}
    ${lollies}
    ${anno}
  </svg>`;

  return chartCard({
    title: `India spends 0.65% of GDP on R&D. The cadre that does R&D is held vacant`,
    deck: `Gross expenditure on Research and Development as a share of GDP, most recent year available, across major economies. The R&D output of any country is produced by its tenured faculty cadre, among others; under-staffing the cadre by a third structurally caps the R&D capacity.`,
    body,
    source: `World Bank / UNESCO Institute for Statistics (most recent year per country). India figure: DST <em>Research and Development Statistics 2022-23</em>. India has been at this floor for two decades; the vacancy story above is one of the structural drivers.`,
  });
}

// JBM Chart 8: PROPORTION BAR — for every 100 PhDs India produces, only 20
// become CFHEI faculty per year. The ratio is the finding; the chart is
// designed to make 1-in-5 visually instant.
export function chart8_counterfactual() {
  const phdsPerYear = 25550;
  const hiresPerYear = 5100;
  const ratio = phdsPerYear / hiresPerYear;  // ≈ 5.0
  const hiredPct = (hiresPerYear / phdsPerYear) * 100;  // ≈ 19.96%

  const W = 760, H = 200;
  const ml = 60, mr = 60, mt = 90, mb = 70;
  const plotW = W - ml - mr;
  const barH = 50;
  const hiredW = (hiredPct / 100) * plotW;

  // Big proportion bar
  const barY = mt;
  const proportionBar = `
    <rect x="${ml}" y="${barY}" width="${plotW}" height="${barH}" fill="var(--jbm-context)"/>
    <rect x="${ml}" y="${barY}" width="${hiredW}" height="${barH}" fill="var(--jbm-emph)"/>
    <line x1="${ml + hiredW}" y1="${barY - 6}" x2="${ml + hiredW}" y2="${barY + barH + 6}" stroke="var(--ink)" stroke-width="1.5"/>
    <text class="anno-text emph" x="${ml + hiredW / 2}" y="${barY + barH/2 + 5}" text-anchor="middle" fill="var(--panel)" style="font-weight:800; font-size:14px;">${hiresPerYear.toLocaleString('en-IN')} hired</text>
    <text class="anno-text" x="${ml + hiredW + (plotW - hiredW)/2}" y="${barY + barH/2 + 5}" text-anchor="middle" fill="var(--ink)" style="font-weight:700; font-size:14px;">${(phdsPerYear - hiresPerYear).toLocaleString('en-IN')} go elsewhere</text>
  `;

  // Annotation labels above
  const labelsAbove = `
    <text class="data-label emph" x="${ml + hiredW / 2}" y="${barY - 12}" text-anchor="middle" style="font-weight:800; font-size:13px;">${hiredPct.toFixed(0)}% become faculty</text>
    <text class="data-label" x="${ml + hiredW + (plotW - hiredW)/2}" y="${barY - 12}" text-anchor="middle" fill="var(--muted)" style="font-weight:700; font-size:13px;">${(100 - hiredPct).toFixed(0)}% absorbed by industry, emigration, or ad-hoc roles</text>
  `;

  // Labels below: legend
  const legendY = barY + barH + 30;
  const totalLabel = `<text class="axis-title" x="${ml}" y="${mt - 56}">Of every 100 PhDs awarded in India each year ↓</text>`;
  const legend = `
    <text class="data-label" x="${ml}" y="${legendY}" fill="var(--ink)" style="font-weight:700; font-size:13px;">${phdsPerYear.toLocaleString('en-IN')} PhDs awarded annually (AISHE 2021-22)</text>
    <text class="data-label" x="${ml}" y="${legendY + 18}" fill="var(--muted)" style="font-weight:500;">${hiresPerYear.toLocaleString('en-IN')} faculty hired across all CFHEIs annually (Mission Mode rate, Sep 2022 – Jan 2026)</text>
  `;

  const body = `<svg class="jbm-svg" viewBox="0 0 ${W} ${H}">
    ${totalLabel}
    ${labelsAbove}
    ${proportionBar}
    ${legend}
  </svg>`;

  return chartCard({
    title: `Four out of five Indian PhDs find no faculty seat in India each year`,
    deck: `India produces ~25,550 doctorates per year — the third-highest absolute output of any country. Of these, fewer than one in five are absorbed into the centrally-funded higher-education faculty cadre. The bottleneck is not supply.`,
    body,
    source: `PhD output: AISHE 2021-22, Ministry of Education. Faculty hire rate: 17,878 faculty filled across all CFHEIs over Sep 2022 – Jan 2026 = ~5,100/year (LS AU5842, Mar 2026). The annual surplus emigrates (the documented IIT/IISc-to-US-academia channel), enters industry R&D, or vanishes into unprotected ad-hoc/contract teaching outside the reservation regime. The faculty cadre's gates are kept tight while the candidate pool is large; the choice is not between filling the seats and finding the talent — it is between filling the seats and not.`,
  });
}

// ---- Story-mode visualisations (legacy — kept for callers, not displayed) ---

// Burn-Murdoch slope chart: mandate share (left) → actual share (right).
// One line per category. Lines that slope DOWN = categories under-realised.
// EWS in saturated red (worst case), General in grey (over-realised), the
// rest muted. The chart's slope IS the argument; no captions needed.
export function realisationSlopeChart(snaps) {
  const mm = snaps.find(s => s.institution_group === "all_chei_mission_mode" && s.by_category && (s.by_category.SC?.in_position || 0) > 0);
  if (!mm) return "";
  const c = mm.by_category;
  const cats = [
    { key: "GEN", name: "General",  fills: c.GEN?.in_position || 0, mandate: 40.5, color: "gain" },
    { key: "OBC", name: "OBC",      fills: c.OBC?.in_position || 0, mandate: 27.0, color: "muted" },
    { key: "SC",  name: "SC",       fills: c.SC?.in_position || 0,  mandate: 15.0, color: "outlier-orange" },
    { key: "EWS", name: "EWS",      fills: c.EWS?.in_position || 0, mandate: 10.0, color: "outlier-red" },
    { key: "ST",  name: "ST",       fills: c.ST?.in_position || 0,  mandate: 7.5,  color: "muted" },
  ];
  const total = cats.reduce((s, x) => s + x.fills, 0);
  if (total === 0) return "";

  // SVG geometry. Two columns at x=180 and x=560. y-axis scaled 0..60% to fit.
  const W = 760, H = 320;
  const xL = 180, xR = 560;
  const yMin = 0, yMax = 65;
  const yTop = 40, yBot = 270;
  const yScale = (v) => yBot - ((v - yMin) / (yMax - yMin)) * (yBot - yTop);

  const lines = cats.map(cat => {
    const sharePct = (cat.fills / total) * 100;
    const realisation = (sharePct / cat.mandate) * 100;
    const yMan = yScale(cat.mandate);
    const yAct = yScale(sharePct);
    return `
      <line class="line ${cat.color}" x1="${xL}" y1="${yMan}" x2="${xR}" y2="${yAct}"/>
      <circle class="point ${cat.color}" cx="${xL}" cy="${yMan}" r="5"/>
      <circle class="point ${cat.color}" cx="${xR}" cy="${yAct}" r="5"/>
      <text class="row-label ${cat.color}" x="${xL - 12}" y="${yMan + 4}" text-anchor="end">${cat.name} ${cat.mandate}%</text>
      <text class="row-label ${cat.color}" x="${xR + 12}" y="${yAct + 4}" text-anchor="start">${sharePct.toFixed(1)}% <tspan fill="${cat.color === 'gain' ? 'var(--muted)' : (cat.color.includes('outlier') ? 'var(--alarm)' : 'var(--muted-soft)')}" font-size="10">→ ${realisation.toFixed(0)}% of mandate</tspan></text>
    `;
  }).join("");

  return `<div class="viz-card slope-card">
    <div class="viz-hdr" style="font-size:18px; line-height:1.3;">EWS realises at one-third of its mandate. The General category over-realises by 44%.</div>
    <div class="viz-sub" style="margin-bottom:16px;">Mandated share of all CFHEI faculty hires (left) compared to actual share (right), Sep 2022 → Jan 2026.</div>
    <svg class="slope-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="Slope chart of mandate vs actual share">
      <defs>
        <marker id="arrowred" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--alarm)"/>
        </marker>
      </defs>
      <text class="axis-label" x="${xL}" y="22" text-anchor="middle">MANDATE</text>
      <text class="axis-label" x="${xR}" y="22" text-anchor="middle">ACTUAL</text>
      ${lines}
      <!-- Annotations -->
      <line class="annotation-arrow" x1="${xR + 110}" y1="${yScale(3.07)}" x2="${xR + 50}" y2="${yScale(3.07)}"/>
      <text class="annotation" x="${xR + 115}" y="${yScale(3.07) + 4}">EWS — short by 7 percentage points</text>
      <line class="annotation-arrow" x1="${xR + 110}" y1="${yScale(58.5)}" x2="${xR + 50}" y2="${yScale(58.5)}"/>
      <text class="annotation" x="${xR + 115}" y="${yScale(58.5) + 4}" style="fill:var(--muted);">General — captures the surplus</text>
    </svg>
    <div class="chart-source"><strong>Source:</strong> Lok Sabha Q. 5842, 30 Mar 2026 (first cumulative-by-category disclosure, surfaced after the Supreme Court's Article 142 order). Total faculty filled across all CFHEIs: ${total.toLocaleString('en-IN')}. Mandate: SC 15%, ST 7.5%, OBC 27%, EWS 10%; GEN-residual 40.5% post-103rd Amendment.</div>
  </div>`;
}

// Donut chart: Mission Mode fills by category, with mandate ring outside.
// SVG so it's crisp at any zoom. The visual story: the pie is mostly grey
// (General); the SC/ST/OBC/EWS slices are visibly small.
export function realisationDonut(snaps) {
  const mm = snaps.find(s => s.institution_group === "all_chei_mission_mode" && s.by_category && (s.by_category.SC?.in_position || 0) > 0);
  if (!mm) return "";
  const c = mm.by_category;
  const cats = [
    { key: "GEN", name: "General",  fills: c.GEN?.in_position || 0, mandate: 40.5, color: "#6b6b6b" },
    { key: "OBC", name: "OBC",      fills: c.OBC?.in_position || 0, mandate: 27.0, color: "#b88a2e" },
    { key: "SC",  name: "SC",       fills: c.SC?.in_position || 0,  mandate: 15.0, color: "#b46438" },
    { key: "EWS", name: "EWS",      fills: c.EWS?.in_position || 0, mandate: 10.0, color: "#2a4a6e" },
    { key: "ST",  name: "ST",       fills: c.ST?.in_position || 0,  mandate: 7.5,  color: "#a32626" },
  ];
  const total = cats.reduce((s, x) => s + x.fills, 0);
  if (total === 0) return "";
  // Build SVG arcs
  const cx = 140, cy = 140, rOuter = 110, rInner = 64;
  let acc = 0;
  const arcs = cats.map(cat => {
    const startAngle = (acc / total) * 2 * Math.PI - Math.PI / 2;
    acc += cat.fills;
    const endAngle = (acc / total) * 2 * Math.PI - Math.PI / 2;
    const largeArc = (endAngle - startAngle) > Math.PI ? 1 : 0;
    const x1 = cx + rOuter * Math.cos(startAngle), y1 = cy + rOuter * Math.sin(startAngle);
    const x2 = cx + rOuter * Math.cos(endAngle),   y2 = cy + rOuter * Math.sin(endAngle);
    const x3 = cx + rInner * Math.cos(endAngle),   y3 = cy + rInner * Math.sin(endAngle);
    const x4 = cx + rInner * Math.cos(startAngle), y4 = cy + rInner * Math.sin(startAngle);
    return `<path d="M ${x1} ${y1} A ${rOuter} ${rOuter} 0 ${largeArc} 1 ${x2} ${y2} L ${x3} ${y3} A ${rInner} ${rInner} 0 ${largeArc} 0 ${x4} ${y4} Z" fill="${cat.color}" stroke="var(--panel)" stroke-width="2"/>`;
  }).join("");
  // Mandate dashes — small ticks outside donut
  const mandateMarks = cats.map(cat => {
    // Cumulative mandate position
    const cumMandate = cats.slice(0, cats.indexOf(cat) + 1).reduce((s, x) => s + x.mandate, 0);
    const angle = (cumMandate / 100) * 2 * Math.PI - Math.PI / 2;
    const x1 = cx + (rOuter + 4) * Math.cos(angle), y1 = cy + (rOuter + 4) * Math.sin(angle);
    const x2 = cx + (rOuter + 14) * Math.cos(angle), y2 = cy + (rOuter + 14) * Math.sin(angle);
    return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${cat.color}" stroke-width="2" stroke-dasharray="2,2"/>`;
  }).join("");
  const legend = cats.map(cat => {
    const sharePct = (cat.fills / total) * 100;
    const realisation = (sharePct / cat.mandate) * 100;
    const cls = realisation < 50 ? "under" : realisation > 110 ? "over" : "";
    return `<div class="row">
      <div class="swatch" style="background:${cat.color}"></div>
      <span class="cat">${escapeHTML(cat.name)}</span>
      <span style="font-size:12px;">${sharePct.toFixed(1)}% <span style="color:var(--muted)">of ${cat.mandate}% mandate</span></span>
      <span class="gap ${cls}">${realisation.toFixed(0)}%</span>
    </div>`;
  }).join("");
  return `<div class="viz-card">
    <div class="viz-hdr">59 of every 100 hires went to the General category. The mandate is 40.5%.</div>
    <div class="viz-sub">Dashes mark where each category's statutory mandate should reach.</div>
    <div class="donut-wrap">
      <svg class="donut-svg" viewBox="0 0 280 280" role="img" aria-label="Mission Mode fills donut">
        ${arcs}
        ${mandateMarks}
        <text x="140" y="135" text-anchor="middle" class="donut-center" style="font-size:24px;">${total.toLocaleString('en-IN')}</text>
        <text x="140" y="156" text-anchor="middle" class="donut-center-label">faculty filled<tspan x="140" dy="13">since Sep 2022</tspan></text>
      </svg>
      <div class="donut-legend">${legend}<div style="margin-top:6px; font-size:11px; color:var(--muted); font-style:italic;">Right column: realisation as % of statutory mandate. Below 100% = under-filled. Above = over-filled.</div></div>
    </div>
  </div>`;
}

// R&D comparison: India vs major economies on R&D % GDP. The story:
// faculty under-staffing is one structural reason this metric is stuck.
export function rdGapPanel() {
  const data = [
    { country: "Israel",      pct: 5.71, year: 2021 },
    { country: "South Korea", pct: 4.93, year: 2021 },
    { country: "USA",         pct: 3.46, year: 2021 },
    { country: "Japan",       pct: 3.30, year: 2021 },
    { country: "Germany",     pct: 3.13, year: 2021 },
    { country: "China",       pct: 2.43, year: 2021 },
    { country: "UK",          pct: 2.90, year: 2021 },
    { country: "Brazil",      pct: 1.21, year: 2020 },
    { country: "India",       pct: 0.65, year: 2020, isIndia: true },
  ];
  const max = Math.max(...data.map(d => d.pct));
  const rows = data.map((d, i) => {
    const isLast = i === data.length - 1;
    const annotation = d.isIndia
      ? `<span style="position:absolute; top:50%; left:calc(${(d.pct/max)*100}% + 8px); transform:translateY(-50%); white-space:nowrap;"><span class="anno-callout">↑ India spends 7.6× less than Korea</span></span>`
      : "";
    return `<div class="rd-row${d.isIndia ? ' india' : ''}">
      <span class="rd-country" style="${!d.isIndia ? 'color:var(--muted); font-weight:500;' : ''}">${escapeHTML(d.country)}${d.isIndia ? ' ▼' : ''}</span>
      <div class="rd-bar-track" style="position:relative;">
        <div class="rd-bar-fill" style="width:${(d.pct/max)*100}%; ${!d.isIndia ? 'opacity:0.4;' : ''}"></div>
        ${annotation}
      </div>
      <span class="rd-pct" style="${!d.isIndia ? 'color:var(--muted); font-weight:500;' : ''}">${d.pct.toFixed(2)}%</span>
    </div>`;
  }).join("");
  return `<div class="viz-card">
    <div class="viz-hdr">India is last on R&amp;D among major economies. The faculty cadre is one reason why.</div>
    <div class="viz-sub">Gross expenditure on R&amp;D as % of GDP, latest year.</div>
    <div class="rd-strip" style="margin-top:18px;">${rows}</div>
    <div class="chart-source"><strong>Source:</strong> World Bank / UNESCO Institute for Statistics; India figure DST <em>R&amp;D Statistics 2022-23</em>. Latest available year per country.</div>
  </div>`;
}

// Talent pipeline: PhDs → faculty hires → emigration. Stylised flow.
export function talentPipeline() {
  return `<div class="viz-card">
    <div class="viz-hdr">25,550 PhDs in. 5,100 hired. The bottleneck is not supply.</div>
    <div class="viz-sub">India's annual PhD output → standing CFHEI vacancy → faculty actually hired. The surplus emigrates or vanishes into ad-hoc roles.</div>
    <div class="pipeline">
      <div class="pipe-stage input">
        <span class="pipe-label">Year ↦ in</span>
        <span class="pipe-num">~25,550</span>
        <span class="pipe-num-sub">PhDs awarded annually (India, 2021-22)</span>
        <span class="pipe-note">The largest absolute PhD output of any G20 country apart from China and the USA. Source: AISHE 2021-22, MoE.</span>
      </div>
      <div class="pipe-arrow">→</div>
      <div class="pipe-stage">
        <span class="pipe-label">Available</span>
        <span class="pipe-num">~14,600</span>
        <span class="pipe-num-sub">vacant CFHEI faculty positions (Feb 2023 baseline)</span>
        <span class="pipe-note">Standing inventory of unfilled posts the system <em>could</em> fill from this annual flow. The math is not the problem.</span>
      </div>
      <div class="pipe-arrow">→</div>
      <div class="pipe-stage leak">
        <span class="pipe-label">Year ↦ out</span>
        <span class="pipe-num">~5,100</span>
        <span class="pipe-num-sub">faculty actually hired per year (Mission Mode rate)</span>
        <span class="pipe-note">~17,878 faculty filled over Sep 2022 → Jan 2026 ≈ 5,100/year across all CFHEIs combined. Surplus PhDs leave for industry or abroad.</span>
      </div>
    </div>
    <div class="pipe-leak-row">
      <div></div>
      <div class="leak-arrow">↓ leakage points ↓</div>
      <div></div>
    </div>
    <p class="caption" style="margin-top:6px;">Where the surplus goes: industry research, foreign academia (the IIT/IISc-to-US-academia channel is well-documented), domestic ad-hoc/contract teaching outside the reservation regime, or out of the academic stream entirely. The faculty cadre's loss is some other ledger's gain — typically a foreign one. Cumulative effect over a decade is the brain-drain pattern Indian higher-ed leaders publicly lament while the same leaders keep the cadre's gates closed.</p>
  </div>`;
}

// Caste rank pyramid for CU faculty using Kharge data.
// We have only vacancies, not in-position numbers, so we render a
// "what's still missing at each rank" pyramid that visualises the
// rank-stratification structurally.
export function castePyramid(snaps) {
  const k = snaps.find(s => s._kharge_disclosure);
  if (!k || !k._rank_wise_vacancy) return "";
  const ranks = ["Assistant Professor", "Associate Professor", "Professor"];
  const rv = k._rank_wise_vacancy;
  const rowTotals = ranks.map(r => (rv[r]?.SC||0) + (rv[r]?.ST||0) + (rv[r]?.OBC||0));
  const maxTotalIdx = rowTotals.indexOf(Math.max(...rowTotals));
  const rows = ranks.map((r, i) => {
    const sc = rv[r]?.SC || 0, st = rv[r]?.ST || 0, obc = rv[r]?.OBC || 0;
    const total = sc + st + obc;
    const segs = [
      { k: "obc", name: "OBC", v: obc },
      { k: "sc",  name: "SC",  v: sc  },
      { k: "st",  name: "ST",  v: st  },
    ];
    const pyrSegs = segs.map(s => `<div class="pyr-seg ${s.k}" style="flex:${s.v}" title="${s.name}: ${s.v} vacant">${s.v >= 100 ? `${s.name} ${s.v}` : s.v}</div>`).join("");
    const isMax = i === maxTotalIdx;
    const anno = isMax
      ? `<span style="position:absolute; right:-260px; top:50%; transform:translateY(-50%); white-space:nowrap;"><span class="anno-callout">← Largest unfilled bucket. The bridge rank is broken.</span></span>`
      : "";
    return `<div class="pyr-row" style="${isMax ? 'position:relative;' : ''}">
      <span class="pyr-rank">${escapeHTML(r)}</span>
      <div class="pyr-bar" style="${isMax ? 'box-shadow: 0 0 0 2px var(--alarm);' : ''}">${pyrSegs}</div>
      <span class="pyr-total" style="${isMax ? 'color:var(--alarm); font-weight:800;' : ''}">${total} vacant</span>
      ${anno}
    </div>`;
  }).join("");
  return `<div class="viz-card">
    <div class="viz-hdr">The rank pyramid, drawn in vacant seats</div>
    <div class="viz-sub">Bahujan candidates enter at Assistant Professor. The seats above them have not been filled.</div>
    <div class="pyramid">${rows}</div>
    <div class="pyr-legend">
      <span><span class="lswatch" style="background:#a32626"></span> ST</span>
      <span><span class="lswatch" style="background:#b46438"></span> SC</span>
      <span><span class="lswatch" style="background:#b88a2e"></span> OBC</span>
    </div>
  </div>`;
}

// Counterfactual ticker — what 14,606 vacancies translate to in human terms.
export function counterfactualTicker() {
  return `<div class="counterfactual">
    <span class="cf-num">~3,50,000</span>
    <span class="cf-label">students currently being taught by absent teachers, on the assumption of a 24:1 student-faculty ratio against the Feb 2023 baseline of 14,606 vacant CFHEI positions. The number rises with every cohort.</span>
    <div class="cf-bullets">
      <div class="cf-bullet">
        <b>~2,630</b>
        <span>SC + ST + OBC faculty seats kept vacant in Central Universities alone (Jul 2025) — every one is a Bahujan candidate's reserved post that was promised by statute and not delivered.</span>
      </div>
      <div class="cf-bullet">
        <b>3 yrs</b>
        <span>since the Ministry last published any data on PwBD (disability) faculty vacancies. The 4% mandate exists; the compliance figure has been withheld since Mar 2023.</span>
      </div>
      <div class="cf-bullet">
        <b>~5,100/yr</b>
        <span>faculty hired across all CFHEIs in Mission Mode — about a fifth of India's annual PhD output. The rest of the surplus goes to industry, abroad, or unprotected ad-hoc teaching.</span>
      </div>
    </div>
  </div>`;
}

// ---- RS-corpus visualisations -----------------------------------------

// The Kharge disclosure (RS AU365, 23 Jul 2025) — the only document in the
// corpus with rank × category vacancy data. Render as a heatmap-style table.
export function khargeRankMatrix(snaps) {
  const k = snaps.find(s => s._kharge_disclosure);
  if (!k || !k._rank_wise_vacancy) return "";
  const ranks = ["Professor", "Associate Professor", "Assistant Professor"];
  const cats = ["SC", "ST", "OBC"];
  const totals = {
    Professor: { SC: 197, ST: 120, OBC: 339 },
    "Associate Professor": { SC: 324, ST: 199, OBC: 608 },
    "Assistant Professor": { SC: 190, ST: 109, OBC: 544 },
  };
  // Find max for colour-scaling
  let max = 0;
  ranks.forEach(r => cats.forEach(c => { max = Math.max(max, k._rank_wise_vacancy[r]?.[c] || 0); }));
  const cellColour = (v) => {
    const intensity = max > 0 ? v / max : 0;
    return `rgba(200, 16, 46, ${0.08 + intensity * 0.55})`;
  };
  const rowsHTML = ranks.map(r => {
    const cells = cats.map(c => {
      const v = k._rank_wise_vacancy[r]?.[c] || 0;
      return `<td style="background:${cellColour(v)}; text-align:center; font-weight:700; font-variant-numeric:tabular-nums; color:${v > max*0.6 ? '#fff' : 'var(--ink)'};">${v}</td>`;
    }).join("");
    const rowTotal = cats.reduce((s, c) => s + (k._rank_wise_vacancy[r]?.[c] || 0), 0);
    return `<tr><td style="font-weight:600;">${escapeHTML(r)}</td>${cells}<td style="text-align:center; font-weight:700; color:var(--muted);">${rowTotal}</td></tr>`;
  }).join("");
  const colTotals = cats.map(c => ranks.reduce((s, r) => s + (k._rank_wise_vacancy[r]?.[c] || 0), 0));
  const grandTotal = colTotals.reduce((s, x) => s + x, 0);
  return `<div class="viz-card">
    <div class="viz-hdr" style="color:var(--alarm);">The number of Bahujan faculty seats kept empty in Central Universities — disclosed once, to one MP</div>
    <div class="viz-sub">Reserved-category teaching vacancies in CUs as of 1 July 2025. Released by the Ministry of Education in answer to Mallikarjun Kharge, Leader of Opposition (Rajya Sabha). Withheld from every other parliamentarian who asked.</div>
    <table class="dr-table" style="margin-top:6px;">
      <thead><tr>
        <th></th>
        ${cats.map(c => `<th style="text-align:center;">${c} vacant</th>`).join("")}
        <th style="text-align:center;">Row total</th>
      </tr></thead>
      <tbody>${rowsHTML}
        <tr style="border-top:2px solid var(--border);">
          <td style="font-weight:700;">Column total</td>
          ${colTotals.map(t => `<td style="text-align:center; font-weight:700; color:var(--muted);">${t}</td>`).join("")}
          <td style="text-align:center; font-weight:800; color:var(--alarm);">${grandTotal} reserved-cat vacant</td>
        </tr>
      </tbody>
    </table>
    <p class="caption" style="margin-top:12px;">What the matrix shows: <strong>OBC vacancy is the largest single bucket</strong> (1,491 unfilled across all CU teaching ranks). <strong>Associate Professor is the most under-staffed reserved-category rank</strong> for SC and OBC — indicating that even where entry-level appointments happen, the rank-promotion bottleneck is real and reserved candidates are not progressing through the cadre. <strong>Professor SC posts (197 vacant)</strong> exceed Assistant Professor SC posts (190 vacant) — meaning the apex of the cadre is more empty than its base for Scheduled Caste candidates.</p>
    <div class="viz-source">Source: Rajya Sabha Unstarred Q. 365 (23 Jul 2025), asked by Shri Mallikarjun Kharge; answer by Dr. Sukanta Majumdar, MoS Education.</div>
  </div>`;
}

// ---- LS-corpus visualisations -----------------------------------------

// Time-series bar chart: Central University vacancy 2024-04 → 2025-07.
// The shape of the chart IS the finding — vacancy is essentially flat
// across 15 months despite the Mission Mode counter rising in parallel.
export function vacancyTimelineChart(snaps) {
  // Pull the parliamentary record on Central University teaching vacancy.
  // Combine LS-corpus + RS pre-2024 baselines so the line spans Apr 2022 → Jul 2025.
  const allCU = snaps
    .filter(s => s.institution_group === "all_central_universities" && (s.totals?.vacant != null) && (s.post_type || "").toLowerCase().includes("faculty"))
    .map(s => ({
      date: s.as_of,
      vacant: s.totals.vacant,
      hasCategory: !!(s.by_category && s.by_category.SC && s.by_category.SC.vacant != null),
    }))
    .sort((a, b) => (a.date || "").localeCompare(b.date || ""));
  // Manual addition of the Mar 2023 AS153 datum (PwBD disclosure has by_category.PwBD instead of SC structure)
  // It's already in the snapshots with vacant=6028; the filter above catches it if structure matches.
  if (allCU.length < 3) return "";

  // SVG geometry
  const W = 760, H = 360;
  const ml = 60, mr = 200, mt = 50, mb = 70;
  const plotW = W - ml - mr, plotH = H - mt - mb;
  const minDate = new Date(allCU[0].date).getTime();
  const maxDate = new Date(allCU[allCU.length - 1].date).getTime();
  const dateRange = maxDate - minDate;
  const yMax = Math.ceil(Math.max(...allCU.map(d => d.vacant)) / 1000) * 1000;
  const xScale = (d) => ml + ((new Date(d).getTime() - minDate) / dateRange) * plotW;
  const yScale = (v) => mt + plotH - (v / yMax) * plotH;

  // Y-axis ticks
  const yTicks = [0, yMax/4, yMax/2, 3*yMax/4, yMax];
  const gridY = yTicks.map(t => `
    <line class="grid" x1="${ml}" y1="${yScale(t)}" x2="${ml + plotW}" y2="${yScale(t)}"/>
    <text class="axis-num" x="${ml - 8}" y="${yScale(t) + 4}" text-anchor="end">${t.toLocaleString('en-IN')}</text>
  `).join("");

  // X-axis ticks (per data point)
  const xTicks = allCU.map(d => {
    const x = xScale(d.date);
    const label = new Date(d.date).toLocaleDateString('en-IN', { month: 'short', year: '2-digit' });
    return `<text class="axis-label-x" x="${x}" y="${mt + plotH + 18}" text-anchor="middle">${label}</text>`;
  }).join("");

  // Cutover index: where category disclosure ends
  const cutoverIdx = allCU.findIndex((d, i) => i > 0 && allCU[i-1].hasCategory && !d.hasCategory);

  // Two-segment line: cobalt where category data was given, alarm where withheld.
  let pathDisclosed = "", pathWithheld = "";
  allCU.forEach((d, i) => {
    const x = xScale(d.date), y = yScale(d.vacant);
    if (i <= cutoverIdx || cutoverIdx === -1) {
      pathDisclosed += (pathDisclosed ? " L " : "M ") + x + " " + y;
    }
    if (i >= cutoverIdx - 1 && cutoverIdx !== -1) {
      pathWithheld += (pathWithheld ? " L " : "M ") + x + " " + y;
    }
  });

  const dots = allCU.map(d => {
    const x = xScale(d.date), y = yScale(d.vacant);
    const colorClass = d.hasCategory ? "disclosed" : "withheld";
    return `
      <circle class="dot ${colorClass}" cx="${x}" cy="${y}" r="5"/>
      <text class="dot-label ${colorClass}" x="${x}" y="${y - 14}" text-anchor="middle">${d.vacant.toLocaleString('en-IN')}</text>
    `;
  }).join("");

  // Annotation: at the cutover point
  let annotation = "";
  if (cutoverIdx > 0 && cutoverIdx < allCU.length) {
    const cx = xScale(allCU[cutoverIdx].date);
    const cy = yScale(allCU[cutoverIdx].vacant);
    annotation = `
      <line class="anno-line" x1="${cx}" y1="${cy + 20}" x2="${cx + 80}" y2="${cy + 80}"/>
      <text class="anno-text" x="${cx + 84}" y="${cy + 84}">From here on, the Ministry</text>
      <text class="anno-text" x="${cx + 84}" y="${cy + 100}">stops publishing how many</text>
      <text class="anno-text" x="${cx + 84}" y="${cy + 116}">of these vacant seats are</text>
      <text class="anno-text bold" x="${cx + 84}" y="${cy + 132}">reserved for SC/ST/OBC.</text>
    `;
  }

  // Right-margin labels for each segment
  const lastDot = allCU[allCU.length - 1];
  const segLabels = `
    <text class="seg-label disclosed" x="${ml + 8}" y="${mt - 12}">● Category breakdown disclosed</text>
    <text class="seg-label withheld" x="${ml + 230}" y="${mt - 12}">● Withheld</text>
  `;

  return `<div class="viz-card">
    <div class="viz-hdr">When Bahujan seats stopped being counted</div>
    <div class="viz-sub">Vacant teaching posts in India's 45 Central Universities, as disclosed in answers to Lok Sabha and Rajya Sabha questions, April 2022 – July 2025.</div>
    <svg class="line-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="Vacancy timeline">
      ${gridY}
      ${xTicks}
      ${segLabels}
      <path class="line-disclosed" d="${pathDisclosed}"/>
      <path class="line-withheld" d="${pathWithheld}" stroke-dasharray="6,4"/>
      ${dots}
      ${annotation}
      <text class="axis-y-title" x="${ml - 44}" y="${mt - 16}" text-anchor="start">Vacant teaching posts</text>
    </svg>
    <div class="chart-source"><strong>Source:</strong> LS AU81 (Jul 2024), LS AU47 (Nov 2024), LS AS328 (Mar 2025), LS AU1206 (Jul 2025), RS AS153 (Mar 2023), RS AU1938 (Aug 2022). Each point is one parliamentary answer. The 200-point roster maintained under the CEI(RTC) Act, 2019 contains the underlying category data; its disclosure is at the discretion of the Ministry of Education.</div>
  </div>`;
}

// Mission Mode realisation chart: cumulative faculty fills since Sep 2022,
// by category. The numbers were withheld for ~12 months and surfaced only
// after the Supreme Court's Article 142 order of 15 Jan 2026.
export function missionModeRealisationChart(snaps) {
  const mm = snaps.find(s => s.institution_group === "all_chei_mission_mode");
  if (!mm || !mm.by_category) return "";
  const c = mm.by_category;
  const totalFac = ["GEN","SC","ST","OBC","EWS"].reduce((s, k) => s + (c[k]?.in_position || 0), 0);
  if (totalFac === 0) return "";
  // Mandate (post-EWS): SC 15 / ST 7.5 / OBC 27 / EWS 10 / GEN-residual 40.5
  const targets = { SC: 15, ST: 7.5, OBC: 27, EWS: 10, GEN: 40.5 };
  const labels = { SC: "SC", ST: "ST", OBC: "OBC", EWS: "EWS", GEN: "GEN" };
  const rows = ["SC","ST","OBC","EWS","GEN"].map(k => {
    const filled = c[k]?.in_position || 0;
    const sharePct = (filled / totalFac) * 100;
    const target = targets[k];
    const realisation = (sharePct / target) * 100;
    const cls = realisation > 110 ? "over"
              : realisation < 50 ? "severe"
              : realisation < 90 ? "under"
              : "";
    return `<div class="mm-row">
      <span class="mm-cat">${labels[k]}</span>
      <div class="mm-track">
        <div class="mm-fill-mandate" style="width: ${(target/40.5)*100}%;"></div>
        <div class="mm-fill-actual ${cls}" style="width: ${Math.min((sharePct/40.5)*100, 100)}%;"></div>
        <div class="mm-mandate-label" style="left: ${(target/40.5)*100}%;">▼ ${target}% mandate</div>
      </div>
      <span class="mm-pct">${sharePct.toFixed(1)}%
        <span class="mm-real ${cls}">→ ${realisation.toFixed(0)}% of mandate</span>
      </span>
    </div>`;
  }).join("");
  return `<div class="viz-card">
    <div class="viz-hdr">Mission Mode fills, by category — short of every reserved mandate</div>
    <div class="viz-sub">${totalFac.toLocaleString('en-IN')} faculty appointments, Sep 2022–Jan 2026. Dashed line = statutory mandate.</div>
    ${rows}
    <div class="viz-source">Source: AU5842 (30 Mar 2026) — first disclosure of category-wise Mission Mode fills, surfaced only after Supreme Court Article 142 order of 15 Jan 2026.</div>
  </div>`;
}

// Disclosure-regression matrix: 25 LS Q&As, what each disclosed.
export function disclosureMatrix() {
  const cellClass = (v) => v === "Y" ? "dr-y" : v === "N" ? "dr-n" : "dr-p";
  const cellLabel = (v) => v === "Y" ? "Yes" : v === "N" ? "No" : "Partial";
  const rows = LS_DISCLOSURE.map(r => `
    <tr>
      <td class="dr-q">${escapeHTML(r.qno)}</td>
      <td>${escapeHTML(r.date)}</td>
      <td style="font-size:12px;">${escapeHTML(r.subject)}</td>
      <td style="font-size:11.5px; color:var(--muted);">${escapeHTML(r.asker)}</td>
      <td class="dr-cell ${cellClass(r.total)}">${cellLabel(r.total)}</td>
      <td class="dr-cell ${cellClass(r.cat)}">${cellLabel(r.cat)}</td>
      <td class="dr-cell ${cellClass(r.inst)}">${cellLabel(r.inst)}</td>
    </tr>`).join("");
  const yesCount = (key) => LS_DISCLOSURE.filter(r => r[key] === "Y").length;
  return `<div class="viz-card">
    <div class="viz-hdr">Every parliamentary question, every answer — Sep 2020 → Mar 2026</div>
    <div class="viz-sub">${yesCount("cat")} of ${LS_DISCLOSURE.length} answers disclosed category data. Read the column.</div>
    <div style="overflow-x: auto;">
      <table class="dr-table">
        <thead><tr>
          <th>Q. No.</th><th>Date</th><th>Subject</th><th>Asked by</th>
          <th style="text-align:center;">Total?</th>
          <th style="text-align:center;">Category?</th>
          <th style="text-align:center;">Institution?</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  </div>`;
}

// AIIMS network panel — per-institute vacancy rate, sorted by severity.
export function aiimsNetworkPanel(snaps) {
  const aiims = snaps.find(s => s.institution_group === "all_aiims");
  if (!aiims || !aiims._per_institution) return "";
  const sorted = [...aiims._per_institution].sort((a, b) => b.vacancy_rate - a.vacancy_rate);
  const max = Math.max(...sorted.map(r => r.vacancy_rate));
  const t = aiims.totals;
  const overallRate = t ? ((t.vacant / t.sanctioned) * 100).toFixed(1) : "—";

  const rows = sorted.map(r => {
    const cls = r.vacancy_rate >= 50 ? "severe" : r.vacancy_rate >= 35 ? "high" : "normal";
    const rowCls = r.vacancy_rate >= 50 ? " severe" : "";
    return `<div class="rb-row${rowCls}">
      <span class="rb-name">AIIMS ${escapeHTML(r.name)}</span>
      <div class="rb-bar-track">
        <div class="rb-bar-fill ${cls}" style="width: ${(r.vacancy_rate / max) * 100}%"></div>
      </div>
      <span class="rb-pct ${cls}">${r.vacancy_rate.toFixed(0)}%</span>
    </div>`;
  }).join("");

  return `<div class="viz-card">
    <div class="viz-hdr">In rural India, the AIIMS that were built to bring tertiary care closer are running on half-strength faculty</div>
    <div class="viz-sub">Faculty vacancy rate at each operational All India Institute of Medical Sciences. Network total: ${t.in_position.toLocaleString('en-IN')} of ${t.sanctioned.toLocaleString('en-IN')} faculty in position (${overallRate}% vacant).</div>
    <div class="ranked-bars">
      ${rows}
      <div class="rb-axis">
        <span></span>
        <div class="rb-axis-ticks"><span>0%</span><span>20%</span><span>40%</span><span>60%</span></div>
        <span></span>
      </div>
    </div>
    <div class="chart-source"><strong>Source:</strong> Lok Sabha Starred Q. 207 (13 Feb 2026), Ministry of Health and Family Welfare. Each AIIMS in this list was opened under the PMSSY scheme between 2012 and 2024 to bring tertiary medical care closer to under-served regions; running them at this faculty strength concentrates the staffing burden on AIIMS Delhi (which is also 34% vacant) and undercuts the policy's stated goal of distributed access.</div>
  </div>`;
}

// Who-is-asking MPs panel — geographic + party concentration.
export function mpsAskingPanel() {
  // Aggregate by state — JBM-style ranked bar chart of who's asking.
  const byState = {};
  for (const mp of LS_QUESTIONERS) {
    byState[mp.state] = (byState[mp.state] || 0) + mp.count;
  }
  const stateRanked = Object.entries(byState)
    .sort(([,a],[,b]) => b - a)
    .map(([state, count]) => ({ state, count }));
  const max = Math.max(...stateRanked.map(s => s.count));

  const stateRows = stateRanked.map(s => {
    // Mark non-southern, non-eastern states as "muted" to make the geographic
    // concentration visually obvious. The political claim: anti-caste,
    // Dravidian, and left-leaning states do this parliamentary work.
    const muted = !["Tamil Nadu","Kerala","West Bengal","Uttar Pradesh","Andhra Pradesh","Odisha","Karnataka","Bihar","Maharashtra"].includes(s.state);
    return `<div class="mp-state-row${muted ? ' muted' : ''}">
      <span class="mp-state-name">${escapeHTML(s.state)}</span>
      <div class="mp-state-bar" style="width: ${(s.count / max) * 100}%"></div>
      <span class="mp-state-count">${s.count}</span>
    </div>`;
  }).join("");

  // List of MPs as quiet supporting text below the chart
  const cards = LS_QUESTIONERS
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .map(mp => `<div class="mp-card">
      <span class="mp-name">${escapeHTML(mp.name)}${mp.count > 1 ? ` <span style="color:var(--muted); font-weight:500;">·${mp.count}×</span>` : ""}</span>
      <span class="mp-aff">${escapeHTML(mp.party)} <span class="mp-state">· ${escapeHTML(mp.state)}</span></span>
    </div>`).join("");

  return `<div class="viz-card">
    <div class="viz-hdr">The questions on Bahujan exclusion are asked by states with anti-caste political traditions. They come from no one else.</div>
    <div class="viz-sub">Number of parliamentary questions on faculty vacancies tabled, by the home state of the asking MP, Sep 2020 – Mar 2026.</div>
    <div class="mp-state-chart">${stateRows}</div>
    <div class="chart-source" style="margin-top:18px;"><strong>Source:</strong> Compiled from 546 Lok Sabha and Rajya Sabha Q&amp;As in this corpus. The pattern survives every alternative explanation tested: the questions are tabled overwhelmingly by Dravidian, left, and Bahujan-affiliated MPs from southern and eastern states. <strong>The ruling coalition has tabled essentially none.</strong></div>
    <details style="margin-top:18px;">
      <summary style="cursor:pointer; font-size:13px; font-weight:600; color:var(--accent);">Show all ${LS_QUESTIONERS.length} MPs</summary>
      <div class="mps-grid" style="margin-top:12px;">${cards}</div>
    </details>
  </div>`;
}

export async function renderVacancies() {
  const host = document.getElementById("vacancies-tab");
  if (!VACANCY_DATA) {
    try { VACANCY_DATA = await fetch("data/vacancy_snapshots.json").then(r => r.json()); }
    catch(e) { host.innerHTML = `<p style="color:var(--muted)">Vacancy data unavailable.</p>`; return; }
  }
  // Real snapshots (with totals data); separately, no-disclosure placeholders
  // that encode the ABSENCE of data as a finding. Both render below — the
  // placeholders make institutional silence visible in the timeline.
  const allSnaps = VACANCY_DATA.snapshots || [];
  const snaps = allSnaps.filter(s => s.totals && !s._no_data);
  const noDataSnaps = allSnaps.filter(s => s._no_data);
  const fmt = n => n == null ? "—" : n.toLocaleString("en-IN");
  const ewsInfo = 'title="GEN includes EWS (UR+EWS merged). Raw UR/EWS split preserved in _raw.by_category_optional."';
  const cats = ["GEN","SC","ST","OBC"];

  // Snapshots that actually carry category breakdowns — these drive the viz.
  const breakdownSnaps = snaps.filter(s => s.by_category?.GEN?.sanctioned != null);
  const cuSnap  = breakdownSnaps.find(s => s.institution_group === "all_central_universities");
  const iimSnap = breakdownSnaps.find(s => s.institution_group === "all_iims");

  // NYT/FT-style opener: hero number + tight pull, then a strip of 3 stats.
  let ledeHtml = `
    <div class="hero-stat">
      <div class="hs-kicker">Faculty hiring at India's centrally-funded HEIs · Sep 2020–Mar 2026</div>
      <span class="hs-num">31<span style="font-size:60px; vertical-align:top; line-height:1; margin-left:-4px;">%</span></span>
      <p class="hs-headline">Of every 100 faculty seats reserved for the Economically Weaker Sections under the Constitution, fewer than <em>thirty-one</em> have been filled. Scheduled Tribe seats: <em>sixty-five</em>. Persons with Disabilities: <em>not disclosed since March 2023</em>.</p>
      <p class="hs-context">Computed from the cumulative "Mission Mode" recruitment counter the Ministry of Education has been forced to publish — fragmentarily — under five and a half years of opposition pressure. The denominator is the statutory mandate.</p>
    </div>

    <div class="hero-stat-strip">
      <div class="hss-cell">
        <span class="hss-num">10,637+</span>
        <div class="hss-label">faculty positions standing vacant in centrally-funded HEIs (CU teaching + AIIMS network alone; IIT/IIM/NIT residuals withheld).</div>
        <div class="hss-source">AU1206 (Jul 2025); AS207 (Feb 2026)</div>
      </div>
      <div class="hss-cell">
        <span class="hss-num">1</span>
        <div class="hss-label">Member of Parliament — out of ~546 questions tabled by opposition over five years — to whom the Ministry disclosed rank-by-category faculty vacancy data: the Leader of Opposition, Rajya Sabha.</div>
        <div class="hss-source">RS AU365, 23 Jul 2025</div>
      </div>
      <div class="hss-cell">
        <span class="hss-num">${(() => {
          // Honest math: numerator is CFHEI-only (10,637 from CU + AIIMS
          // disclosures). Denominator must also be CFHEI-only to avoid
          // understating the disclosure regression. Private universities
          // (Ashoka, FLAME, APU, Krea, etc.) sit outside the CEI(RTC) Act
          // scope and aren't part of the parliamentary-record numerator;
          // counting them in the advertised denominator would dilute the
          // ratio. Filter by inst.type !== 'PrivateUniversity'.
          const cfheiTotal = (state.ADS || []).filter(a => {
            const inst = state.INSTITUTIONS[a.institution_id];
            return inst && inst.type !== 'PrivateUniversity';
          }).length;
          return cfheiTotal > 0 ? Math.round(10637 / cfheiTotal) + '×' : '—';
        })()}</span>
        <div class="hss-label">more known faculty vacancies than active recruitment advertisements visible across centrally-funded HEI career pages today (excludes private-university listings).</div>
        <div class="hss-source">scrape on ${new Date().toISOString().slice(0,10)}</div>
      </div>
    </div>

  `;
  // Original 2022 IIM lede preserved as a secondary observation if data is present.
  if (iimSnap) {
    const ineq = computeIneq(iimSnap);
    if (ineq) {
      // (kept silent; lede already set above)
      void ineq;
    }
  }
  const refusalMsg = (s) => {
    if (s.grain === "institution" && (s.notes||"").toLowerCase().includes("flexi")) return 'category-wise breakdown refused at the institution level (IITB: "flexible cadre system … sanctioned strength … is not fixed")';
    if (s.institution_group === "all_iits") return 'category-wise breakdown not disclosed (source footnote: "flexi cadre for faculty posts")';
    if (s.institution_group === "all_centrally_funded_heis") return 'category-wise breakdown not disclosed — minister substituted aggregate narrative for the annexure';
    return "category-wise breakdown not disclosed";
  };
  const catRow = (s, c) => (c && c.GEN && c.GEN.sanctioned !== null)
    ? cats.map(k => `<td>${fmt(c[k].sanctioned)}</td><td>${fmt(c[k].in_position)}</td><td>${fmt(c[k].vacant)}</td>`).join("")
    : `<td colspan="12" class="refused">${refusalMsg(s)}</td>`;
  host.innerHTML = `
    ${ledeHtml}

    <h2 style="font-family:var(--serif); font-size:30px; font-weight:700; color:var(--ink); padding-top:32px; margin:32px 0 8px; letter-spacing:-0.01em; max-width:780px; line-height:1.2;">The Constitution promised 63.5% of these faculty seats to Bahujan candidates. The seats sit vacant. The Ministry has stopped naming them by category.</h2>
    <p class="act-deck" style="font-size:15.5px; max-width:760px; line-height:1.55; margin:0 0 24px;">Five and a half years of parliamentary record show the Indian state doing <strong>seven specific things</strong> to its Bahujan PhD class. Each section below names one of them and shows the chart that proves it. Read straight through. Sources and methodology are at the end of the page.</p>
    <p class="act-disclaimer" style="font-size:12.5px; max-width:760px; line-height:1.55; margin:0 0 32px; padding:10px 12px; border-left:3px solid var(--border); color:var(--muted); font-style:italic; background:rgba(0,0,0,0.02);">
      <strong style="font-style:normal; color:var(--ink);">Scope and disclaimer.</strong>
      The analysis below is restricted to <strong style="font-style:normal;">centrally-funded higher-education institutions</strong> — Central Universities, IIMs, IITs, NITs, IIITs, and the AIIMS network — the institutions subject to the Constitution's reservation mandate under the CEI(RTC) Act, 2019. Private universities are not included in this analytical scope. Material here is the maintainer's research interpretation of publicly available parliamentary records, court orders, and Ministry communications, all cited in the bibliography. It is research-and-reference public-interest commentary, not legal advice and not an allegation against any individual.
    </p>

    ${chart0_volume()}

    ${charty_topics()}

    <div class="act-header"><span class="act-num">Point 1</span><h3 class="act-title">The state is making them, then refusing them.</h3></div>
    <p class="act-deck"><strong>The doctorate is a credential the state issues; the seat is a credential the state withholds.</strong> India produces ~25,550 PhDs a year — third-highest absolute output of any country. Mission Mode hires ~5,100 across all centrally-funded HEIs combined. Four of every five PhDs the system credentials get no faculty position in the system that credentialed them.</p>
    ${chart8_counterfactual()}

    <div class="act-header"><span class="act-num">Point 2</span><h3 class="act-title">It is keeping their seats officially "vacant" while adjuncts fill the gap.</h3></div>
    <p class="act-deck"><strong>Same syllabus. The seat that would have gone to a Bahujan candidate stays empty; the labour is supplied by someone whose hiring required no roster compliance.</strong> ~10,600 standing vacancies at central HEIs and AIIMS, mostly reserved by statute. Ad-hoc, guest, and contract appointments fill the teaching gap — and fall outside the reservation regime entirely. The vacancy line has stayed flat for fifteen months.</p>
    ${chart1_vacancyTimeline(allSnaps)}

    <div class="act-header"><span class="act-num">Point 3</span><h3 class="act-title">It is concealing the data that would make this legible.</h3></div>
    <p class="act-deck"><strong>The Ministry has the numbers. It chooses when to publish.</strong> Of 546 parliamentary questions across five years, fewer than 4% of answers — at peak — gave a category-wise breakdown. By 2025 it was below 1%. <strong>PwBD vacancy data has not been disclosed since March 2023.</strong> The 200-point roster under the CEI(RTC) Act, 2019 contains the data — its release is administrative discretion, not statutory compulsion.</p>
    ${chart5_disclosure_v2()}
    ${chartx_boilerplate()}

    <div class="act-header"><span class="act-num">Point 4</span><h3 class="act-title">It is calibrating disclosure to political leverage.</h3></div>
    <p class="act-deck"><strong>Disclosure is dispensed as political concession, not constitutional right.</strong> The work of asking falls almost entirely to opposition MPs from states with Dravidian, anti-caste, and left political traditions. The ruling coalition has tabled essentially zero of these questions over five years. Bahujan candidates without an MP at Kharge's level have no instrument to extract the data the Ministry holds.</p>
    ${chart6_whoIsAsking()}

    <div class="act-header"><span class="act-num">Point 5</span><h3 class="act-title">It is breaking the rank-promotion bridge.</h3></div>
    <p class="act-deck"><strong>The seats above them have been kept open instead of filled.</strong> The single document in this corpus that publishes faculty vacancy by rank <em>and</em> by category was given to one MP — Mallikarjun Kharge, Leader of Opposition, Rajya Sabha — on 23 July 2025. Refused to every other parliamentarian who asked. Read it. The largest unfilled bucket sits at the Associate Professor rank — the bridge between entry-level and seniority — meaning Bahujan candidates who do enter as Assistant Professors are not progressing through the cadre.</p>
    ${chart3_kharge(allSnaps)}

    <div class="act-header"><span class="act-num">Point 6</span><h3 class="act-title">It is letting reserved posts lapse, then converting them to "Unreserved."</h3></div>
    <p class="act-deck"><strong>Each lapsed post is a Bahujan candidate's seat permanently exited from the reserved roster.</strong> The discretionary brake is a four-word phrase: "no suitable candidate available." Reserved posts re-advertised in two cycles without filling become candidates for <em>de-reservation</em> — converted to Unreserved and captured by the General pool. The CEI(RTC) Act, 2019 nominally tightened this; institutional practice survives the statute.</p>
    <div class="jbm-card" style="border-left: 4px solid var(--alarm); background: rgba(200,16,46,0.04);">
      <h4 class="jbm-title" style="color: var(--alarm);">⚑ The chart that should be here, isn't</h4>
      <p class="jbm-deck">The institutional records that would let us count de-reserved posts year by year — selection-committee minutes, de-reservation requests forwarded to UGC, the post-by-post lapsing trail — <strong>are not published.</strong> The data exists, held inside the institutions. RS AU354 (3 Dec 2025) explicitly asked the Ministry for this disclosure and was answered with non-substantive narrative. <strong>The absence of a chart on this page is itself the political condition the page documents.</strong> An institution-by-institution RTI campaign would generate the missing data; the <a href="#resources" data-tab-link="resources" style="color:var(--accent); font-weight:600;">Resources tab</a> contains a template targeting this gap.</p>
      <div class="jbm-source"><strong>Sources:</strong> RS AU354 (3 Dec 2025); RS AU2425 (22 Mar 2023).</div>
    </div>

    <div class="act-header"><span class="act-num">Point 7</span><h3 class="act-title">It is laundering the lapsed seats through a "Mission Mode" counter.</h3></div>
    <p class="act-deck"><strong>The counter rises while the cadre composition stays what the savarna state needs it to be.</strong> When MPs ask how many vacancies remain, the Ministry answers with how many cumulative recruitments have been made since September 2022 — different number, different question, designed to look like an answer. The chart below is the only caste-disaggregated disclosure of Mission Mode fills in the entire 546-question parliamentary corpus. The Ministry was forced to publish it in March 2026, after the Supreme Court invoked Article 142. <strong>The General category over-realises by 44 percentage points. The seats that should have gone to Bahujan candidates didn't fail to be filled — they were redistributed.</strong></p>
    ${chart2_mandateVsReality(allSnaps)}

    <div class="act-header" style="margin-top:60px; border-bottom-color:var(--accent);"><span class="act-num" style="color:var(--accent);">The cost</span><h3 class="act-title">What this is doing to Indian higher education, and to India.</h3></div>
    <p class="act-deck">A faculty cadre held two-thirds full does not produce the research, the teaching, or the institutional capacity the Republic was promised. The cost is structural and visible at every scale: in the new AIIMS network running at half-strength, and in an R&amp;D-as-percentage-of-GDP figure that has been stuck at the world floor for two decades.</p>
    ${chart4_aiims(allSnaps)}
    ${chart7_rdGap()}

    <div style="margin: 56px 0 32px; padding: 32px 40px; background: rgba(200,16,46,0.04); border-left: 6px solid var(--alarm); border-radius: 0 8px 8px 0; max-width: 760px;">
      <h2 style="font-family: var(--serif); font-size: 24px; font-weight: 700; color: var(--ink); line-height: 1.3; margin: 0 0 14px; letter-spacing: -0.005em;">The verdict the data forces</h2>
      <p style="font-family: var(--serif); font-size: 17px; line-height: 1.6; color: var(--ink); margin: 0 0 12px;">Not a single failure but an architecture of failure. Legislation passed. Data gathered. Questions asked. Answers refused. Courts engaged. And through every instrument the cadre composition stays what the savarna state needs it to be.</p>
      <p style="font-family: var(--serif); font-size: 19px; line-height: 1.4; color: var(--alarm); font-weight: 700; margin: 14px 0 0; letter-spacing: -0.005em;">The Constitution is not being violated by accident. It is being administered to that effect.</p>
    </div>

    <details class="vacancies-appendix" style="margin-top:48px; padding-top:24px; border-top:2px solid var(--alarm);">
      <summary style="cursor:pointer; font-family:var(--serif); font-size:18px; font-weight:700; color:var(--ink); padding:12px 0; list-style:none;">Appendix: the rhetorical apparatus and the historical timeline <span style="color:var(--accent); font-size:13px; font-weight:500;">(click to expand)</span></summary>
      <div style="padding-top:18px;">

      <p class="act-deck" style="font-size:13.5px;">For the reader who wants every receipt: the historical timeline that situates the seven points above, and a prose breakdown of the three rhetorical instruments the Ministry uses to refuse disclosure.</p>

      <div class="jbm-card">
        <h4 class="jbm-title">A timeline: how Indian state elites switched off Bahujan disclosure</h4>
        <p class="jbm-deck">Five inflection points across eight years that turn the parliamentary record into a story of deliberate concealment.</p>
        <div class="jbm-chart">
          <ol style="font-family:var(--sans, 'Inter'); font-size:13.5px; line-height:1.6; color:var(--ink); padding-left:0; list-style:none; counter-reset: tlc;">
            <li style="position:relative; padding:10px 12px 10px 38px; border-left:3px solid var(--jbm-promise); background:rgba(31,58,138,0.04); margin-bottom:8px; counter-increment: tlc;"><span style="position:absolute; left:8px; top:10px; font-family:var(--mono); font-size:11px; color:var(--jbm-promise); font-weight:700;">1</span><strong>5 Mar 2018 — UGC's 13-point roster.</strong> Reservation roster shifts from <em>institution</em> to <em>department</em>. Several CUs report zero SC/ST vacancies as a result. Rolled back in July 2019 after protests, litigation, and parliamentary action.</li>
            <li style="position:relative; padding:10px 12px 10px 38px; border-left:3px solid var(--jbm-promise); background:rgba(31,58,138,0.04); margin-bottom:8px; counter-increment: tlc;"><span style="position:absolute; left:8px; top:10px; font-family:var(--mono); font-size:11px; color:var(--jbm-promise); font-weight:700;">2</span><strong>9 Jul 2019 — CEI(RTC) Act, 2019.</strong> Parliament makes the 200-point institutional roster statutory. SC 15%, ST 7.5%, OBC 27%, EWS 10% mandated for the faculty cadre.</li>
            <li style="position:relative; padding:10px 12px 10px 38px; border-left:3px solid var(--jbm-emph); background:rgba(200,16,46,0.05); margin-bottom:8px; counter-increment: tlc;"><span style="position:absolute; left:8px; top:10px; font-family:var(--mono); font-size:11px; color:var(--jbm-emph); font-weight:700;">3</span><strong>Sep 2022 — "Mission Mode" launches.</strong> The Ministry begins citing a cumulative-fills counter in answers to parliamentary questions. The counter measures recruitment activity, not vacancy. The substitution is the central rhetorical engine of every subsequent answer.</li>
            <li style="position:relative; padding:10px 12px 10px 38px; border-left:3px solid var(--jbm-emph); background:rgba(200,16,46,0.05); margin-bottom:8px; counter-increment: tlc;"><span style="position:absolute; left:8px; top:10px; font-family:var(--mono); font-size:11px; color:var(--jbm-emph); font-weight:700;">4</span><strong>Mar 2025 — Disclosure regression.</strong> The Ministry stops publishing the SC/ST/OBC breakdown of CU vacancies. Cumulative Mission Mode fills are offered as a substitute. PwBD vacancy data has not been disclosed since March 2023.</li>
            <li style="position:relative; padding:10px 12px 10px 38px; border-left:3px solid var(--jbm-emph); background:rgba(200,16,46,0.05); margin-bottom:8px; counter-increment: tlc;"><span style="position:absolute; left:8px; top:10px; font-family:var(--mono); font-size:11px; color:var(--jbm-emph); font-weight:700;">5</span><strong>15 Jan 2026 — Article 142 intervention.</strong> Supreme Court directs all HEIs to fill faculty vacancies within four months. The order is procedural — it does not name caste, does not compel category-wise compliance, and reaches the executive only after twelve months of opposition pressure had stalled the parliamentary route.</li>
          </ol>
        </div>
        <div class="jbm-source"><strong>Source:</strong> UGC circular, 5 Mar 2018; The Central Educational Institutions (Reservation in Teachers' Cadre) Act, 2019; Ministry of Education internal communications cited across the corpus; Supreme Court of India, Crim. Appeal 1425/2025.</div>
      </div>

      <div class="jbm-card">
        <h4 class="jbm-title">Three rhetorical instruments the Ministry uses to refuse disclosure</h4>
        <p class="jbm-deck">Reading the parliamentary record across five years, three patterns repeat — each one a specific evasion technique deployed against specific kinds of question.</p>
        <div class="jbm-chart">
          <div style="display:grid; gap:14px; font-family:var(--sans, 'Inter'); font-size:13.5px; line-height:1.55;">
            <div style="background:rgba(200,16,46,0.05); border-left:3px solid var(--jbm-emph); padding:14px 16px;"><strong style="display:block; margin-bottom:4px; font-size:14px;">1. The Mission Mode substitution</strong>When asked how many vacancies remain, answer with how many appointments have been made. Vacancy is the standing inventory; Mission Mode fill is cumulative recruitment activity since September 2022. Conflating them lets the Ministry claim accountability while concealing the gap. In one answer (LS AU45, July 2025), the cumulative count is inflated by adding Kendriya Vidyalaya school-teacher recruitments to the higher-ed total. Different statute, different cadre, but a bigger number.</div>
            <div style="background:rgba(200,16,46,0.05); border-left:3px solid var(--jbm-emph); padding:14px 16px;"><strong style="display:block; margin-bottom:4px; font-size:14px;">2. The autonomy doctrine</strong>An identical paragraph appears in seven of the corpus's Higher Education answers: <em>"Central Higher Education Institutions … are statutory autonomous organisations … faculty recruitment is done within the institutions itself … no active role of the Ministry is involved therein."</em> When reservation goes wrong, hide behind autonomy; when Mission Mode goes well, take credit. Both postures are deployed simultaneously because each serves a distinct rhetorical purpose.</div>
            <div style="background:rgba(200,16,46,0.05); border-left:3px solid var(--jbm-emph); padding:14px 16px;"><strong style="display:block; margin-bottom:4px; font-size:14px;">3. The flexi-cadre evasion (IIT-specific)</strong>Even after the CEI(RTC) Act 2019 made the institutional 200-point roster statutory, IITs invoke a "Flexi Cadre System" — most explicitly in LS AU3814 (Mar 2026) — to refuse rank-and-category disclosure. The doctrine pre-dates the Act and survives it; the same answer can cite both the statute and the workaround in adjacent paragraphs without acknowledging the contradiction.</div>
          </div>
        </div>
        <div class="jbm-source"><strong>Source:</strong> LS AU1111, AU45, AU414, AU1476, AU3742, AU5040, AU5842 — autonomy boilerplate verbatim. LS AU3814 — flexi-cadre invocation. LS AU45 — KV count inflation.</div>
      </div>

      </div>
    </details>
  `;

  // ---- Bibliography: collect every inline .chart-source / .jbm-source /
  // hero-strip .hss-source after the innerHTML pass, deduplicate by HTML
  // content, and append a single "Sources & methodology" section at the end
  // of the tab. The inline elements remain in the DOM (CSS hides them); this
  // way the bibliography auto-updates when a new chart with a new source is
  // added — there's no second list to keep in sync.
  const sourceEls = host.querySelectorAll(".chart-source, .jbm-source, .hero-stat-strip .hss-source");
  const seen = new Set();
  const items = [];
  for (const el of sourceEls) {
    let html = el.innerHTML.trim();
    // Strip the leading "<strong>Source:</strong> " / "Sources:" prefix
    // since the bibliography is itself "Sources" — the prefix is redundant.
    html = html.replace(/^<strong>Sources?:<\/strong>\s*/i, "").replace(/^Sources?:\s*/i, "");
    if (!html || seen.has(html)) continue;
    seen.add(html);
    items.push(`<li>${html}</li>`);
  }
  if (items.length) {
    const bib = document.createElement("section");
    bib.className = "gap-bibliography";
    bib.id = "gap-sources";
    bib.innerHTML = `
      <h2>Sources &amp; methodology</h2>
      <p class="bib-method">
        <strong>Corpus:</strong> 546 Lok Sabha and Rajya Sabha questions on
        faculty vacancy in centrally-funded HEIs, Sep 2020 – Mar 2026.
        Systematically crawled from elibrary.sansad.in (Lok Sabha; DSpace API)
        and rsdoc.nic.in (Rajya Sabha) and filtered by Education-ministry tag
        and topical keyword. 213 LS + 333 RS = 546 unique answers in the
        analytical window.
      </p>
      <ol>${items.join("")}</ol>
    `;
    host.appendChild(bib);
  }
}

// ---------- resources tab ----------
// Curated, externally-maintained directory of resources for faculty
// candidates — particularly Bahujan candidates navigating reservation,
// document requirements, and institutional accountability. All links
// are external (third-party); the dashboard does not endorse or vet
// content beyond initial curation. Updates: edit RESOURCES below.

// Ready-to-paste RTI request templates. Each is a real, comprehensive
// RTI under Section 6 of the Right to Information Act, 2005. Targeted
// at the Public Information Officer (PIO) of the relevant institution.
// Placeholders in [SQUARE BRACKETS] should be replaced before sending.
//
// These templates exist because the parliamentary route has narrowed
// (Feb 2023 was the last useful aggregate; Dec 2024 was answered with
// no numbers; no 2025 disclosure exists). When the government won't
// publish, citizens generate the data through individual RTIs — the
// dashboard provides the infrastructure to do that at scale.
export const RTI_TEMPLATES = [
  {
    title: "Current faculty vacancy data — by rank, category, department",
    scenario: "When you want to know an institution's current sanctioned / filled / vacant breakdown, including roster category. The Feb 2023 LS aggregate is the last public figure; an RTI is now the only way to get current numbers.",
    target: "Public Information Officer (PIO), [Institution Name]",
    body: `Under Section 6 of the Right to Information Act, 2005, please provide the following information regarding faculty positions at [Institution Name], as on [Date]:

1. Total sanctioned faculty strength, broken down by:
   a) Rank (Assistant Professor / Associate Professor / Professor / Professor of Practice / other)
   b) Reservation category (UR / SC / ST / OBC / EWS / PwBD)
   c) Department / academic unit / school

2. Number of in-position faculty, broken down by the same three dimensions as above.

3. Number of vacant posts, broken down by the same three dimensions.

4. For each currently vacant SC / ST / OBC / EWS / PwBD reserved post:
   a) The roster point number it occupies (per the 200-point roster maintained under the CEI(RTC) Act, 2019)
   b) The number of recruitment cycles it has been advertised in
   c) The date(s) of those advertisements
   d) Whether the post has been the subject of any de-reservation request

5. Number of faculty posts de-reserved (converted from reserved to UR) in the past five years, with date and reason for each de-reservation.

Please provide the information in machine-readable format (PDF, XLS, or CSV) where the data permits. I am willing to pay the prescribed fee.

Yours sincerely,
[Your Name]
[Your Address]
[Your contact details]`,
  },
  {
    title: "200-point reservation roster status",
    scenario: "Direct accountability for the roster instrument itself. Especially useful when you suspect roster manipulation, untracked de-reservation, or non-compliance with the institutional 200-point unit established by the CEI(RTC) Act, 2019.",
    target: "Public Information Officer (PIO), [Institution Name]",
    body: `Under Section 6 of the Right to Information Act, 2005, please provide the institution's current 200-point reservation roster for the faculty cadre, as maintained under the Central Educational Institutions (Reservation in Teachers' Cadre) Act, 2019.

For each roster point (1 to 200), please indicate:

1. The category designation (UR / SC / ST / OBC / EWS / PwBD).
2. The current status (filled / vacant / pending recruitment / de-reserved).
3. For filled posts: the date of appointment, the rank of the appointee, and the academic unit.
4. For vacant posts: the date the post fell vacant and the date(s) of subsequent recruitment advertisements (if any).
5. For de-reserved posts: the date of de-reservation, the original category, the new category, the cycles in which the post was advertised before de-reservation, and the authority that approved the de-reservation.

Please also provide the institution's roster maintenance procedure, the name and designation of the officer responsible for the roster, and the date the roster was last formally audited.

I am willing to pay the prescribed fee.

Yours sincerely,
[Your Name]
[Your Address]
[Your contact details]`,
  },
  {
    title: "PwBD (disability) reservation compliance",
    scenario: "Targets the 4% mandate under the Rights of Persons with Disabilities Act, 2016. Most institutions are non-compliant; an RTI surfaces the actual numbers and forces a record.",
    target: "Public Information Officer (PIO), [Institution Name]",
    body: `Under Section 6 of the Right to Information Act, 2005, please provide the following information regarding compliance with Section 34 of the Rights of Persons with Disabilities Act, 2016 (4% reservation for Persons with Benchmark Disabilities) at [Institution Name], as on [Date]:

1. Total sanctioned faculty strength.
2. The number of PwBD reserved posts (4% of sanctioned strength), in absolute terms, broken down by the five PwBD sub-categories listed in Section 34(1) of the Act.
3. Number of PwBD faculty currently in position, broken down by sub-category.
4. Number of vacant PwBD reserved posts, broken down by sub-category and by department / academic unit.
5. For each vacant PwBD post: the number of recruitment cycles it has been advertised in, the date(s) of those advertisements, and the reason recorded for non-filling in each cycle.
6. The list of posts that have been "identified" as suitable for PwBD candidates under Section 33 of the Act, by department, and the date(s) of identification.
7. The total number of PwBD candidates who applied to faculty positions in the past three years, the number shortlisted, and the number selected — broken down by year and by sub-category.

Please provide supporting documents where the data is contested.

I am willing to pay the prescribed fee.

Yours sincerely,
[Your Name]
[Your Address]
[Your contact details]`,
  },
  {
    title: "Per-advertisement category breakdown",
    scenario: "When you see a composite faculty advertisement that cites the statutory percentages but does not publish per-post category counts (the dominant pattern at IITs and several IIITs). RTI forces the institution to disclose the roster math behind the recruitment.",
    target: "Public Information Officer (PIO), [Institution Name]",
    body: `Under Section 6 of the Right to Information Act, 2005, with reference to the institution's faculty recruitment advertisement [Advertisement Number / Date / URL], please provide the following information:

1. The total number of posts being advertised under this advertisement, broken down by:
   a) Reservation category (UR / SC / ST / OBC / EWS / PwBD)
   b) Rank (Assistant Professor / Associate Professor / Professor / other)
   c) Department / academic unit

2. The 200-point roster points being filled by this advertisement, listed individually with category designation for each.

3. Whether any posts in this advertisement carry the residue of de-reservation in earlier cycles, and if so, which posts and the dates of the earlier de-reservation events.

4. The total number of applications received for this advertisement, the number shortlisted, and the number recommended for appointment — each broken down by reservation category — at the time of this RTI's filing.

5. For each reserved category in which fewer recommendations have been made than the number of posts advertised: the explanation recorded by the selection committee.

I am willing to pay the prescribed fee.

Yours sincerely,
[Your Name]
[Your Address]
[Your contact details]`,
  },
];

// Postdoctoral fellowships abroad. Kept as a separate constant from
// RESOURCES_BLOCKS because the rendering is different (sub-grouped, with a
// long political introduction) and the editorial weight is different — this
// is the page's strategic recommendation, not a list of links.
//
// The intro deliberately refuses to romanticise the move abroad as an
// escape from caste. The Cisco caste-discrimination case (Doe v. Cisco
// Systems, California Civil Rights Dept., 2020), California's SB 403 (2023),
// and the addition of caste as a protected category at Brandeis, Cal State,
// and Brown are evidence of caste reproducing inside US academic and tech
// labour markets, not its absence (Bhattacharya 2024; Soundararajan 2022).
// "Pedigree-from-elite-Indian-undergrad" preferences in US R1 hiring
// (Subramanian 2019) are the same merit-as-caste filter operating one
// tier up. The strategic case for applying is real; the political case
// is mixed — the page presents both.
export const POSTDOC_ABROAD = {
  title: "Postdoctoral fellowships abroad",
  cls: "postdoc-block",
  intro: `
    <p>These programs sit outside the Indian state's reservation regime — and outside its administered failure to implement it. They cannot replace structural reform of central HEI hiring, but for a Bahujan PhD facing the Indian academic job market documented in the <a href="#vacancies" data-tab-link="vacancies" style="color:var(--accent); font-weight:600;">Vacancies tab</a> — 10,637 known vacancies processed into 335 advertised positions over five years — the pragmatic move is to build the international record that lets you set your terms when you return, or stay abroad on those terms.</p>
    <p><em>Be clear-eyed.</em> These programs have their own pedigree filters. The "PhD-from-top-Indian-institution" preference is the same elite-undergraduate gatekeeping operating one tier up (Subramanian 2019). Recommendation letters are the chokepoint, and the savarna network that controls letter-writing in India travels with the candidate. The diaspora South Asian studies field has its own caste hierarchy: the Cisco caste-discrimination case (2020), California's SB 403 (2023), and the addition of caste as a protected category at Brandeis, Brown, and the Cal State system are evidence of caste reproducing inside US academic labour markets, not its absence (Bhattacharya 2024; Soundararajan 2022).</p>
    <p>Apply widely. Most of these are fully funded for two to three years. Several explicitly support scholars from underrepresented backgrounds — find that language in the call and cite it in your statement. Deadlines below; verify on the program's own page before submitting.</p>`,
  subgroups: [
    {
      title: "Society of Fellows / humanities & SSH postdocs (US)",
      items: [
        { name: "Harvard Society of Fellows (Junior Fellows)", url: "https://socfell.fas.harvard.edu/", note: "3-year, no teaching obligation, all disciplines including SSH and lab sciences. Letters-of-recommendation-driven; pedigree-sensitive.", region: "North America", elig: { status: "open", label: "Indian PhDs eligible" } },
        { name: "Princeton Society of Fellows in the Liberal Arts", url: "https://sf.princeton.edu/", note: "3-year, light teaching, humanities and humanistic social sciences. Reads applicants in cohorts; statement of purpose carries unusual weight.", region: "North America", elig: { status: "open", label: "Indian PhDs eligible" } },
        { name: "Columbia Society of Fellows in the Humanities", url: "https://societyoffellows.columbia.edu/", note: "3-year, teach one course/semester in the Core Curriculum, generous research budget. Humanities-focused; SSH at the qualitative end fits.", region: "North America", elig: { status: "open", label: "Indian PhDs eligible" } },
        { name: "Michigan Society of Fellows", url: "https://societyoffellows.umich.edu/", note: "3-year, half-time teaching, all disciplines. Has historically had stronger non-elite-pedigree intake than HSP/Princeton.", region: "North America", elig: { status: "open", label: "Indian PhDs eligible" } },
        { name: "Chicago Society of Fellows / Harper-Schmidt (Collegiate Asst Profs)", url: "https://socsci.uchicago.edu/society-fellows", note: "4-year, teach in the Core. Slightly different model — full-time teaching faculty position with research time, not a pure postdoc.", region: "North America", elig: { status: "open", label: "Indian PhDs eligible" } },
        { name: "Cornell Klarman Postdoctoral Fellowship", url: "https://klarmanfellows.cornell.edu/", note: "3-year, no teaching obligation, all disciplines within Arts & Sciences. Generous research budget and salary; structurally comparable to Harvard SoF in prestige and intent. Open to all citizenships — Indian PhDs from Indian universities are explicitly eligible. Distinct from the Society for the Humanities (themed, 1-year) and the Provost Postdoc (diversity track) — Klarman is the open-disciplinary research-only line.", region: "North America", elig: { status: "open", label: "Indian PhDs eligible" } },
        { name: "Cornell Society for the Humanities", url: "https://societyhumanities.cornell.edu/", note: "1-year focus-themed fellowship; the annual theme determines the cohort. Lighter commitment, useful as a bridge year.", region: "North America", elig: { status: "open", label: "Indian PhDs eligible" } },
        { name: "Penn Wolf Humanities Center Postdoctoral Fellows", url: "https://wolfhumanities.upenn.edu/postdoctoral-fellowships", note: "1-year theme-based humanities fellowship at Penn. Smaller cohort, themed (recent: 'Migration', 'Choice', 'Breath').", region: "North America", elig: { status: "open", label: "Indian PhDs eligible" } },
        { name: "Dartmouth Society of Fellows", url: "https://societyoffellows.dartmouth.edu/", note: "3-year, mixed teaching/research, all disciplines. Less pedigree-locked than Ivy SoFs in published cohort histories.", region: "North America", elig: { status: "open", label: "Indian PhDs eligible" } },
        { name: "Stanford Humanities Center fellowships", url: "https://shc.stanford.edu/", note: "External-faculty plus residential postdoc tracks. The Mellon Fellowship of Scholars in the Humanities is the relevant postdoc line.", region: "North America", elig: { status: "open", label: "Indian PhDs eligible" } },
        { name: "USC Society of Fellows in the Humanities (Dornsife)", url: "https://dornsife.usc.edu/society-of-fellows/", note: "USC Dornsife runs an annual Society of Fellows for early-career humanities and humanistic-SSH scholars — 3-year, light teaching, open-disciplinary. Recurring annual call. The USC Provost's Postdoctoral Scholar programme is a separate, larger scheme also worth tracking.", region: "North America", elig: { status: "open", label: "Indian PhDs eligible — verify per call" } },
        { name: "UVA — Institute of the Humanities & Global Cultures (IHGC) Postdoctoral Fellowship", url: "https://ihgc.as.virginia.edu/", note: "University of Virginia's flagship humanities postdoc — 2-year, light teaching, with an annual research theme. Open to all citizenships. UVA also runs Praxis (digital humanities) and Mellon Humanities Fellows lines through different units.", region: "North America", elig: { status: "open", label: "Indian PhDs eligible" } },
      ],
    },
    {
      title: "Presidential / Provost diversity postdoctoral programmes (US)",
      items: [
        { name: "UC President's Postdoctoral Fellowship Program (PPFP)", url: "https://ppfp.ucop.edu/", note: "System-wide UC programme (Berkeley, UCLA, UCSD, UCSF, Davis, Irvine, Riverside, Santa Barbara, Santa Cruz, Merced). 2-year, salary + research budget, with a hiring incentive that subsidises tenure-track conversion at any UC campus. Eligibility is the binding constraint: applicants must be US citizens, US nationals, US permanent residents, or DACA recipients — Indian PhDs without one of these statuses cannot apply. Worth tracking only if your immigration trajectory may include US PR.", region: "North America", elig: { status: "restricted", label: "Restricted: US citizens/PR/DACA only" } },
        { name: "Michigan Presidential Postdoctoral Fellowship Program", url: "https://provost.umich.edu/programs/ppfp/", note: "2-year fellowship at U-Michigan modelled on UC PPFP. Same-shape eligibility constraint historically — US citizen/national/PR required. Verify per current call; rules occasionally shift but the citizenship gate has been stable.", region: "North America", elig: { status: "restricted", label: "Restricted: US citizens/PR usually required" } },
        { name: "Penn Presidential Postdoctoral Fellowship", url: "https://provost.upenn.edu/postdoctoral-fellowships", note: "Penn-wide programme launched in the early 2020s, two-year. Unlike UC/Michigan, Penn's Presidential programme has been open to international applicants in recent calls — but the call language varies year to year. Verify the current eligibility statement before drafting.", region: "North America", elig: { status: "caveat", label: "Open in recent calls — verify each year" } },
        { name: "Cornell Provost Postdoctoral Fellowship", url: "https://academicintegration.cornell.edu/postdoctoral-fellowship-programs/", note: "Cornell's diversity-oriented postdoc track (distinct from the Society for the Humanities, listed above). Generally open to international applicants; cohort histories include scholars with PhDs from India and elsewhere. Verify per call.", region: "North America", elig: { status: "caveat", label: "Open — verify per call" } },
        { name: "UNC Carolina Postdoctoral Program for Faculty Diversity", url: "https://research.unc.edu/cppfd/", note: "2-year postdoc at UNC Chapel Hill with explicit diversity mandate, tenure-track-conversion pathway. Open to international scholars in the standard call. Strong cohort culture; the programme has produced a substantial pipeline of tenured faculty across the US South.", region: "North America", elig: { status: "open", label: "Indian PhDs eligible" } },
        { name: "Ohio State Presidential Postdoctoral Scholars Program", url: "https://gradsch.osu.edu/postdoc/postdoctoral-funding/presidential-postdoctoral-scholars-program", note: "OSU 3-year programme with explicit international-applicant eligibility. Full salary plus research budget. Less prestige-locked than Ivy SoFs; broad disciplinary intake.", region: "North America", elig: { status: "open", label: "Indian PhDs eligible" } },
        { name: "Boston University Postdoctoral Diversity & Innovation Scholars", url: "https://www.bu.edu/provost/postdoc/", note: "BU's diversity-postdoc programme; eligibility has been open to international applicants in recent calls. Verify current call language.", region: "North America", elig: { status: "caveat", label: "Open in recent calls — verify" } },
        { name: "Big Ten Academic Alliance — Diversity Postdoc / consortium", url: "https://www.btaa.org/", note: "The Big Ten universities (Michigan, Wisconsin, Northwestern, Penn State, Ohio State, etc.) coordinate postdoc-to-faculty pipelines through the BTAA. Several individual campuses run diversity postdocs; eligibility varies per campus, with most US-citizen-restricted but some open. Treat as a meta-link to investigate per campus.", region: "North America", elig: { status: "varies", label: "Varies per campus" } },
      ],
    },
    {
      title: "Area-studies postdocs — South Asia–relevant",
      items: [
        { name: "CASI — Center for the Advanced Study of India (UPenn)", url: "https://casi.sas.upenn.edu/", note: "Penn's South Asia centre. Postdoctoral fellows; Kapur and Mehta have run substantive critique programmes here. Apply if your work is on contemporary India political economy or social policy.", region: "North America", elig: { status: "open", label: "Indian PhDs eligible" } },
        { name: "Harvard Mittal South Asia Institute", url: "https://mittalsouthasiainstitute.harvard.edu/", note: "Postdoc programmes vary year to year; check the Fellowships page. Strong on contemporary India, public-policy adjacent.", region: "North America", elig: { status: "open", label: "Indian PhDs eligible" } },
        { name: "Harvard Academy for International and Area Studies", url: "https://academy.wcfia.harvard.edu/", note: "2-year postdoc, area-studies and international affairs. Politics, IR, sociology, anthro of non-US regions including South Asia.", region: "North America", elig: { status: "open", label: "Indian PhDs eligible" } },
        { name: "Yale South Asian Studies Council postdoctoral associate", url: "https://southasia.macmillan.yale.edu/", note: "Annual postdoc; competition usually announced late autumn. Yale's Whitney Humanities and the Edward J. and Dorothy Clarke Kempf Memorial Fund also support South Asia work.", region: "North America", elig: { status: "open", label: "Indian PhDs eligible" } },
        { name: "Princeton — PIIRS, South Asian Studies, Niehaus", url: "https://piirs.princeton.edu/", note: "PIIRS Postdoctoral Research Associate position runs annually, area- and theme-specific. Check the South Asian Studies Program and the Liechtenstein Institute on Self-Determination as well.", region: "North America", elig: { status: "open", label: "Indian PhDs eligible" } },
        { name: "Princeton — Niehaus Center for Globalization & Governance", url: "https://niehaus.princeton.edu/", note: "Postdoctoral research associate in international political economy / globalisation governance. Highly competitive but explicit interest in non-US scholars.", region: "North America", elig: { status: "open", label: "Indian PhDs eligible" } },
        { name: "Brown India Initiative / Watson Institute", url: "https://watson.brown.edu/southasia/", note: "Postdoctoral fellow in Contemporary South Asia at the Watson Institute; SSH-leaning, policy-adjacent. The India Initiative has run focused India-research postdocs.", region: "North America", elig: { status: "open", label: "Indian PhDs eligible" } },
        { name: "Chicago — Committee on Southern Asian Studies (COSAS)", url: "https://southasia.uchicago.edu/", note: "South Asia language and area training centre. Postdoctoral teaching fellowships in South Asian languages and area studies are advertised through COSAS and the Humanities Division.", region: "North America", elig: { status: "open", label: "Indian PhDs eligible" } },
        { name: "Columbia South Asia Institute", url: "https://southasia.columbia.edu/", note: "Postdoc and visiting-scholar programmes through SAI; check also the Saltzman Institute of War & Peace and the Institute for Comparative Literature & Society for crossover positions.", region: "North America", elig: { status: "open", label: "Indian PhDs eligible" } },
        { name: "NYU — fellowships directory (anthropology, SSH-wide)", url: "https://as.nyu.edu/departments/anthropology/graduate/fellowship-directory/postdoctoral-fellowships.html", note: "NYU Anthropology's curated catalogue of postdoctoral fellowships across programmes globally. Useful as an aggregator beyond what's listed here.", region: "Multi", elig: { status: "varies", label: "Aggregator — varies per program" } },
      ],
    },
    {
      title: "Government & national programmes",
      items: [
        { name: "SSHRC Postdoctoral Fellowships (Canada)", url: "https://www.sshrc-crsh.gc.ca/funding-financement/programs-programmes/postdoctoral-postdoctorale-eng.aspx", note: "C$45,000/year for 2 years; SSH-specific. Eligibility is restrictive: applicant must be a Canadian citizen or permanent resident, OR a foreign national with a PhD from a Canadian institution. An Indian PhD from an Indian university is NOT directly eligible — verify each call as rules occasionally shift. If you don't have a Canadian connection, apply for Banting (below) or Marie Curie instead.", region: "North America", elig: { status: "restricted", label: "Restricted: Canadian PhD or PR/citizenship usually required" } },
        { name: "Banting Postdoctoral Fellowships (Canada)", url: "https://banting.fellowships-bourses.gc.ca/en/home-accueil.html", note: "C$70,000/year for 2 years; the prestige tier of Canadian postdocs. Open to all citizenships including Indian. Fewer slots, very competitive; must be nominated through a host Canadian institution — line up the host before the call.", region: "North America", elig: { status: "caveat", label: "Open — host nomination required" } },
        { name: "JSPS Postdoctoral Fellowship — Standard (Japan)", url: "https://www.jsps.go.jp/english/e-ipd/", note: "12–24 months in Japan with full stipend, travel, settling-in allowance. Explicitly open to non-Japanese researchers. Requires a Japanese host researcher — typically arranged via a prior visit or co-author connection.", region: "Asia & Oceania", elig: { status: "caveat", label: "Open — Japanese host required" } },
        { name: "JSPS Pathway / Postdoctoral Fellowship for Research in Japan (Short-term & Pathway)", url: "https://www.jsps.go.jp/english/e-fellow_pathway/", note: "Short-term (1–12 months) and Pathway (long-term, with multi-year extensions) variants of the JSPS scheme. Useful as a first step if you don't yet have a Japanese host — the short-term opens doors that the standard programme requires you to have already opened.", region: "Asia & Oceania", elig: { status: "caveat", label: "Open — Japanese host required" } },
        { name: "Marie Skłodowska-Curie Postdoctoral Fellowships (EU)", url: "https://marie-sklodowska-curie-actions.ec.europa.eu/actions/postdoctoral-fellowships", note: "European Postdoctoral Fellowships (12–24 months) and Global Fellowships (24–36 months, with outgoing phase). All nationalities eligible including Indian. Mobility rule: applicant must NOT have resided or carried out main activity in the host EU country for more than 12 months in the 36 months immediately before the call deadline.", region: "Europe & UK", elig: { status: "caveat", label: "Open — EU mobility rule applies" } },
        { name: "Newton International Fellowships (UK)", url: "https://royalsociety.org/grants/newton-international-fellowships/", note: "2-year UK postdoc explicitly designed for non-UK citizens working outside the UK. Jointly administered by the Royal Society, British Academy, and Royal Academy of Engineering — SSH applicants enter through the British Academy stream. India is on the eligible-country list.", region: "Europe & UK", elig: { status: "open", label: "Indian PhDs eligible — designed for non-UK applicants" } },
        { name: "British Academy Postdoctoral Fellowships", url: "https://www.thebritishacademy.ac.uk/funding/postdoctoral-fellowships/", note: "3-year SSH postdoc at a UK institution. The standard scheme requires the applicant to be ordinarily resident in the UK or to have a UK PhD; an Indian PhD from an Indian university is not directly eligible through this scheme. Apply via Newton International (above) instead, which the British Academy administers for non-UK PhDs.", region: "Europe & UK", elig: { status: "restricted", label: "Restricted: UK residence/PhD required — use Newton International instead" } },
        { name: "Humboldt Research Fellowship (Germany)", url: "https://www.humboldt-foundation.de/en/apply/sponsorship-programmes/humboldt-research-fellowship", note: "6–24 months at a German host institution; rolling deadlines, all disciplines. Explicitly open to non-German researchers including from the Global South — the foundation has a long-standing programme line for South Asian scholars. Requires a German host who agrees to support the application.", region: "Europe & UK", elig: { status: "open", label: "Indian PhDs eligible — German host required" } },
        { name: "DAAD postdoctoral programmes (Germany)", url: "https://www.daad.de/en/study-and-research-in-germany/scholarships/", note: "Multiple postdoc tracks; many have country-specific allocations for India. The PRIME programme (re-integration after a stay abroad) is for German PhDs only — Indian PhDs should look at the DAAD Research Stays for University Academics and Scientists, or the bilateral India-Germany calls.", region: "Europe & UK", elig: { status: "caveat", label: "Open — verify per programme line" } },
        { name: "ARC DECRA — Discovery Early Career Researcher Award (Australia)", url: "https://www.arc.gov.au/funding-research/funding-schemes/discovery-program/discovery-early-career-researcher-award-decra", note: "3-year fellowship at an Australian university for researchers within 5 years of PhD (career-interruption provisions apply). Formally open to all citizenships, but the application is submitted by the host Australian institution — finding a willing Australian host is the binding constraint. Australian universities also run their own internal early-career postdoc lines (see Universities & institutes block below).", region: "Asia & Oceania", elig: { status: "caveat", label: "Open — Australian host institution required; ≤5 yr post-PhD" } },
        { name: "EUI Max Weber Programme (European University Institute, Florence)", url: "https://www.eui.eu/programmes-and-fellowships/max-weber-programme", note: "Annual flagship 1-2 year postdoc at the EUI in Florence; SSH-only, open to scholars within 5 years of PhD. Explicitly international intake — open to Indian PhDs without residency or nationality restriction. Cohort-based: ~50 fellows per year across history, political science, sociology, economics, law. Applications open early autumn for the following academic year.", region: "Europe & UK", elig: { status: "open", label: "Indian PhDs eligible — recurs annually" } },
      ],
    },
    {
      title: "Universities & institutes outside the US",
      items: [
        { name: "UBC Killam Postdoctoral Research Fellowship (Canada)", url: "https://www.grad.ubc.ca/awards/killam-postdoctoral-research-fellowship", note: "2-year fellowship at the University of British Columbia, all disciplines. Funded by the Killam Trusts. Open to all citizenships; Indian PhDs are eligible without prior Canadian connection. Requires a UBC faculty sponsor — contact a department-relevant supervisor early. Concordia and Dalhousie also administer Killam-branded postdoctoral awards (smaller scale).", region: "North America", elig: { status: "caveat", label: "Open — UBC faculty sponsor required" } },
        { name: "UofT Provost's Postdoctoral Fellowship Program (Canada)", url: "https://www.sgs.utoronto.ca/awards/provosts-postdoctoral-fellowship-program/", note: "University of Toronto-wide programme launched in the late 2010s. UofT has multiple Provost-branded postdoc lines — the most prominent recent expansion has been the Provost's Postdoctoral Fellowship for Indigenous and Black Researchers, restricted to those groups. UofT also runs broader-eligibility postdocs through the School of Graduate Studies — verify which specific call applies before drafting.", region: "North America", elig: { status: "varies", label: "Varies — multiple lines, verify which call" } },
        { name: "UofT Connaught Postdoctoral lines (Canada)", url: "https://research.utoronto.ca/funding-awards/connaught-fund", note: "The Connaught Fund supports several postdoctoral lines at UofT — some explicitly restricted (e.g., for Black researchers), others open-disciplinary. Departments also host Connaught-funded postdocs independently; contact target departments directly.", region: "North America", elig: { status: "varies", label: "Varies per Connaught line" } },
        { name: "Shuimu Tsinghua Scholar Program (Tsinghua, China)", url: "https://postdoc.tsinghua.edu.cn/", note: "Tsinghua University's flagship postdoc programme; 2-year (renewable to 3), competitive stipend (~RMB 300,000+/year plus housing subsidy), formally open to all citizenships. The binding constraint is geopolitical: post-2020 Indian government regulations on China-bound academic exchange, prior-clearance requirements for Indian researchers visiting Chinese institutions, and visa friction in both directions are real and have intensified since Galwan. Verify current MEA/UGC guidance and your home institution's stance before applying. Tsinghua's Institute for Advanced Study (IAS) runs a separate, smaller postdoc line oriented to theoretical sciences.", region: "Asia & Oceania", elig: { status: "caveat", label: "Open — verify India–China academic exchange restrictions" } },
        { name: "Max Planck Society — postdoctoral positions across institutes (Germany)", url: "https://www.mpg.de/en/jobs", note: "Max Planck institutes (~85 across Germany covering humanities, SSH, life sciences, etc.) hire postdocs continuously through individual institute calls rather than a single Max Planck postdoc programme. The MPI for Social Anthropology (Halle), MPI for the Study of Religious and Ethnic Diversity (Göttingen), MPI for Comparative Public Law and International Law (Heidelberg), and MPI for the History of Science (Berlin) are particularly relevant for SSH applicants from India. Open to all citizenships; salaries generally follow German civil-service E13 scale.", region: "Europe & UK", elig: { status: "open", label: "Indian PhDs eligible — varies per institute" } },
        { name: "Sciences Po — research centre postdocs (France)", url: "https://www.sciencespo.fr/recherche/", note: "Sciences Po hosts postdocs through its research centres rather than as a single university-wide programme: CERI (international relations), OSC (sociology), MAXPO (max planck partnership for political economy), CEE (European studies), CSO (organisations). Most positions are project-funded and posted on the institution's research-jobs page. Open to international applicants; English working language for many positions.", region: "Europe & UK", elig: { status: "varies", label: "Varies per centre/project" } },
        { name: "EHESS — postdoctoral positions through research centres (France)", url: "https://www.ehess.fr/en", note: "EHESS hosts postdocs through individual research centres and EU-funded projects rather than a unified institutional programme. CESAH (South Asia centre) and CEIAS are particularly relevant for India researchers. French-language ability helpful but English-only positions exist; search via centre.", region: "Europe & UK", elig: { status: "varies", label: "Varies per centre/project" } },
        { name: "KU Leuven Postdoctoral Mandate (PDM) — Belgium", url: "https://www.kuleuven.be/research/researcher/postdoc/index.html", note: "KU Leuven's institutionally-funded postdoc programme; 2 × 1-year cycles, competitive, open to international PhDs. Several FWO-funded and Marie Curie–hosted positions are also available at Leuven. The Leuven Centre for Indian Studies and the Faculty of Theology and Religious Studies have hosted Indian SSH researchers.", region: "Europe & UK", elig: { status: "open", label: "Indian PhDs eligible" } },
        { name: "NIAS — Netherlands Institute for Advanced Study (Wassenaar/Amsterdam)", url: "https://nias.knaw.nl/", note: "Residential fellowships in SSH, including individual fellow lines (mid-career and early-career), thematic cohort programmes, and joint NIAS–Lorentz workshops. Some lines are open to international scholars; cohort-based programmes have substantial multi-national intake. Less of a salary-postdoc and more of a residency.", region: "Europe & UK", elig: { status: "varies", label: "Varies per fellowship line" } },
        { name: "Central European University (CEU) Junior Research Fellowships — Vienna", url: "https://ceu.edu/research", note: "CEU's Institute for Advanced Study and individual research centres run early-career fellowships; CEU has historically had a strong Global South intake and an explicit anti-authoritarian academic mission. Currently primarily Vienna-based following the Hungarian government's 2018 expulsion. SSH and area studies particularly. Open to international applicants.", region: "Europe & UK", elig: { status: "open", label: "Indian PhDs eligible" } },
        { name: "Cambridge College Junior Research Fellowships (UK)", url: "https://www.jobs.cam.ac.uk/", note: "The Cambridge college system runs separate JRF competitions at King's, Trinity, Christ's, Sidney Sussex, and others — typically 3-year postdocs with light teaching, open-disciplinary. Each college's competition is independently administered through its own website. Open to international PhDs; Trinity and King's are the most prestigious and competitive.", region: "Europe & UK", elig: { status: "open", label: "Indian PhDs eligible — per college" } },
        { name: "Cambridge Centre of African Studies & area-studies postdocs (UK)", url: "https://www.african.cam.ac.uk/", note: "The Centre of African Studies and similar Cambridge area-studies units (CSAS — Centre of South Asian Studies) host project-funded postdocs irregularly. The Smuts Memorial Fund supports Commonwealth-of-Nations applicants including from India. Search per centre rather than by central Cambridge listings.", region: "Europe & UK", elig: { status: "varies", label: "Varies per centre/project" } },
        { name: "IDS Sussex — Institute of Development Studies (UK)", url: "https://www.ids.ac.uk/jobs-careers/", note: "IDS hires research fellows and project-funded researchers more than traditional postdocs — most positions are tied to specific funded research programmes. Strongly relevant for development-studies, political-economy-of-the-Global-South, and policy-engaged work. Open to international researchers.", region: "Europe & UK", elig: { status: "varies", label: "Varies — project-funded research roles" } },
        { name: "ANU — institutional and college-level postdocs (Australia)", url: "https://researchers.anu.edu.au/", note: "Australian National University runs internal postdoc lines through its colleges (Asia & the Pacific, Arts & Social Sciences) and centres (Centre for Aboriginal Economic Policy Research, Coral Bell School, ANU Institute of Asia and the Pacific). The ANU Postdoctoral Fellowship Scheme and individual project-postdocs are open to international applicants. Strong infrastructure for South Asia–related research; Australia–India strategic-partnership programmes occasionally fund India-specific positions.", region: "Asia & Oceania", elig: { status: "caveat", label: "Open — host arrangement usually required" } },
        { name: "Melbourne McKenzie Postdoctoral Fellowship (Australia)", url: "https://research.unimelb.edu.au/strengths/funding/internal/mckenzie-postdoctoral-fellowships", note: "University of Melbourne's prestige internal postdoc — 4-year, all disciplines, modelled structurally on US Society of Fellows programmes. Open to international applicants; competitive cohort intake. Recent cohorts have included scholars with PhDs from Indian institutions.", region: "Asia & Oceania", elig: { status: "open", label: "Indian PhDs eligible" } },
        { name: "NUS Asia Research Institute (ARI) Postdoctoral Fellowship (Singapore)", url: "https://ari.nus.edu.sg/about-us/research-staff-positions/", note: "Annual Asia Research Institute postdoctoral fellowship at the National University of Singapore — 2 years, SSH and area studies oriented, with strong South Asia, Southeast Asia, and East Asia clusters. Recurring annual call. NUS also runs the Faculty of Arts and Social Sciences (FASS) postdoc lines and the Lee Kong Chian NUS-Stanford fellowship; verify which call matches your work.", region: "Asia & Oceania", elig: { status: "open", label: "Indian PhDs eligible — recurs annually" } },
      ],
    },
    {
      title: "Discipline-spanning humanities & social science",
      items: [
        { name: "ACLS — American Council of Learned Societies", url: "https://www.acls.org/", note: "Most ACLS postdoctoral programmes (Emerging Voices, Mellon/ACLS Scholars & Society, etc.) require either US citizenship/permanent residency OR a US PhD plus US institutional affiliation. The Emerging Voices Fellowship is specifically for scholars who have completed a PhD at a US institution. An Indian PhD without US affiliation is generally not directly eligible — verify each call.", region: "North America", elig: { status: "restricted", label: "Restricted: US PhD or US affiliation usually required" } },
        { name: "Wenner-Gren Hunt Postdoctoral Fellowship (anthropology)", url: "https://wennergren.org/programs/hunt-postdoctoral-fellowships/", note: "9-month fellowship explicitly for the write-up phase — turning the dissertation into the first book, journal articles, or other forms of public scholarship. US$40,000 stipend. Open to anthropology PhDs of any nationality, with substantial Indian-applicant cohorts historically. The Hunt is one of the few postdoctoral lines specifically designed to fund the writing year between PhD defence and the next position.", region: "Multi", elig: { status: "open", label: "Indian PhDs eligible — international pool" } },
        { name: "Wenner-Gren Foundation — other grants (Engaged Anthropology, Wadsworth, conference & workshop)", url: "https://wennergren.org/programs/", note: "Beyond the Hunt postdoc: the Engaged Anthropology Grant funds dissemination of completed research back to the field site or affected community; the Wadsworth International Fellowship supports dissertation research at a foreign university; conference and workshop grants cover convening costs. All explicitly international.", region: "Multi", elig: { status: "open", label: "Indian PhDs eligible — varies per programme" } },
        { name: "SSRC International Dissertation Research Fellowship → postdoc bridges", url: "https://www.ssrc.org/", note: "SSRC's IDRF is for US-enrolled PhD students (not most Indian PhDs). The Abe Fellowship Program (for Japan-related work) and Mellon-Mays are similarly restricted to US-affiliated scholars. Other SSRC postdoc bridges may be open to international applicants — check per call.", region: "Multi", elig: { status: "restricted", label: "Restricted: most SSRC programmes require US affiliation" } },
        { name: "Mellon Foundation — Sawyer Seminars and partner postdocs", url: "https://www.mellon.org/grant-programs", note: "Mellon-funded postdocs are administered through host US universities, so eligibility follows the host's rules — most are open to international applicants. Search 'Mellon postdoctoral' on the relevant department page rather than applying through Mellon directly.", region: "North America", elig: { status: "varies", label: "Varies — eligibility set by host institution" } },
      ],
    },
  ],
};

export const RESOURCES_BLOCKS = [
  {
    title: "If you're applying to Indian institutions — practical infrastructure",
    items: [
      { name: "RTI Online (Government of India)", url: "https://rtionline.gov.in/", note: "File RTIs to ask an institute its current roster status, de-reservation history, PwBD compliance figures, or to request the unredacted advertisement annexure when only summary numbers are published." },
      { name: "Lok Sabha / Rajya Sabha questions search", url: "https://sansad.in/", note: "Past parliamentary questions on faculty vacancies are the most useful institutional accountability data available. Search by ministry (HRD/Education), question type (unstarred), and keyword." },
      { name: "Caste / EWS / PwBD certificate authorities", url: "https://www.india.gov.in/topics/social-development/scheduled-castes-scheduled-tribes", note: "State-by-state issuing-authority directory. Format requirements vary; check the specific institution's required format before applying." },
      { name: "National Commission for Scheduled Castes", url: "https://ncsc.nic.in/", note: "Statutory body with jurisdiction over discrimination complaints in central-government institutions, including faculty hiring. File at least a written complaint when reservation procedures are violated." },
      { name: "National Commission for Scheduled Tribes", url: "https://ncst.nic.in/", note: "Equivalent for ST candidates. Both NCSC and NCST have powers to summon institute officials and demand explanations on hiring outcomes." },
    ],
  },
  {
    title: "Networks and associations",
    items: [
      { name: "Ambedkar International Center (AIC)", url: "https://ambedkarinternationalcenter.org/", note: "Based in Washington DC, the AIC offers scholarships and runs mentorship networks connecting Bahujan students with academics and professionals in North America." },
      { name: "Ambedkar King Study Circle (AKSC)", url: "https://akscusa.org/", note: "A diaspora organization in the US and Canada running academic mentorship, study circles, and advocacy for caste equity in North American higher education." },
      { name: "Project EduAccess", url: "https://projecteduaccess.com/", note: "Provides direct mentorship, application support, and fee waivers for marginalized students from South Asia applying for higher education in the UK, Europe, and North America." },
      { name: "Bahujan Scholars International", url: "#", note: "A collective providing advocacy, mentorship, and a vital support network for Bahujan scholars navigating academia globally." },
      { name: "Forum for Anti-Caste Activism at Tkaronto (FACT)", url: "#", note: "A collective of scholars and activists based in Tkaronto (University of Toronto and across the Canadian academic network), providing critical peer support, advocacy, and community building." },
      { name: "Academic Caucuses & Disciplinary Networks", url: "#", note: "Discipline-specific groups like the Dalit Studies networks within the American Anthropological Association (AAA) or the Association for Asian Studies (AAS) often maintain informal mentorship channels. Reach out directly." },
    ],
  },
  {
    title: "If you're tracking institutional accountability",
    items: [
      { name: "The 'Not Found Suitable' (NFS) Mechanism", url: "#", note: "The pervasive administrative practice where selection committees at IITs and central universities repeatedly leave SC/ST/OBC faculty posts vacant by declaring all candidates 'None Found Suitable', leading to eventual de-reservation." },
      { name: "The 13-Point Roster Controversy (2018–2019)", url: "https://thewire.in/education/13-point-roster-system-university-faculty", note: "A court ruling temporarily shifted reservation calculations from the university level to the department level, effectively eliminating SC/ST/OBC faculty lines in small departments. Mass Bahujan protests forced the government to pass an ordinance restoring the 200-point university-wide roster." },
      { name: "Thorat Committee Report (2007)", url: "#", note: "The landmark government committee report documenting systemic, deeply entrenched caste discrimination against students and doctors from marginalized backgrounds at AIIMS Delhi." },
      { name: "The Central Educational Institutions (Reservation in Teachers' Cadre) Act, 2019", url: "https://egazette.gov.in/", note: "The legislative intervention fought for by student movements to legally mandate that a university be treated as a single unit (rather than individual departments) for computing the reservation roster." },
      { name: "Karnataka's 'Rohith Vemula Act' Initiative", url: "#", note: "The landmark anti-discrimination legislation drafted by the Karnataka state government to explicitly prohibit and penalize caste-based discrimination against students and faculty in higher education institutions. This is the first major state-level implementation of the nationwide demand for a 'Rohith Act'." },
      { name: "UGC De-reservation Draft Guidelines Controversy (2024)", url: "#", note: "The massive nationwide backlash against draft UGC guidelines that proposed allowing unfilled SC, ST, and OBC faculty vacancies to be 'de-reserved' and opened to general category candidates. Widespread student protests forced the Ministry of Education to retract the proposal and reiterate that constitutional reservation mandates cannot be bypassed." },
    ],
  },
];

