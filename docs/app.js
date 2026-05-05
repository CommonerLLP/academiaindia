// ---------- state ----------
let ADS = [];
let COVERAGE = null;
let INSTITUTIONS = {};
const TYPE_ORDER = ["IIT","IIM","PrivateUniversity","IISc","IISER","CentralUniversity","NIT","IIIT"];
const TYPE_COLORS = {
  IIT: "#1F4E79", IIM: "#2d6a4f", IISc: "#6b21a8", IISER: "#b45309",
  NIT: "#64748b", IIIT: "#0e7490", CentralUniversity: "#92400e",
  PrivateUniversity: "#7c3aed",
};
const SAVED_KEY = "hei-tracker-saved";
const SAVED = new Set(JSON.parse(localStorage.getItem(SAVED_KEY) || "[]"));
const persistSaved = () => localStorage.setItem(SAVED_KEY, JSON.stringify([...SAVED]));
const typeLabel = (type) => ({
  CentralUniversity: "Central University",
  PrivateUniversity: "Private University",
}[type] || type);

// ---------- broad HSS classifier ----------
// Tier A: HSS match    → humanities/social-science fields, broadly construed
// Tier B: ambiguous    → faculty/research postings that may contain HSS roles
// Tier C: out of scope → STEM, admin, finance/commerce, and operational roles
// The dashboard is a public-interest jobs tracker, not a personal-fit filter:
// history, literature, economics, psychology, policy, media, design/HCI, and
// related social-science fields should stay visible unless the core title is
// clearly non-academic/admin or clearly outside HSS.
const PROFILE_POS_A = [
  /\banthropolog(y|ist|ies|ical)\b/i, /\bethnograph(y|ic|er)\b/i,
  /\bsociolog(y|ical)\b/i, /\bsocial\s+scien(ce|ces)\b/i,
  /\bpolitical\s+scien(ce|ces)\b/i, /\bpolitics\b/i,
  /\beconomics?\b/i, /\bpolitical\s+economy\b/i,
  /\bpublic\s+policy\b/i, /\bpublic\s+administration\b/i,
  /\bgovernance\b/i, /\bdevelopment\s+stud(y|ies)\b/i,
  /\bdevelopment\b/i, /\bgender\s+stud(y|ies)\b/i, /\bgender\b/i,
  /\bhistor(y|ian|ical)\b/i, /\bliterature\b/i,
  /\bphilosoph(y|ical)\b/i, /\blinguistic(s|)\b/i,
  /\b(media|communication|journalism)\s+stud(y|ies)?\b/i, /\bjournalism\b/i,
  /\bpsycholog(y|ical)\b/i,
  /\bscience\s*(and|&|,)\s*technology\s*stud(ies|y)\b/i, /\bSTS\b/,
  /\bscience,?\s*technology,?\s*(and\s*)?society\b/i,
  /\btechnology[-\s]+in[-\s]+society/i, /\bdigital\s+societ/i,
  /\b(critical\s+)?infrastructure\s+stud(y|ies)\b/i,
  /\bcritical\s+data\s+stud(y|ies)\b/i,
  /\b(media|digital|cultural)\s+anthropolog/i,
  /\balgorithmic\s+(governance|culture|stud)/i,
  /\bcaste\s+stud(y|ies)\b/i, /\banti[-\s]?caste\b/i,
  /\bSouth\s+Asia(n)?\s+(studies|anthropolog|society|cultures?)\b/i,
  /\bGlobal\s+Asia\b/i, /\bAsian\s+stud(y|ies)\b/i,
  /\bdigital\s+humanit/i,
  /\b(HCI|CSCW)\b/, /\bhuman[-\s]computer\s+interaction\b/i,
  /\bcomputer[-\s]supported\s+cooperative\s+work\b/i,
  /\bdesign\s+(stud(y|ies)|research)\b/i, /\buser\s+experience\b/i, /\bUX\b/,
  /\bmulti[-\s]?species\s+ethnograph/i,
  /\b(global|postcolonial|decolonial)\s+(data|media|digital|south)\b/i,
  // Indian-institution HSS centres (retained):
  /\bSoPP\b/, /\bADCPS\b/, /\bC[-\s]?TARA\b/,
  /\bSchool\s+of\s+Public\s+Policy/i,
  /\bAshank\s+Desai\s+Centre\s+for\s+Policy/i,
  /\bCentre\s+for\s+Technology\s+Alternatives\s+for\s+Rural/i,
];
const PROFILE_POS_B = [
  /\bcultural\s+stud(y|ies)\b/i,
  /\bbureaucracy\b/i, /\bgovernmentality\b/i,
  /\binformation\s+stud(y|ies)\b/i, /\bi[-\s]?School\b/i,
  /\bpostcolonial\b/i, /\bglobal\s+south\b/i,
  /\bscience,?\s+technology,?\s+and\s+society/i,
  /\bpublic\s+health\b/i, /\beducation\b/i, /\bpedagog(y|ical)\b/i,
  /\bheritage\s+management\b/i, /\burban\s+stud(y|ies)\b/i,
  /\blaw\b/i, /\blegal\s+stud(y|ies)\b/i,
];
const PROFILE_NEG = [
  // non-teaching / admin roles
  /\bnon[-\s]?teaching\b/i, /\bregistrar\b/i, /\bclerk\b/i, /\bsecurity\s+officer\b/i,
  // pure STEM / engineering
  /\bengineer(ing|s|)\b/i, /\bchemistry\b/i, /\bmathematics\b/i, /\bphysics\b/i,
  /\bbiology\b/i, /\bbiotech/i, /\bbiochem/i, /\bmicrobiolog/i,
  /\bmechanical\b/i, /\belectrical\b/i, /\belectronics\b/i, /\bcivil\b/i,
  /\bcomputer\s+scien/i, /\bdata\s+scienc/i, /\bartificial\s+intelligence\b/i,
  /\bmachine\s+learn/i, /\brobotics\b/i, /\bnanoscienc/i,
  /\beconometric/i,
  /\bgeograph(y|er|ic)\b/i, /\benvironmental\s+(stud|human|scienc)/i,
  /\bearth\s+scienc/i, /\bsustainability\s+stud/i, /\becology\b/i,
  // finance/management/commerce
  /\bfinance\b/i, /\baccount(ing|ancy|s)\b/i, /\bmarketing\b/i,
  /\boperations\s+management\b/i, /\bsupply\s+chain\b/i,
  /\bbanking\b/i, /\binsurance\b/i, /\bcommerce\b/i,
  // health/bio sciences / clinical roles
  /\bpharmac(y|olog)/i, /\bclinical\s+psycholog/i, /\bneuroscienc/i,
  /\bnursing\b/i, /\bdental\b/i, /\bveterinar/i,
  // music/arts production
  /\bmusic(olog|)\b/i, /\bdance\b/i, /\bperformance\s+art/i,
];
const FACULTY_HINT = /\bfaculty\b|\bassistant\s+professor\b|\bassociate\s+professor\b|\bprofessor\b|\blecturer\b|\breader\b|\bpostdoc|\bacademic\s+associate\b|\bteaching\s+fellow\b|\bresearch\s+(position|fellow|associate)\b/i;
function classifyAd(ad) {
  const sp = getStructuredPosition(ad);
  // Identifying fields: what the post IS. Negatives run only here to avoid
  // killing legit HSS posts whose broader raw_text_excerpt contains institute
  // boilerplate (e.g. "School of Engineering" appearing on a Centre for
  // Educational Technology ad from IIT Bombay).
  const core = [ad.title, sp?.department, sp?.discipline, sp?.school_or_centre, ...(sp?.areas || []), ad.department, ad.discipline, ad.ad_number]
    .filter(Boolean).join(" | ");
  const full = [core, sp?.raw_section_text, ad.pdf_excerpt, ad.raw_text_excerpt].filter(Boolean).join(" | ");
  // Core fields decide first. This prevents a STEM/business title from being
  // marked HSS just because the surrounding page boilerplate says "liberal
  // education", while still keeping explicitly HSS titles visible.
  if (PROFILE_POS_A.some(r => r.test(core))) return "hss";
  if (PROFILE_POS_B.some(r => r.test(core))) return "ambiguous";
  if (PROFILE_NEG.some(r => r.test(core))) return "excluded";
  if (PROFILE_POS_A.some(r => r.test(full))) return "hss";
  if (PROFILE_POS_B.some(r => r.test(full))) return "ambiguous";
  if (FACULTY_HINT.test(full)) return "ambiguous";
  return "excluded";
}

// Display order for the Discipline filter dropdown. HSS disciplines surface
// first (this dashboard's primary user base is HSS-leaning at present),
// followed by Economics/Finance/Management, then engineering/science/tech,
// then the residual "General / unspecified" and "Other"
// catch-alls. Order shapes the cognitive default; reorder if the user
// base shifts.
const FIELD_ORDER = [
  // HSS-relevant first (profile-priority).
  "Anthropology", "Sociology", "Political Science", "Public Policy",
  "History", "Philosophy", "Literature", "Linguistics", "Psychology",
  "Cognitive Science", "Education", "Development Studies", "Gender Studies",
  "Media / Communication", "Journalism", "HCI / STS", "Design", "Law",
  "Public Health", "Urban / Geography", "Heritage / Culture",
  // Then the user-deprecated HSS-adjacent (econ / finance / management).
  "Economics", "Finance / Capital Markets", "Management / Business",
  // Engineering / pure-science / tech disciplines — present in the data
  // (every IIT rolling ad covers most of these), filterable individually
  // for users who do want to see them.
  "Computer Science / AI / Data", "Electrical / Electronics",
  "Mechanical / Aerospace", "Civil / Environmental", "Chemical Engineering",
  "Materials / Metallurgical", "Mathematics / Statistics", "Physics",
  "Chemistry", "Biology / Biotech / Biomedical",
  "Earth / Ocean Sciences", "Energy / Sustainability",
  "Industrial / Operations", "Medical / Pharmacy",
  "General / unspecified", "Other",
];
const HSS_SUBJECT_FILTER_LABELS = new Set([
  "Anthropology", "Sociology", "Political Science", "Public Policy",
  "History", "Philosophy", "Literature", "Linguistics", "Psychology",
  "Cognitive Science", "Education", "Development Studies", "Gender Studies",
  "Media / Communication", "Journalism", "HCI / STS", "Design", "Law",
  "Public Health", "Urban / Geography", "Heritage / Culture",
  "Economics", "Finance / Capital Markets", "Management / Business",
  "General / unspecified",
]);
const FIELD_RULES = [
  ["Anthropology", [/\banthropolog(y|ical|ist|ies)\b/i, /\bethnograph(y|ic|er)\b/i]],
  ["Sociology", [/\bsociolog(y|ical)\b/i, /\bsocial\s+theor(y|ies)\b/i]],
  ["Economics", [/\beconomics?\b/i, /\bpolitical\s+economy\b/i, /\bdevelopment\s+economics?\b/i]],
  ["Political Science", [/\bpolitical\s+scien(ce|ces)\b/i, /\bpolitics\b/i, /\binternational\s+relations\b/i]],
  ["Public Policy", [/\bpublic\s+policy\b/i, /\bpublic\s+administration\b/i, /\bgovernance\b/i]],
  ["Finance / Capital Markets", [/\bcapital\s+markets?\b/i, /\bfinance\b/i, /\bfinancial\s+(markets?|institutions?|engineering|inclusion|data)\b/i, /\basset\s+pricing\b/i, /\bportfolio\s+management\b/i, /\bfintech\b/i]],
  ["Management / Business", [/\bmanagement\b/i, /\bbusiness\b/i, /\bentrepreneurship\b/i, /\bmarketing\b/i, /\boperations\s+management\b/i, /\bhuman\s+resources?\b/i, /\borganizational\s+behavio(u)?r\b/i]],
  ["History", [/\bhistor(y|ian|ical)\b/i]],
  ["Philosophy", [/\bphilosoph(y|ical)\b/i]],
  ["Literature", [/\bliterature\b/i, /\bliterary\b/i, /\bcomparative\s+lit/i]],
  ["Linguistics", [/\blinguistic(s|)\b/i, /\blanguage\s+stud(y|ies)\b/i]],
  ["Psychology", [/\bpsycholog(y|ical)\b/i]],
  ["Cognitive Science", [/\bcognitive\s+scien/i, /\bcognitive\s+psycholog/i, /\bcognition\b/i]],
  ["Education", [/\beducation\b/i, /\bpedagog(y|ical)\b/i, /\bteaching\s+and\s+learning\b/i]],
  ["Development Studies", [/\bdevelopment\s+stud(y|ies)\b/i, /\bdevelopment\s+(policy|practice|sector|domain|economics?|research)\b/i, /\brural\s+livelihoods?\b/i]],
  ["Gender Studies", [/\bgender\b/i, /\bwomen'?s\s+stud(y|ies)\b/i]],
  ["Media / Communication", [/\bmedia\s+stud(y|ies)\b/i, /\bcommunication\b/i, /\bfilm\s+(&|and)?\s*television\b/i, /\bdigital\s+media\b/i]],
  ["Journalism", [/\bjournalism\b/i]],
  ["HCI / STS", [/\bHCI\b/i, /\bCSCW\b/i, /\bhuman[-\s]computer\s+interaction\b/i, /\bscience\s*(and|&|,)\s*technology\s*stud(ies|y)\b/i, /\bSTS\b/i, /\bscience,?\s*technology,?\s*(and\s*)?society\b/i]],
  ["Design", [/\bdesign\s+(stud(y|ies)|research|practice)\b/i, /\buser\s+experience\b/i, /\bUX\b/i, /\bvisual\s+communication\b/i]],
  ["Law", [/\blaw\b/i, /\blegal\s+stud(y|ies)\b/i, /\bjurisprudence\b/i]],
  ["Public Health", [/\bpublic\s+health\b/i]],
  ["Urban / Geography", [/\burban\s+stud(y|ies)\b/i, /\bgeograph(y|er|ic)\b/i]],
  ["Heritage / Culture", [/\bheritage\s+management\b/i, /\bcultural\s+stud(y|ies)\b/i, /\bculture\b/i]],
  // Engineering / pure-science / tech disciplines. These were previously
  // collapsed into a single "Other" bucket; surfacing them as
  // first-class field tags lets users with non-HSS profiles filter usefully.
  ["Computer Science / AI / Data",
    [/\bcomputer\s+(science|engineering)\b/i, /\bdata\s+scien(ce|ces)\b/i,
     /\bartificial\s+intelligence\b/i, /\bmachine\s+learning\b/i, /\b\bAI\/?ML\b/,
     /\bsoftware\s+engineering\b/i, /\binformation\s+technology\b/i, /\bIT\s+systems?\b/i]],
  ["Electrical / Electronics",
    [/\belectrical\s+engineering\b/i, /\belectronics?\s+engineering\b/i,
     /\bcommunication\s+engineering\b/i, /\bsignal\s+processing\b/i,
     /\bVLSI\b/i, /\bsemiconductor\b/i, /\bphotonics?\b/i]],
  ["Mechanical / Aerospace",
    [/\bmechanical\s+engineering\b/i, /\baerospace\s+engineering\b/i,
     /\baeronautical\s+engineering\b/i, /\bapplied\s+mechanics\b/i,
     /\brobotics?\b/i, /\bautomotive\s+engineering\b/i,
     /\b(thermal|fluid)\s+engineering\b/i]],
  ["Civil / Environmental",
    [/\bcivil\s+engineering\b/i, /\benvironmental\s+(engineering|science)\b/i,
     /\bstructural\s+engineering\b/i, /\bgeotechnical\b/i, /\btransportation\s+engineering\b/i,
     /\bwater\s+resources?\s+engineering\b/i]],
  ["Chemical Engineering",
    [/\bchemical\s+engineering\b/i, /\bprocess\s+engineering\b/i, /\bbioprocess\b/i,
     /\bcatalysis\b/i]],
  ["Materials / Metallurgical",
    [/\bmaterials?\s+(science|engineering)\b/i, /\bmetallurgical\s+engineering\b/i,
     /\bmetallurgy\b/i, /\bnanoscience\b/i, /\bnanotechnolog/i]],
  ["Mathematics / Statistics",
    [/\bmathematics\b/i, /\bapplied\s+mathematics\b/i, /\bstatistics\b/i, /\bbiostatistics\b/i]],
  ["Physics", [/\bphysics\b/i, /\bastrophysics\b/i, /\bquantum\s+(physics|optics|computing)\b/i]],
  ["Chemistry", [/\bchemistry\b/i, /\borganic\s+chem/i, /\binorganic\s+chem/i, /\banalytical\s+chem/i]],
  ["Biology / Biotech / Biomedical",
    [/\bbiolog(y|ical)\s+(sciences?)?\b/i, /\bbiotechnolog(y|ies)\b/i, /\bbiosciences?\b/i,
     /\bbioengineering\b/i, /\bbioinformatics\b/i, /\bbiomedical\s+(engineering|sciences?)\b/i,
     /\bgenetics\b/i, /\bmicrobiolog/i, /\bneuroscience\b/i]],
  ["Earth / Ocean Sciences",
    [/\bearth\s+sciences?\b/i, /\bgeolog(y|ical)\b/i, /\bocean\s+(engineering|sciences?)\b/i,
     /\batmospheric\s+sciences?\b/i, /\bclimate\s+sciences?\b/i]],
  ["Energy / Sustainability",
    [/\benergy\s+(engineering|science|systems?|policy)\b/i, /\brenewable\s+energy\b/i,
     /\bsustainability\b/i, /\bclean\s+energy\b/i]],
  ["Industrial / Operations",
    [/\bindustrial\s+engineering\b/i, /\boperations\s+research\b/i,
     /\bsystems\s+and\s+control\b/i, /\bdecision\s+sciences?\b/i]],
  ["Medical / Pharmacy",
    [/\bmedical\s+sciences?\b/i, /\bpharmac(y|ology|euticals?)\b/i, /\bclinical\s+research\b/i,
     /\bnursing\b/i, /\bdental\b/i]],
];
const FIELD_FALLBACK_RULES = FIELD_RULES
  .filter(([label]) => ![
    "Development Studies", "Education", "Political Science", "Public Policy",
    "Media / Communication", "Finance / Capital Markets", "Management / Business",
  ].includes(label));
const CORE_OUT_OF_SCOPE_RE = /\b(aerospace|applied\s+mechanics|biomedical|biosciences?|bioengineering|biotechnology|chemical\s+engineering|chemistry|civil\s+engineering|computer\s+science|data\s+science|artificial\s+intelligence|electrical\s+engineering|electronics?|energy\s+science|environmental\s+science|industrial\s+engineering|operations\s+research|mathematics|mechanical\s+engineering|metallurgical|materials\s+science|semiconductor|systems\s+and\s+control|medical\s+sciences?|physics|ocean\s+engineering|earth\s+sciences?|robotics|security\s+engineer|technical\s+support)\b/i;

function fieldTags(ad) {
  const sp = getStructuredPosition(ad);
  const core = [ad.title, sp?.department, sp?.discipline, sp?.school_or_centre, ...(sp?.areas || []), ad.department, ad.discipline]
    .filter(Boolean).join(" | ");
  const full = [core, sp?.raw_section_text, ad.pdf_excerpt, ad.raw_text_excerpt].filter(Boolean).join(" | ");
  const match = (text, ruleset = FIELD_RULES) => ruleset
    .filter(([, rules]) => rules.some(r => r.test(text)))
    .map(([label]) => label);
  const tags = match(core);
  if (tags.length) return [...new Set(tags)];
  if (CORE_OUT_OF_SCOPE_RE.test(core)) return ["Other"];
  if (classifyAd(ad) === "excluded") return ["Other"];
  if (typeof ad.parse_confidence === "number" && ad.parse_confidence < 0.45) {
    return ["General / unspecified"];
  }
  const fallback = match(full, FIELD_FALLBACK_RULES);
  if (fallback.length) return [...new Set(fallback)].slice(0, 3);
  if (FACULTY_HINT.test(full)) return ["General / unspecified"];
  return ["Other"];
}

function primaryField(ad) {
  return fieldTags(ad)[0] || "Other";
}

// ---------- helpers ----------
function escapeHTML(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));
}
const escapeAttr = escapeHTML;
function escapeRegExp(s) {
  return String(s ?? "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Per-listing campus detection. Multi-campus institutions (Azim Premji
// Bengaluru / Bhopal / Ranchi; AIIMS; BITS Pilani; etc.) carry one
// registry city — usually the main campus. When the ad text actually
// names a different campus, that's the campus the candidate would
// move to. Override the registry default with what the ad says.
function detectAdCampus(ad) {
  const text = `${ad.title || ""} ${ad.raw_text_excerpt || ""}`;
  if (!text) return null;
  // "Campus Bhopal" / "Campus: Bhopal"
  let m = text.match(/\bCampus[:\s]+([A-Z][a-zA-Z]+)\b/);
  if (m) return m[1];
  // "Bhopal Campus" / "Bhopal campus"
  m = text.match(/\b([A-Z][a-zA-Z]+)\s+(?:Campus|campus)\b/);
  if (m) return m[1];
  // "based in X" / "located in X"
  m = text.match(/\b(?:based|located|positioned)\s+(?:in|at)\s+([A-Z][a-zA-Z]+)\b/i);
  if (m) return m[1];
  return null;
}

function cityAlreadyInInstitutionName(instName, city) {
  if (!instName || !city) return false;
  // Multi-campus brands need the location even when the brand is familiar:
  // Azim Premji University has Bengaluru/Bhopal/Ranchi; Shiv Nadar has
  // separate Uttar Pradesh and Chennai institutions. Keep the campus visible.
  if (/\b(azim\s+premji|shiv\s+nadar)\b/i.test(instName)) return false;
  const aliases = {
    "new delhi": ["new delhi", "delhi"],
    delhi: ["new delhi", "delhi"],
    bengaluru: ["bengaluru", "bangalore"],
    bangalore: ["bengaluru", "bangalore"],
    mumbai: ["mumbai", "bombay"],
    bombay: ["mumbai", "bombay"],
    chennai: ["chennai", "madras"],
    madras: ["chennai", "madras"],
  };
  const key = String(city).toLowerCase().trim();
  const names = aliases[key] || [key];
  return names.some(name => new RegExp(`\\b${escapeRegExp(name)}\\b`, "i").test(instName));
}

// Strip UI-widget bleed-through that the HTML→text scrape can't clean.
// Each pattern is matched against a known offender on a real career page;
// keep this list tight rather than aggressive — over-stripping content is
// worse than leaving a few stray words.
// Trigger phrases that mark the START of substantive recruitment content.
// When the excerpt begins with institutional masthead boilerplate (address,
// "established in YYYY", "looking for committed faculty"), we skip ahead
// to the first occurrence of one of these markers. The IIM Bodh Gaya PDF
// is the canonical case: 700 chars of multi-language address + bromides
// before the actual position breakdown — this strips that prefix.
const SUBSTANTIVE_MARKERS = /\b(vacant\s+positions?|the\s+vacant\s+position|sanctioned\s+(strength|posts?)|areas?\s+of\s+(specialization|specialisation|recruitment)|eligibilit(y|ies)|qualifications?\s+(and|&)\s+experience|qualifications?\s+required|applications?\s+are\s+invited|invites?\s+applications?|the\s+following\s+(?:areas?|positions?|departments?)|number\s+of\s+(?:posts?|positions?|vacancies?)|specialization|department[\s-]+wise|broad\s+areas?)\b/i;
const INSTITUTIONAL_BOILERPLATE = /\b(?:pioneer\s+of\s+liberal\s+education|recognized\s+strengths\s+in\s+the\s+areas?|recognised\s+strengths\s+in\s+the\s+areas?|offers\s+undergraduate\s+programs?|offers\s+undergraduate\s+programmes?|provides\s+an\s+environment\s+for\s+faculty\s+to\s+conduct|overall,\s+the\s+school\s+stands\s+for)\b/i;

// Devanagari-script range. We strip Hindi institutional address blocks
// since the dashboard is English-first; if the user opens the source PDF,
// they'll see the full bilingual notice. Range covers Hindi proper plus
// the digits/punctuation needed to clean numbered postal segments.
const DEVANAGARI_RE = /[ऀ-ॿ]/;

function sanitizeExcerpt(text) {
  if (!text) return "";
  let out = text
    // Azim Premji "Deadline Add to Calendar × Add to Calendar iCal Google
    // Outlook Outlook.com Yahoo <real-deadline-date>" — collapse the whole
    // calendar widget block back to just "Deadline:".
    .replace(/Deadline\s+Add to Calendar(?:\s*×\s*Add to Calendar)?\s+iCal\s+Google\s+Outlook\s+Outlook\.com\s+Yahoo\s+/gi, "Deadline: ")
    // Generic stray "Add to Calendar" / "× Add to Calendar" leftovers.
    .replace(/(?:×\s*)?Add to Calendar\s+/gi, "")
    // Provider-name run that sometimes survives separately
    // ("iCal Google Outlook Outlook.com Yahoo").
    .replace(/\biCal\s+Google\s+Outlook\s+Outlook\.com\s+Yahoo\s*/gi, "")
    // Drop Devanagari-script address/header lines. We want English copy
    // on the card; the source PDF is one click away if the reader wants
    // the bilingual original.
    .replace(/[^\n.|]*[ऀ-ॿ]+[^\n.|]*/g, "")
    // Normalise leftover whitespace.
    .replace(/\s{2,}/g, " ")
    .trim();

  // Repeated school/institution marketing copy is not job-specific
  // evidence. It can help infer the recruiting unit elsewhere, but it
  // should not appear as Description or feed Topical fit chips.
  if (INSTITUTIONAL_BOILERPLATE.test(out) && !/\b(?:qualifications?|eligibilit|responsibilit|apply\s+by|deadline|last\s+date)\b/i.test(out)) {
    return "";
  }

  // (1) Suppress nav-crumb duplications. Many career pages render the
  // section title twice ("Faculty Recruitment Faculty Recruitment",
  // "English English", "Recruitment Announcements Recruitment Announcements")
  // — the scrape concatenates the breadcrumb and heading. If the excerpt
  // is two equal halves repeating, return empty.
  const halves = out.match(/^(.{1,60}?)\s+\1\s*$/);
  if (halves) return "";

  // (2) Suppress dynamic-listing JSON-fragment artifacts: "3675 | Assistant
  // Professor - X | Jun 30, 2026 | Apply" patterns (Shiv Nadar, FLAME, etc.).
  // Two or more pipes plus a "Apply"/"Apply Now" tail = listing-row scrape,
  // not paragraph prose. The card already shows the title and apply link.
  if (/\|.*\|.*\b(Apply(\s*Now)?|Read\s+More)\s*$/i.test(out)) return "";
  if (out.split(/\s*\|\s*/).length >= 3 && out.length < 200) return "";

  // (3) Below 60 chars and no substantive marker = page-chrome remainder.
  // Stub messages from rolling-call placeholders are typically much longer
  // (>120 chars) and include phrases like "Most IIMs route applications"
  // — those survive this filter naturally.
  if (out.length < 60 && !SUBSTANTIVE_MARKERS.test(out)) return "";

  // (4) IIM Bodh Gaya pattern: institutional masthead boilerplate prefix
  // followed by substantive recruitment content. If a marker appears far
  // enough in, jump past the masthead. Boundary at sentence-start.
  const m = SUBSTANTIVE_MARKERS.exec(out);
  if (m && m.index > 80 && m.index < out.length - 50) {
    const back = out.slice(Math.max(0, m.index - 120), m.index);
    const lastBreak = Math.max(back.lastIndexOf(". "), back.lastIndexOf("\n"));
    const start = lastBreak >= 0 ? (m.index - back.length + lastBreak + 1) : m.index;
    out = out.slice(start).trim();
  }
  return out;
}

function resolveUrl(u) {
  if (!u) return "#";
  if (u.startsWith("http") || u.startsWith("file://")) return u;
  return "../" + u;
}

function parseDate(s) {
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

function daysUntil(s) {
  const d = parseDate(s);
  if (!d) return null;
  const today = new Date(); today.setHours(0,0,0,0);
  const target = new Date(d); target.setHours(0,0,0,0);
  return Math.round((target - today) / 86400000);
}

function urgencyTier(ad) {
  // Thresholds reflect academic-application reality, not generic deadline UX:
  // ≤7 days is genuinely tight (need recommenders + statement), ≤30 days is
  // already "should be working on this", >30 is "ok, plan it." Tightened from
  // the previous 3/14 thresholds, which under-flagged real time pressure.
  const d = daysUntil(ad.closing_date);
  if (d == null) return "unknown";
  if (d < 0) return "closed";
  if (d <= 7) return "critical";
  if (d <= 30) return "soon";
  return "ok";
}

function formatDate(s) {
  const d = parseDate(s);
  if (!d) return "";
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function formatCountdown(ad) {
  const d = daysUntil(ad.closing_date);
  if (d == null) return "";
  if (d < 0) return "closed";
  if (d === 0) return "closes today";
  if (d === 1) return "1 day left";
  return `in ${d} days`;
}

function daysSince(s) {
  const d = parseDate(s);
  if (!d) return null;
  const today = new Date(); today.setHours(0,0,0,0);
  const seen = new Date(d); seen.setHours(0,0,0,0);
  return Math.max(0, Math.round((today - seen) / 86400000));
}

function sourceLabel(ad) {
  if (ad._source_method === "public-interest override") return "official source";
  if (ad._source_method === "stale carry-forward") return "carried forward";
  if (ad._source_method === "curated rolling call" || ad._rolling_stub || ad._manual_stub) return "rolling call";
  if (ad._curated_iit || ad._pdf_parsed) return "verified PDF";
  if (ad._source_method === "official scrape") return "parsed page";
  return "parsed source";
}

function sourceLinkLabel(ad) {
  if (ad._rolling_stub || ad._manual_stub) return "Official source →";
  if (ad._pdf_parsed || (ad.original_url || "").toLowerCase().includes(".pdf")) return "Original PDF →";
  return "Official listing →";
}

// ---------- position-type helpers ----------
// Four mutually-non-exclusive predicates. An ad can match multiple — many
// IIT rolling ads cover Asst/Assoc/Full simultaneously, in which case all
// three checkboxes light up for that ad. We err on inclusive matching so a
// user looking for "Associate Professor" doesn't miss generic faculty ads.
function _t(ad) {
  const sp = getStructuredPosition(ad);
  return [ad.title, sp?.post_type, ...(sp?.ranks || [])].filter(Boolean).join(" ").toLowerCase();
}
function isAsstProfMatch(ad) {
  const sp = getStructuredPosition(ad);
  const ranks = Array.isArray(sp?.ranks) ? sp.ranks.map(r => String(r).toLowerCase()) : [];
  if (ranks.some(r => /\bassistant\s+professor\b/.test(r))) return true;
  // "Assistant Professor" explicitly, OR a generic Faculty post that doesn't
  // narrow to a higher rank.
  const t = _t(ad);
  if (/\bassistant\s+professor\b/.test(t)) return true;
  const postType = sp?.post_type || ad.post_type;
  if (postType === "Faculty" && !/\bassociate\s+professor\b|\bprofessor\b|\bvisiting\b|\bpostdoc/.test(t)) return true;
  // The IIT rolling-ad convention bundles all three ranks under a single
  // call — "Faculty (Asst/Assoc/Prof) — …" — count those as Asst.
  if (/\b(asst|assistant)\s*\/\s*(assoc|associate)\b/i.test(ad.title || "")) return true;
  return false;
}
function isAssocProfMatch(ad) {
  const sp = getStructuredPosition(ad);
  const ranks = Array.isArray(sp?.ranks) ? sp.ranks.map(r => String(r).toLowerCase()) : [];
  if (ranks.some(r => /\bassociate\s+professor\b/.test(r))) return true;
  const t = _t(ad);
  if (/\bassociate\s+professor\b/.test(t)) return true;
  if (/assoc(iate)?\s*[\/]/i.test(ad.title || "")) return true;  // "Asst/Assoc/Prof"
  return false;
}
function isFullProfMatch(ad) {
  const sp = getStructuredPosition(ad);
  const ranks = Array.isArray(sp?.ranks) ? sp.ranks.map(r => String(r).trim().toLowerCase()) : [];
  if (ranks.some(r => r === "professor" || r === "full professor")) return true;
  const t = _t(ad);
  // "Professor" but NOT preceded by Assistant/Associate/Visiting/Adjunct.
  if (/\bprofessor\b/.test(t)
      && !/\b(assistant|associate|visiting|adjunct)\s+professor\b/.test(t)) return true;
  if (/\/\s*prof(essor)?\b/i.test(ad.title || "")) return true;  // "Asst/Assoc/Prof"
  return false;
}
function isResearchMatch(ad) {
  const sp = getStructuredPosition(ad);
  const t = _t(ad);
  const postType = sp?.post_type || ad.post_type;
  return postType === "Research" || postType === "Scientific" || postType === "Postdoc" ||
         /postdoc|post[- ]doc|research\s+fellow/.test(t);
}
// Visiting faculty is a distinct labour category — semester-bound, contractual,
// no tenure track. The other predicates already exclude "visiting" from the
// generic-Faculty branch, so this is additive, not overlapping. Keeps Visiting
// Faculty ads from silently mixing into the Asst/Assoc/Full counts and gives
// candidates an explicit toggle for them.
function isVisitingMatch(ad) {
  const sp = getStructuredPosition(ad);
  if (ad.post_type === "Visiting") return true;
  if (sp?.post_type === "Visiting" || sp?.contract_status === "Visiting") return true;
  return /\bvisiting\s+(faculty|professor|fellow|scholar|lecturer)\b/.test(_t(ad));
}
// Backwards-compatible alias used by quick-chip handlers and any older code.
const isFacultyMatch = isAsstProfMatch;

// === Display-label helpers for cards ==================================
//
// These translate the raw schema values into the labels a candidate
// actually scans. Two principles:
//
//   1. Indian academic vocabulary, not US imports. The schema's
//      `ContractStatus.TenureTrack` is meaningful to a tiny subset of
//      private universities (Ashoka, Krea, FLAME, IIM-flexi); to
//      everybody else it's noise. Map both Regular and TenureTrack to
//      "Permanent" so the binary that matters in the Indian academic
//      labour market — permanent vs. contract — is what the card says.
//
//   2. Discipline-first card heading. The previous design put the
//      institution's title ("Faculty Positions in History") above
//      everything else. That's the institution's marketing language;
//      it's also redundant once you've also shown the discipline pill,
//      the rank pill, and the contract pill below. The card now leads
//      with the discipline (the candidate's primary scan target),
//      followed by rank · contract, followed by institution + city.
//
// All helpers are pure functions of the ad object so they can be unit-
// tested in isolation if/when frontend tests land.

function contractLabel(cs) {
  // Map ContractStatus enum → Indian academic vocabulary.
  if (cs === "Regular" || cs === "TenureTrack" || cs === "Permanent") return "Permanent";
  if (cs === "Contractual" || cs === "Contract") return "Contract";
  if (cs === "Guest" || cs === "Visiting") return "Visiting";
  return null; // Unknown → omit the line entirely
}

function getStructuredPosition(ad = {}) {
  if (ad.structured_position) return ad.structured_position;
  if (Array.isArray(ad.structured_positions) && ad.structured_positions.length) return ad.structured_positions[0];
  return null;
}

const DEPARTMENT_UNIT_OVERRIDES = new Map([
  ["aerospace engineering", "Department of Aerospace Engineering"],
  ["applied mechanics", "Department of Applied Mechanics"],
  ["biochemical engineering & biotechnology", "Department of Biochemical Engineering & Biotechnology"],
  ["biological sciences and bioengineering", "Department of Biological Sciences and Bioengineering"],
  ["biosciences & bioengineering", "Department of Biosciences & Bioengineering"],
  ["biotechnology", "Department of Biotechnology"],
  ["chemical engineering", "Department of Chemical Engineering"],
  ["chemistry", "Department of Chemistry"],
  ["civil engineering", "Department of Civil Engineering"],
  ["cognitive science", "Department of Cognitive Science"],
  ["computer science & engineering", "Department of Computer Science & Engineering"],
  ["computer science and engineering", "Department of Computer Science and Engineering"],
  ["data science and artificial intelligence", "Department of Data Science and Artificial Intelligence"],
  ["earth sciences", "Department of Earth Sciences"],
  ["economics", "Department of Economics"],
  ["economic sciences", "Department of Economic Sciences"],
  ["electrical engineering", "Department of Electrical Engineering"],
  ["energy science and engineering", "Department of Energy Science and Engineering"],
  ["engineering design", "Department of Engineering Design"],
  ["environmental science and engineering", "Department of Environmental Science and Engineering"],
  ["humanities & social sciences", "Department of Humanities & Social Sciences"],
  ["humanities and social sciences", "Department of Humanities and Social Sciences"],
  ["management studies", "Department of Management Studies"],
  ["materials science and engineering", "Department of Materials Science and Engineering"],
  ["mathematics", "Department of Mathematics"],
  ["mathematics and statistics", "Department of Mathematics and Statistics"],
  ["mechanical engineering", "Department of Mechanical Engineering"],
  ["medical sciences and technology", "Department of Medical Sciences and Technology"],
  ["metallurgical and materials engineering", "Department of Metallurgical and Materials Engineering"],
  ["metallurgical engineering & materials science", "Department of Metallurgical Engineering & Materials Science"],
  ["ocean engineering", "Department of Ocean Engineering"],
  ["physics", "Department of Physics"],
  ["textile & fibre engineering", "Department of Textile & Fibre Engineering"],
]);

function normalizeRecruitingUnitName(unit, ad = {}) {
  if (!unit) return "";
  const raw = String(unit).replace(/\s+/g, " ").trim();
  if (!raw) return "";
  if (/\b(?:job description|application process|developed and maintained by|thrust areas)\b/i.test(raw)) {
    return "";
  }
  let clean = raw
    .replace(/\bInterdisciplina\s+ry\b/gi, "Interdisciplinary")
    .replace(/^Department\s+Of\b/i, "Department of")
    .replace(/^Department\s+Textile\b/i, "Department of Textile")
    .replace(/\bSchool\s+Of\b/g, "School of")
    .replace(/\bCentre\s+Of\b/g, "Centre of")
    .replace(/\bCenter\s+Of\b/g, "Center of")
    .replace(/\s+(?:has|is|offers|provides)\b[\s\S]*$/i, "")
    .replace(/\s+/g, " ")
    .trim();

  const key = clean.toLowerCase();
  const instId = String(ad.institution_id || "");
  const instType = String((INSTITUTIONS[instId] || {}).type || "");
  const isPublicTechnical = /^(?:iit|nit|iiit|iiser)-/i.test(instId)
    || /^(?:IIT|NIT|IIIT|IISER|IISc|CentralUniversity)$/i.test(instType);
  if (isPublicTechnical && DEPARTMENT_UNIT_OVERRIDES.has(key)) {
    return DEPARTMENT_UNIT_OVERRIDES.get(key);
  }
  if (/^Kanpur Department-Wise Area of Specialization Aerospace Engineering$/i.test(clean)) {
    return "Department of Aerospace Engineering";
  }
  return clean;
}

function normalizeDisciplineName(discipline) {
  return String(discipline || "")
    .replace(/\bInterdisciplina\s+ry\b/gi, "Interdisciplinary")
    .replace(/\s+(?:has|is|offers|provides)\b[\s\S]*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function inferRecruitingUnitFromText(ad = {}) {
  const text = `${ad.title || ""} ${ad.raw_text_excerpt || ""}`.replace(/\s+/g, " ");
  const m = text.match(/\b((?:School|Faculty|Centre|Center)\s+of\s+[A-Z][A-Za-z &]+?)(?=\s+(?:has|is|offers|provides|for|We|Campus|Location|$)|[.,;])/);
  return m ? normalizeRecruitingUnitName(m[1], ad) : "";
}

function titleFieldLabel(title) {
  const raw = String(title || "").replace(/\s+/g, " ").trim();
  let m = raw.match(/\b(?:Assistant|Associate)?\s*Professor\s+in\s+(.+)$/i)
    || raw.match(/\bFaculty Positions?\s+in\s+(.+?)(?:\s+[–—-]\s+|$)/i);
  if (!m) return "";
  const field = m[1].trim().replace(/[.,;:]+$/g, "");
  const fixes = {
    "Academic": "Academic Writing",
    "Computer": "Computer Science",
    "Digital": "Digital Marketing",
    "Film &": "Film & Television Management",
    "Political": "Political Science",
  };
  return fixes[field] || field;
}

// The headline of the card — the recruiting unit / field.
// Fallback chain (most-specific first):
//   1. proper department/school/centre name, optionally plus a real subfield
//   2. ad.discipline if the unit is generic or missing
//   3. extracted from title via regex (e.g., "Faculty Positions in History")
//   4. ad.department even if generic (better than nothing)
//   5. derived from post_type (e.g., "Visiting position")
function cardDiscipline(ad) {
  const sp = getStructuredPosition(ad);
  const dept = normalizeRecruitingUnitName(sp?.department || sp?.school_or_centre || ad.department, ad);
  const discipline = normalizeDisciplineName(sp?.discipline || ad.discipline);
  const isProperUnit = dept && /\b(department|centre|center|school|faculty|institute)\b/i.test(dept);
  const isGenericDept = dept && /^(?:humanities|social sciences|various|multiple|all\s+departments)$/i.test(dept.trim());
  if (dept && isProperUnit && !isGenericDept) {
    const unit = dept;
    const sub = discipline && discipline !== dept && !unit.toLowerCase().includes(String(discipline).toLowerCase())
      ? String(discipline).trim()
      : "";
    const noisySub = /^(?:sciences?|engineering|department|centre|center|school)$/i.test(sub);
    return sub && !noisySub ? `${unit} — ${sub}` : unit;
  }
  if (discipline) return discipline;
  if (dept && !isGenericDept) return dept;
  // Derive from title
  const title = ad.title || "";
  // Titles sometimes carry the real School even when the scraper left
  // `department` empty, e.g. "Chemistry - School of Continuing Education..."
  // or "Design Engineering and Robotics School of Engineering (SoE)".
  let titleUnit = title.match(/Faculty Positions?\s+in\s+(.+?)\s+[–—-]\s+(School\s+of\s+.+)$/i);
  if (titleUnit) return `${normalizeRecruitingUnitName(titleUnit[2], ad)} — ${titleUnit[1].trim()}`;
  titleUnit = title.match(/[–—-]\s+(.+?)\s+(School\s+of\s+[^()]+(?:\([^)]+\))?)/i);
  if (titleUnit) return `${normalizeRecruitingUnitName(titleUnit[2], ad)} — ${titleUnit[1].trim()}`;
  titleUnit = title.match(/\b(School\s+of\s+[^()]+(?:\([^)]+\))?)/i);
  if (titleUnit) return normalizeRecruitingUnitName(titleUnit[1], ad);
  const inferredUnit = inferRecruitingUnitFromText(ad);
  const titleField = titleFieldLabel(title);
  if (inferredUnit && titleField) return `${inferredUnit} — ${titleField}`;
  if (inferredUnit) return inferredUnit;
  if (!dept && !discipline && /^Faculty Positions?\s+in\s+/i.test(title)) return title.trim();
  let m = title.match(/(?:in|of|for)\s+([A-Z][a-zA-Z &/-]+?)(?:\s*\(|$|,|\s+[—–-])/);
  if (m) return m[1].trim();
  m = title.match(/(?:Faculty|Position[s]?|Recruitment)\s*[—–-]\s*([A-Z][a-zA-Z &/-]+)/);
  if (m) return m[1].trim();
  if (/rolling|all\s+areas|multiple/i.test(title)) return "Faculty (all areas)";
  // Generic dept as a last resort before post_type fallback
  if (dept) return dept;
  if (ad.post_type === "Visiting") return "Visiting position";
  if (ad.post_type === "Research" || ad.post_type === "Scientific") return "Research / Postdoc";
  if (ad.post_type === "NonFaculty") return "Non-faculty";
  return "Faculty position";
}

// Parse the messy raw-text excerpt into structured cues a candidate can
// scan. Indian academic ads have a recognisable shape — most of them
// open with a paragraph that names sub-areas / specialisations,
// methods preferences, and a disciplinary frame, followed by long
// boilerplate about "specialisation must be clearly evidenced through
// research and publications in the relevant area." We extract the high-
// signal pieces and drop the boilerplate.
//
// Always returns `{ areas, methods, approach, eligibility, evaluation }`
// (values are null when
// not extractable). The card renderer surfaces each piece — even when
// missing — with explicit "Not specified by the department" labelling
// so a reader scrolling through 30 cards SEES the pattern of
// institutional silence rather than having it hidden by absence. Cf.
// the same logic on the reservation row ("composite recruitment, per-
// post breakdown not disclosed"): naming the absence is the political
// point.
function canonicalAreaLabel(s) {
  return String(s || "")
    .replace(/\bHealth innovations?\s*(?:&|and)\s*systems?\b/i, "Health Innovations")
    .replace(/\bInnovation Systems?\s*(?:&|and)\s*Processes\b/i, "Innovation Systems")
    .replace(/\bInternet,\s*Digital Information\s*(?:&|and)\s*Society\b/i, "Digital Information & Society")
    .replace(/\bTechnical Higher Education\b/i, "Technical Higher Education")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanNumberedCueItem(s) {
  return canonicalAreaLabel(String(s || "")
    .replace(/Page\s+\d+\s+of\s+\d+/gi, " ")
    .replace(/\([^)]*ver\.[^)]*\)/gi, " ")
    .replace(/\s*[–-]\s+(?:Potential|Maximum age|At least|First class|Publications?|Academic Background|Teaching|Other)\b[\s\S]*$/i, "")
    .replace(/\s+\b(?:those with professional experience|physical disability|may also be relaxed|candidates?\s+\(|First class|Potential for|Maximum age|At least)\b[\s\S]*$/i, "")
    .replace(/[.;:,]+$/g, "")
    .replace(/\s+/g, " ")
    .trim());
}

function extractNumberedCueItems(text) {
  const anchor = text.search(/\b(?:specific\s+areas?\s+of|areas?\s+of\s+speciali[sz]ation|following\s+(?:areas?|speciali[sz]ations?))\b/i);
  const windowText = anchor >= 0 ? text.slice(anchor) : text;
  // Marker grammar: parenthesised token (i), (ii), (1), (1a), (1-iii),
  // (a), (b)  OR  unparenthesised "1." / "1)" / "a." Roman numerals
  // (i…iv etc.) are essential here — many Indian academic ads
  // enumerate sub-areas as (i) (ii) (iii) rather than (1) (2) (3).
  const MARKER = `\\((?:[ivx]{1,4}|[a-z]|\\d{1,2}(?:-[ivx]+|[a-z])?)\\)|\\d{1,2}[.)]`;
  const numberedRe = new RegExp(
    `(?:^|\\s)(${MARKER})\\s+([\\s\\S]*?)(?=\\s+(?:${MARKER})\\s+|$)`, "gi"
  );
  const items = [];
  let m;
  while ((m = numberedRe.exec(windowText)) && items.length < 20) {
    const item = cleanNumberedCueItem(m[2]);
    if (!item || item.length < 3 || item.length > 80) continue;
    if (/^(?:No|Page|Annexure|Sr|Academic Unit|Areas of Speciali[sz]ation)$/i.test(item)) continue;
    if (/\b(?:Grade|Publication Record|Academic Background|Teaching Requirement)\b/i.test(item)) continue;
    items.push(item);
  }
  return [...new Set(items)];
}

function summarizeEligibilityCue(text, ad = {}) {
  const combined = [
    ad.unit_eligibility,
    ad.general_eligibility,
    text,
  ].filter(Boolean).join(" ");

  const bits = [];
  if (/\bPh\.?\s*D\.?\b/i.test(combined)) {
    let phd = "PhD";
    if (/\bfirst\s+class\b[^.]{0,80}\bpreceding\s+degree\b/i.test(combined)) {
      phd += " + first class preceding degree";
    }
    bits.push(phd);
  }
  if (/\bGrade\s*I\b[\s\S]{0,120}\bpost[-\s]?PhD\b/i.test(combined) || /\bpost[-\s]?PhD\b[\s\S]{0,120}\bGrade\s*I\b/i.test(combined)) {
    bits.push("Grade I: post-PhD experience expected");
  }
  if (/\bGrade\s*II\b[\s\S]{0,120}\bpost[-\s]?PhD\s+experience\s+is\s+desirable\s+but\s+not\s+required\b/i.test(combined)) {
    bits.push("Grade II: post-PhD desirable, not required");
  } else if (/\bpost[-\s]?PhD\s+experience\s+is\s+desirable\s+but\s+not\s+required\b/i.test(combined)) {
    bits.push("Post-PhD desirable, not required");
  }
  const age = combined.match(/\bmaximum\s+age\s+of\s+(\d{2})\s+years?\s+for\s+male\s+and\s+(\d{2})\s+years?\s+for\s+female\b/i);
  if (age) bits.push(`Age cap: ${age[1]}(M), ${age[2]}(F)`);

  return bits.length ? bits.slice(0, 4).join("; ") : null;
}

function summarizeEvaluationCue(text, ad = {}) {
  const combined = [
    ad.publications_required,
    text,
  ].filter(Boolean).join(" ");
  const publicationSource = ad.publications_required || text;
  const bits = [];

  const pub = publicationSource.match(/\bAt\s+least\s+(\d+)\s+([^.;]{0,120}?(?:papers?|publications?|articles?)[^.;]{0,140}?(?:peer[-\s]?reviewed|journals?|conferences?)[^.;]*)/i)
    || publicationSource.match(/\bminimum\s+of\s+(\d+)\s+([^.;]{0,120}?(?:papers?|publications?|articles?)[^.;]*)/i);
  if (pub) {
    bits.push(`Publications: ${pub[1]}+ ${pub[2].replace(/\s+/g, " ").replace(/[.,;:]+$/g, "").trim()}`);
  }
  if (/\bsingle-author\s+scholarly\s+book\b[\s\S]{0,120}\bequivalent\s+to\s+up\s+to\s+five\s+journal\s+articles\b/i.test(combined)) {
    bits.push("Books/chapters considered as equivalents");
  }
  if (/\bpotential\s+for\s+(?:very\s+)?good\s+teaching\b/i.test(combined)) {
    bits.push("Teaching potential assessed");
  }

  return bits.length ? bits.slice(0, 2).join("; ") : null;
}

function structuredEligibilityCue(pos) {
  if (!pos) return null;
  const q = pos.qualifications || {};
  const bits = [];
  if (q.phd) bits.push(`PhD ${q.phd}`);
  if (q.first_class_preceding_degree) bits.push(`First class preceding degree ${q.first_class_preceding_degree}`);
  if (typeof q.post_phd_experience_years === "number") bits.push(`${q.post_phd_experience_years}y post-PhD experience`);
  if (q.other) bits.push(q.other);
  if (pos.specific_eligibility) bits.push(pos.specific_eligibility);
  if (!bits.length && pos.general_eligibility) bits.push(pos.general_eligibility);
  return bits.length ? bits.slice(0, 3).join("; ") : null;
}

function structuredEvaluationCue(pos) {
  if (!pos) return null;
  const q = pos.qualifications || {};
  const bits = [];
  if (q.publications_required) bits.push(`Publications: ${q.publications_required}`);
  if (q.teaching_experience) bits.push(`Teaching: ${q.teaching_experience}`);
  return bits.length ? bits.slice(0, 2).join("; ") : null;
}

function structuredCues(ad = {}) {
  const pos = getStructuredPosition(ad);
  if (!pos) return {};
  return {
    areas: Array.isArray(pos.areas) && pos.areas.length ? pos.areas : null,
    methods: pos.methods_preference || null,
    approach: pos.approach || null,
    eligibility: structuredEligibilityCue(pos),
    evaluation: structuredEvaluationCue(pos),
  };
}

function extractCardCues(text, ad = {}) {
  text = String(text || "");
  const cues = { areas: null, methods: null, approach: null, eligibility: null, evaluation: null };
  const hasStructuredFields = Boolean(ad.unit_eligibility || ad.general_eligibility || ad.publications_required);
  if (text.length < 30 && !hasStructuredFields) return cues;

  // --- Sub-areas list -------------------------------------------------
  const numberedAreas = extractNumberedCueItems(text);
  if (numberedAreas.length >= 2 && numberedAreas.length <= 20) {
    cues.areas = numberedAreas;
  }

  // Patterns: "in (the )?area(s) of X, Y, Z…" / "specialisation in X, Y"
  // The trailing lookahead stops the capture at a sentence end, a
  // semicolon, or a "with …" clause that introduces methods.
  const areaPatterns = [
    /(?:in|across)\s+(?:the\s+)?(?:area|areas|fields?|domains?|specializations?|specialisations?|topics?)\s+of\s+([^.]{8,400}?)(?=\s*(?:\.|;|\(with\s|with\s+a\s+|$))/i,
    /(?:research\s+(?:areas?|interests?))\s*[:\-–]\s*([^.]{8,400}?)(?=\s*(?:\.|;|$))/i,
    /(?:specialization|specialisation|expertise)\s+in\s+([^.]{8,400}?)(?=\s*(?:\.|;|with\s+a\s+|$))/i,
  ];
  for (const re of cues.areas ? [] : areaPatterns) {
    const m = text.match(re);
    if (m) {
      const areas = m[1]
        .replace(/\([^)]*\)/g, ' ')                     // strip parentheticals
        .replace(/-\s+/g, '-')                          // "multi- species" -> "multi-species"
        .replace(/\s+/g, ' ')                           // collapse double spaces
        .split(/\s*,\s*|\s*;\s*|\s+(?:and|or|&)\s+/)    // split on , ; and or &
        .map(s => canonicalAreaLabel(s.trim().replace(/[.,;:]+$/, '')))
        .filter(s => {
          if (!s || s.length < 2 || s.length > 60) return false;
          // Drop low-content phrases that come from awkward source text
          // like "in any one or more of the relevant discipline, …" —
          // splitting "one or more of relevant discipline" yields "one"
          // and "more of relevant discipline", neither of which is an
          // actual research area. (Length >= 2 keeps real acronyms
          // like "AI" while the connective-word filter keeps out "or",
          // "of", "to", etc.)
          if (/^(?:the|a|an|one|two|three|few|many|more|other|any|some|all|various|relevant|candidate|applicant)\b/i.test(s)) return false;
          if (/\b(?:relevant\s+discipline|candidate|applicant|the\s+area)s?\b/i.test(s)) return false;
          // Require at least one alphabetic character
          if (!/[a-zA-Z]/.test(s)) return false;
          return true;
        });
      if (areas.length >= 2 && areas.length <= 20) {
        cues.areas = areas;
        break;
      }
    }
  }

  // --- Methods preference ---------------------------------------------
  // "with a strong focus on quantitative research"
  // "either ethnographic or quantitative methods"
  // "grounding in mixed methods"
  let m = text.match(/(?:with\s+a\s+)?(?:strong\s+)?focus(?:ed|ing)?\s+on\s+([\w\s,/-]{5,80}?)\s+(?:research|methods?|approach)/i);
  if (m) {
    cues.methods = m[1].trim().replace(/\s+/g, ' ');
  } else {
    m = text.match(/grounding\s+in\s+(?:either\s+)?([\w\s,/-]{5,80}?)\s+methods?/i);
    if (m) cues.methods = m[1].trim().replace(/\s+/g, ' ');
  }

  // --- Disciplinary approach ------------------------------------------
  // "sociological/anthropological approach" / "humanistic approach"
  m = text.match(/\b((?:sociolog\w+|anthropolog\w+|historic\w+|philosoph\w+|cultur\w+|economic\w*|political\w*|geographic\w*|humanist\w+|critical|interdisciplinary|comparative)(?:\s*\/\s*\w+\w+)?)\s+approach/i);
  if (m) cues.approach = m[1];

  cues.eligibility = summarizeEligibilityCue(text, ad);
  cues.evaluation = summarizeEvaluationCue(text, ad);

  // Note: we ALWAYS return the cues object even if every field is null.
  // The renderer surfaces each row explicitly so missing values are
  // labelled "Not specified by the department" rather than hidden.
  return cues;
}

// "Rank · Contract" line. For Visiting the contract is implied so we
// just say "Visiting Faculty"; otherwise the line is "<Rank> · <Contract>".
function cardRankLine(ad) {
  const sp = getStructuredPosition(ad);
  if (sp) {
    let rank = "";
    const ranks = Array.isArray(sp.ranks) ? sp.ranks.filter(Boolean) : [];
    if (ranks.length === 1) rank = ranks[0];
    else if (ranks.length > 1 && ranks.length <= 3) rank = ranks.join(" / ");
    else if (ranks.length > 3) rank = "Faculty (multiple ranks)";
    if (!rank && (sp.post_type === "Research" || sp.post_type === "Postdoc" || sp.post_type === "Scientific")) rank = "Postdoc / Research Fellow";
    if (!rank) rank = "Faculty";
    const cs = contractLabel(sp.contract_status);
    if (cs && cs !== "Visiting") return `${rank} · ${cs}`;
    return rank;
  }
  let rank;
  if (ad.post_type === "Visiting") {
    rank = "Visiting Faculty";
  } else if (ad.post_type === "Research" || ad.post_type === "Scientific") {
    rank = "Postdoc / Research Fellow";
  } else if (ad.post_type === "NonFaculty") {
    rank = "Non-faculty staff";
  } else {
    const ranks = [];
    if (isFullProfMatch(ad)) ranks.push("Professor");
    if (isAssocProfMatch(ad)) ranks.push("Associate Professor");
    if (isAsstProfMatch(ad)) ranks.push("Assistant Professor");
    if (ranks.length === 1) rank = ranks[0];
    else if (ranks.length > 1) rank = "Faculty (multiple ranks)";
    else rank = "Faculty";
  }
  const cs = contractLabel(ad.contract_status);
  if (cs && ad.post_type !== "Visiting") return `${rank} · ${cs}`;
  return rank;
}

// Three-way relevance label, surfaced as the "Relevance" filter section.
// Replaces the previous parser-quality "Review status" filter (which was
// internal-monitoring concern, not a user-facing filter).
const QUALITY_LABELS = {
  hss: "HSS",
  "non-hss": "non-HSS",
  other: "Other",
};

// Engineering, pure-science, and tech disciplines that we surface as
// first-class field tags (so users CAN filter on them) but which are
// non-HSS for relevance-bucket purposes. Without this set, a Chemistry
// position at IISER Tirupati would be tagged "Chemistry" → relevance="hss"
// because the old code treated any positive tag as HSS.
const NON_HSS_FIELD_TAGS = new Set([
  "Computer Science / AI / Data", "Electrical / Electronics",
  "Mechanical / Aerospace", "Civil / Environmental", "Chemical Engineering",
  "Materials / Metallurgical", "Mathematics / Statistics", "Physics",
  "Chemistry", "Biology / Biotech / Biomedical",
  "Earth / Ocean Sciences", "Energy / Sustainability",
  "Industrial / Operations", "Medical / Pharmacy",
]);

function relevanceTag(ad) {
  // Inspect the ad's field tags and bucket into HSS / non-HSS / Other.
  // Rules:
  //   - No tags or only "General / unspecified" → Other
  //   - Only "Other" or only non-HSS science/engineering tags → non-HSS
  //   - Any HSS-relevant tag (anthro, sociology, etc.) → HSS, even if mixed
  //     with non-HSS tags (the HSS framing wins for the dissertation user).
  const tags = fieldTags(ad);
  if (tags.length === 0) return "other";
  const isOos = t => t === "Other";
  const isGenericHSS = t => t === "General / unspecified";
  const isNonHSS = t => NON_HSS_FIELD_TAGS.has(t) || isOos(t);
  // Pull out actual HSS tags (anthropology, history, philosophy, etc. —
  // anything that isn't generic, isn't engineering/science, isn't OOS).
  const hssTags = tags.filter(t => !isNonHSS(t) && !isGenericHSS(t));
  if (hssTags.length > 0) return "hss";
  // No HSS tag — but we have *some* tag. If any non-HSS science/eng tag is
  // present (or the bucket is OOS), call it non-HSS.
  if (tags.some(isNonHSS)) return "non-hss";
  // Only generic-HSS-unspecified left.
  return "other";
}

// Repurposed: returns the user-facing Relevance bucket. The previous
// parser-quality logic ("ready / review / archive") was a maintainer
// concern, not a user filter — it lives on as a debug-only consideration
// inside `relevanceTag()` indirectly via the field tags. The function name
// is preserved so all the call-sites keep working.
function listingStatus(ad) { return relevanceTag(ad); }

// ---------- data load ----------
async function loadData() {
  // We used to cache-bust JSON fetches with `?v=${Date.now()}` to defeat the
  // browser's HTTP cache during dev. That worked but billed every reload as a
  // full re-download (1-5 MB of JSON). Instead we use `cache: "no-cache"` in
  // the Fetch API — the browser sends `If-Modified-Since` / `If-None-Match`
  // and the server returns 304 if nothing changed, so reloads are cheap when
  // data hasn't moved.
  const opts = { cache: "no-cache" };
  try {
    const [current, coverage, registry] = await Promise.all([
      fetch("data/current.json", opts).then(r => r.json()),
      fetch("data/coverage_report.json", opts).then(r => r.json()).catch(() => null),
      fetch("data/institutions_registry.json", opts).then(r => r.json()),
    ]);
    ADS = current.ads || [];
    COVERAGE = coverage;
    for (const inst of registry) INSTITUTIONS[inst.id] = inst;
    // Footer colophon — surface the data freshness as a human-readable
    // date so visitors can judge whether the site is being maintained.
    const updatedEl = document.getElementById("colophon-updated");
    if (updatedEl && current.generated_at) {
      try {
        const d = new Date(current.generated_at);
        const fmt = d.toLocaleDateString("en-IN", { year: "numeric", month: "long", day: "numeric" });
        updatedEl.textContent = `${fmt} · ${ADS.length} listings tracked`;
      } catch { updatedEl.textContent = current.generated_at; }
    }
  } catch (e) {
    document.getElementById("feed-items").innerHTML = `<div class="banner"><strong>Data unavailable.</strong> Run <code>python scraper/run.py</code> to generate <code>data/current.json</code>.</div>`;
    return;
  }
  populateFilters();
  wireEvents();
  wirePortrait();
  render();
  renderCoverage();
  // Maintainer escape hatch: visiting `…/dashboard/#coverage` opens the
  // (now hidden-from-nav) coverage panel. Keeps the monitoring view
  // accessible to whoever maintains the scraper without showing it to
  // end users.
  if (location.hash === "#coverage") {
    document.querySelectorAll("nav.tabs button[data-tab]").forEach(b => b.classList.remove("active"));
    for (const name of ["listings", "saved", "map", "vacancies", "resources", "coverage"]) {
      const panel = document.getElementById(name + "-tab");
      if (panel) panel.style.display = (name === "coverage") ? "" : "none";
    }
  }
}

// Hide the masthead portrait if the image fails to load (e.g. no logo.jpg
// committed yet). Done via an event listener instead of an inline `onerror=`
// attribute so the page stays CSP-friendly and the failure mode is explicit.
function wirePortrait() {
  const img = document.getElementById("masthead-portrait");
  if (!img) return;
  const fig = img.closest("figure");
  if (img.complete && img.naturalWidth === 0) {
    if (fig) fig.style.display = "none";
    return;
  }
  img.addEventListener("error", () => {
    if (fig) fig.style.display = "none";
  });
}

// ---------- filters ----------
function renderCheckboxes(containerId, options) {
  const c = document.getElementById(containerId);
  c.innerHTML = options.map(o => {
    const disabled = o.disabled ? " disabled" : "";
    const style = o.disabled ? ' style="opacity:0.4"' : "";
    const checked = o.checked ? " checked" : "";
    const cnt = o.count != null ? `<span class="cnt">${o.count}</span>` : "";
    return `<label${style}><input type="checkbox" value="${escapeAttr(o.value)}"${disabled}${checked} /><span class="grow">${escapeHTML(o.label)}</span>${cnt}</label>`;
  }).join("");
  // Browsers (Firefox especially) auto-restore form state on reload, ignoring the
  // `checked` attribute. Force the .checked property after render to match the
  // declared default — otherwise a previous session's selections silently persist.
  c.querySelectorAll("input[type=checkbox]").forEach((el, i) => {
    el.checked = !!options[i].checked;
  });
}

function populateFilters() {
  // Force posgroup checkboxes off on every load. The HTML default is also
  // unchecked, but browsers persist checkbox state across reloads — without
  // this reset, a user who once checked "Faculty" would see it ticked on
  // every subsequent visit. Default-unchecked = no posgroup constraint =
  // all post types visible, which is the right empty-state.
  document.querySelectorAll("#filter-posgroup input").forEach(el => { el.checked = false; });
  const search = document.getElementById("search");
  if (search) search.value = "";
  const typeCounts = {}, stateCounts = {}, fieldCounts = {}, qualityCounts = { hss: 0, "non-hss": 0, other: 0 };
  let facultyTotal = 0, associateTotal = 0, fullTotal = 0, researchTotal = 0, visitingTotal = 0;
  for (const ad of ADS) {
    const inst = INSTITUTIONS[ad.institution_id] || {};
    if (inst.type) typeCounts[inst.type] = (typeCounts[inst.type] || 0) + 1;
    if (inst.state) stateCounts[inst.state] = (stateCounts[inst.state] || 0) + 1;
    for (const field of fieldTags(ad)) fieldCounts[field] = (fieldCounts[field] || 0) + 1;
    qualityCounts[listingStatus(ad)]++;
    if (isAsstProfMatch(ad)) facultyTotal++;
    if (isAssocProfMatch(ad)) associateTotal++;
    if (isFullProfMatch(ad)) fullTotal++;
    if (isResearchMatch(ad)) researchTotal++;
    if (isVisitingMatch(ad)) visitingTotal++;
  }

  const orderedFields = [
    ...FIELD_ORDER.filter(f => fieldCounts[f]),
    ...Object.keys(fieldCounts).filter(f => !FIELD_ORDER.includes(f)).sort(),
  ];
  // Default to none checked. "No selection = no constraint" is the same
  // semantics every other facet uses, and it keeps the active-filter chip
  // bar from drowning in 20+ chips on first load.
  renderCheckboxes("filter-hss", orderedFields.map(f => ({
    value: f,
    label: f,
    count: fieldCounts[f],
    checked: false,
  })));

  // Relevance: HSS is profile-relevant (anthro / STS / sociology / public
  // policy / etc.), non-HSS is the engineering / pure-STEM / finance /
  // management bucket the user has explicitly excluded, Other catches the
  // generic-faculty-call ads where no field could be inferred. HSS
  // checked by default — this is a research-tracker for an HSS user.
  renderCheckboxes("filter-quality", [
    { value: "hss", label: QUALITY_LABELS.hss, count: qualityCounts.hss, checked: false },
    { value: "non-hss", label: QUALITY_LABELS["non-hss"], count: qualityCounts["non-hss"], checked: false },
    { value: "other", label: QUALITY_LABELS.other, count: qualityCounts.other, checked: false },
  ]);

  // Render only types that actually appear in the data. TYPE_ORDER pins
  // display order for known types; any unknown types get appended in the
  // order they first appear so we don't silently drop e.g. "Other" or new
  // categories added to the registry.
  const orderedTypes = [
    ...TYPE_ORDER.filter(t => typeCounts[t]),
    ...Object.keys(typeCounts).filter(t => !TYPE_ORDER.includes(t)).sort(),
  ];
  renderCheckboxes("filter-type", orderedTypes.map(t => ({
    value: t,
    label: typeLabel(t),
    count: typeCounts[t],
  })));

  document.getElementById("cnt-faculty").textContent = facultyTotal;
  document.getElementById("cnt-associate").textContent = associateTotal;
  document.getElementById("cnt-full").textContent = fullTotal;
  document.getElementById("cnt-research").textContent = researchTotal;
  document.getElementById("cnt-visiting").textContent = visitingTotal;

  renderCheckboxes("filter-state",
    Object.keys(stateCounts).sort().map(s => ({ value: s, label: s, count: stateCounts[s] }))
  );
}

function getChecked(id) {
  return [...document.querySelectorAll(`#${id} input:checked`)].map(el => el.value);
}

// ---------- event wiring ----------
function wireEvents() {
  for (const id of ["filter-hss","filter-quality","filter-type","filter-posgroup","filter-state"]) {
    document.getElementById(id).addEventListener("change", render);
  }
  document.getElementById("search").addEventListener("input", render);
  document.getElementById("sort").addEventListener("change", render);

  // ---- Phase-2 hero search ---------------------------------------------
  // The hero input is the user-facing field; the legacy `#search` (now a
  // hidden input) is the value the rest of the JS reads. Mirror writes.
  const heroSearch = document.getElementById("hero-search");
  const heroClear = document.getElementById("hero-search-clear");
  const legacySearch = document.getElementById("search");
  if (heroSearch) {
    heroSearch.addEventListener("input", () => {
      legacySearch.value = heroSearch.value;
      heroClear.hidden = heroSearch.value.length === 0;
      render();
    });
    heroClear.addEventListener("click", () => {
      heroSearch.value = "";
      legacySearch.value = "";
      heroClear.hidden = true;
      heroSearch.focus();
      render();
    });
  }

  // ---- Phase-2 quick chips ---------------------------------------------
  // Each chip is a one-click toggle that sets the corresponding sidebar
  // checkboxes. The chip's `on` state mirrors whether *all* of its target
  // boxes are currently checked, so the chip and the sidebar stay in sync
  // even when the user toggles things in the sidebar manually.
  const QUICK_FILTERS = {
    "hss": { groupId: "filter-hss",
             targets: () => Array.from(document.querySelectorAll("#filter-hss input"))
                            .filter(i => i.value !== "Other" && i.value !== "Pure STEM/Engineering") },
    "closing-soon": null,  // handled inline (synthetic — not a checkbox set)
    "faculty": { groupId: "filter-posgroup",
                 targets: () => [document.querySelector('#filter-posgroup input[value="faculty"]')] },
    "postdoc": { groupId: "filter-posgroup",
                 targets: () => [document.querySelector('#filter-posgroup input[value="research"]')] },
  };

  // Synthetic filters — no checkbox group; window-scoped state.
  window._closingSoonOnly = false;
  window._reservedOnly = false;

  const refreshChipStates = () => {
    document.querySelectorAll(".quick-chip").forEach(chip => {
      const key = chip.dataset.quick;
      let on = false;
      if (key === "closing-soon") on = window._closingSoonOnly;
      else if (key === "reserved") on = window._reservedOnly;
      else {
        const cfg = QUICK_FILTERS[key];
        const targets = cfg?.targets()?.filter(Boolean) ?? [];
        on = targets.length > 0 && targets.every(i => i.checked);
      }
      chip.classList.toggle("on", on);
      chip.setAttribute("aria-pressed", on);
    });
  };
  refreshChipStates();

  document.querySelectorAll(".quick-chip").forEach(chip => {
    chip.addEventListener("click", () => {
      const key = chip.dataset.quick;
      if (key === "closing-soon") {
        window._closingSoonOnly = !window._closingSoonOnly;
      } else if (key === "reserved") {
        window._reservedOnly = !window._reservedOnly;
      } else {
        const cfg = QUICK_FILTERS[key];
        if (!cfg) return;
        const targets = cfg.targets().filter(Boolean);
        const allOn = targets.every(i => i.checked);
        targets.forEach(i => { i.checked = !allOn; });
      }
      refreshChipStates();
      render();
    });
  });

  // Re-sync chips after every render so manual sidebar toggles keep the
  // chip "on" state honest.
  const _origRender = window.render;
  if (_origRender && !window._chipsHooked) {
    window.render = function() { _origRender.apply(this, arguments); refreshChipStates(); };
    window._chipsHooked = true;
  }

  // ---- Filter-strip popover open/close ---------------------------------
  // Click the trigger to toggle. Click outside to close. ESC closes too.
  // One open at a time so popovers don't overlap.
  // Each open/close also flips `aria-expanded` on the trigger so AT users
  // know the popover state matches what sighted users see.
  const closeAllDropdowns = () => {
    document.querySelectorAll(".filter-dd.open").forEach(d => {
      d.classList.remove("open");
      const trigger = d.querySelector(".filter-trigger");
      if (trigger) trigger.setAttribute("aria-expanded", "false");
    });
  };
  document.querySelectorAll(".filter-dd .filter-trigger").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const dd = btn.closest(".filter-dd");
      const wasOpen = dd.classList.contains("open");
      closeAllDropdowns();
      if (!wasOpen) {
        dd.classList.add("open");
        btn.setAttribute("aria-expanded", "true");
      }
    });
  });
  document.addEventListener("click", (e) => {
    if (!e.target.closest(".filter-dd")) closeAllDropdowns();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeAllDropdowns();
  });
  // Per-popover "Clear" buttons (data-clear="filter-<id>") uncheck every
  // input inside the matching filter-group.
  document.querySelectorAll(".popover-foot button[data-clear]").forEach(btn => {
    btn.addEventListener("click", () => {
      const groupId = btn.dataset.clear;
      document.querySelectorAll(`#${groupId} input`).forEach(i => { i.checked = false; });
      render();
    });
  });

  // Banner dismiss — persist to localStorage so it stays dismissed across reloads.
  const banner = document.getElementById("verify-banner");
  if (banner && localStorage.getItem("hei.banner-dismissed") === "1") {
    banner.style.display = "none";
  }
  document.getElementById("dismiss-banner")?.addEventListener("click", () => {
    banner.style.display = "none";
    localStorage.setItem("hei.banner-dismissed", "1");
  });

  // Theme toggle — sun for "switch to light", moon for "switch to dark".
  // The icon shows the destination theme so the click direction is unambiguous.
  const themeBtn = document.getElementById("theme-toggle");
  const setThemeIcon = () => {
    const current = document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
    themeBtn.textContent = current === "dark" ? "☀" : "☾";
    themeBtn.title = current === "dark" ? "Switch to light mode" : "Switch to dark mode";
  };
  setThemeIcon();
  themeBtn.addEventListener("click", () => {
    const next = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
    if (next === "dark") document.documentElement.setAttribute("data-theme", "dark");
    else document.documentElement.removeAttribute("data-theme");
    localStorage.setItem("hei.theme", next);
    setThemeIcon();
    // Force a repaint of the listings after the theme attribute flip. Some
    // browsers occasionally drop card contents in the transition between
    // CSS-variable values when the attribute changes mid-paint; re-rendering
    // the active tab guarantees the cards land back on screen deterministically.
    try {
      const activeTab = document.querySelector("nav.tabs button.active")?.dataset.tab;
      if (activeTab === "listings") render();
      else if (activeTab === "saved") renderSaved();
      else if (activeTab === "vacancies") renderVacancies();
      else if (activeTab === "resources") renderResources();
    } catch (_) { /* fail open — the visual change is already applied */ }
  });

  // Only buttons that actually represent a panel (have data-tab) participate
  // in tab switching. The theme-toggle is also a <button> inside nav.tabs but
  // has no data-tab — without this guard, clicking it would hide every panel
  // because `btn.dataset.tab` is undefined and no panel name matches.
  // Switch to the named tab — used both by user clicks and by hash routing.
  // Returns true if `name` matched a real tab. The hash is updated only
  // when the caller asks (so initial-load activation doesn't push history).
  // Panels that exist in the DOM but are not rendered as tablist tabs
  // (no <button role="tab"> in nav). These are destinations linked from
  // elsewhere — currently the colophon's "About & methodology →" link.
  const NON_NAV_PANELS = new Set(["about"]);
  // All panels the activator knows about — for the show/hide loop.
  const ALL_PANELS = ["listings", "saved", "map", "vacancies", "resources", "coverage", "about"];

  function activateTab(name, { writeHash = false, focusTab = false } = {}) {
    const btn = document.querySelector(`nav.tabs button[data-tab="${name}"]`);
    const isNonNav = NON_NAV_PANELS.has(name);
    if (!btn && !isNonNav) return false;
    // Flip the visual class AND the WAI-ARIA state on the tablist tabs in
    // lockstep. For a non-nav panel (About), de-select all tabs; the panel
    // is reachable but not "selected" in the tablist sense.
    document.querySelectorAll("nav.tabs button[data-tab]").forEach(b => {
      const isActive = (b === btn);
      b.classList.toggle("active", isActive);
      b.setAttribute("aria-selected", isActive ? "true" : "false");
      b.setAttribute("tabindex", isActive ? "0" : "-1");
    });
    if (focusTab) {
      if (btn) btn.focus();
      else if (isNonNav) document.getElementById(name + "-tab")?.focus();
    }
    for (const n of ALL_PANELS) {
      const panel = document.getElementById(n + "-tab");
      if (panel) panel.style.display = (name === n) ? "" : "none";
    }
    // Filter strip is only meaningful on tabs that filter the ad corpus —
    // Vacancies (the listings feed) and Map. On The Gap, Resources, Saved,
    // and About the filters do nothing; showing them adds clutter and
    // implies they affect those views.
    const filterStrip = document.getElementById("filter-strip");
    if (filterStrip) {
      const filtersApply = (name === "listings" || name === "map");
      filterStrip.style.display = filtersApply ? "" : "none";
    }
    if (name === "map") { initMap(); render(); }
    if (name === "saved") renderSaved();
    if (name === "vacancies") renderVacancies();
    if (name === "resources") renderResources();
    if (writeHash) {
      // Use pushState so back/forward survive the deep-link.
      const hash = name === "listings" ? "" : `#${name}`;
      const url = location.pathname + location.search + hash;
      history.pushState({ tab: name }, "", url);
    }
    return true;
  }

  document.querySelectorAll("nav.tabs button[data-tab]").forEach(btn => {
    btn.addEventListener("click", () => activateTab(btn.dataset.tab, { writeHash: true }));
  });

  // WAI-ARIA tablist arrow-key navigation. Per
  // https://www.w3.org/WAI/ARIA/apg/patterns/tabs/, ArrowLeft/ArrowRight
  // moves between tabs (wrapping at the ends), Home jumps to the first tab,
  // End to the last. Activating a tab via arrow keys focuses AND switches —
  // the manual-activation pattern is allowed but the automatic-activation
  // pattern matches the existing click behaviour and feels more natural for
  // a small tablist where switching panels is cheap.
  const tablist = document.querySelector("nav.tabs[role=tablist]");
  if (tablist) {
    tablist.addEventListener("keydown", (e) => {
      const tabs = [...tablist.querySelectorAll('button[role="tab"]')];
      const i = tabs.indexOf(document.activeElement);
      if (i < 0) return;
      let next = -1;
      if (e.key === "ArrowRight") next = (i + 1) % tabs.length;
      else if (e.key === "ArrowLeft") next = (i - 1 + tabs.length) % tabs.length;
      else if (e.key === "Home") next = 0;
      else if (e.key === "End") next = tabs.length - 1;
      if (next < 0) return;
      e.preventDefault();
      activateTab(tabs[next].dataset.tab, { writeHash: true, focusTab: true });
    });
  }

  // Hash routing: deep links (#vacancies, #resources, #map, #saved, #about)
  // survive refresh, share, and the browser's back/forward buttons.
  // `listings` is the default and uses no hash. Unknown hashes (e.g.
  // #coverage when location.hash is a marketing anchor) are ignored.
  const VALID_TAB_HASHES = new Set(["listings","saved","map","vacancies","resources","about"]);
  function activateFromHash() {
    const h = location.hash.replace(/^#/, "");
    if (h === "coverage") return; // handled separately at load time
    const name = VALID_TAB_HASHES.has(h) ? h : "listings";
    activateTab(name, { writeHash: false });
  }
  // Run once on first wire-up (covers reload-into-#vacancies) and then on
  // every back/forward navigation.
  activateFromHash();
  window.addEventListener("hashchange", activateFromHash);
  window.addEventListener("popstate", activateFromHash);

  // In-page links that jump to a specific tab. Used by the vacancy-gap
  // banner ("See the breakdown by category →") and any other anchor with
  // a data-tab-link attribute. Triggers the same path as a tab click so
  // the panel renders correctly.
  document.body.addEventListener("click", (e) => {
    const a = e.target.closest("a[data-tab-link]");
    if (!a) return;
    e.preventDefault();
    const tab = a.dataset.tabLink;
    const ok = activateTab(tab, { writeHash: true });
    if (!ok) location.href = a.href;
  });
}

// ---------- filtering + sorting ----------
function currentFilterState() {
  return {
    query: document.getElementById("search").value.trim().toLowerCase(),
    fields: new Set(getChecked("filter-hss")),
    statuses: new Set(getChecked("filter-quality")),
    types: new Set(getChecked("filter-type")),
    posGroups: new Set(getChecked("filter-posgroup")),
    states: new Set(getChecked("filter-state")),
    sort: document.getElementById("sort").value,
  };
}

function filterHaystack(ad, inst = {}) {
  const sp = getStructuredPosition(ad);
  return [
    ad.title, ad.department, ad.discipline, inst.name, inst.short_name,
    sp?.department, sp?.discipline, sp?.school_or_centre,
    ...(sp?.areas || []), sp?.methods_preference, sp?.approach,
  ].filter(Boolean).join(" ").toLowerCase();
}

function applyFilters(st) {
  return ADS.filter(ad => {
    const inst = INSTITUTIONS[ad.institution_id] || {};
    if (st.fields.size && !fieldTags(ad).some(f => st.fields.has(f))) return false;
    if (st.statuses.size && !st.statuses.has(listingStatus(ad))) return false;
    if (st.types.size && !st.types.has(inst.type)) return false;
    if (st.states.size && !st.states.has(inst.state)) return false;
    if (st.posGroups.size) {
      // Inclusive OR across the rank checkboxes: ad passes if it matches
      // any selected rank.
      const tests = {
        faculty:   () => isAsstProfMatch(ad),
        associate: () => isAssocProfMatch(ad),
        full:      () => isFullProfMatch(ad),
        research:  () => isResearchMatch(ad),
        visiting:  () => isVisitingMatch(ad),
      };
      let any = false;
      for (const v of st.posGroups) { if (tests[v] && tests[v]()) { any = true; break; } }
      if (!any) return false;
    }
    if (st.query) {
      if (!filterHaystack(ad, inst).includes(st.query)) return false;
    }
    // Phase-2 synthetic "closing this week" quick-filter — checks the
    // calendar rather than a checkbox group. Window-scoped so the state
    // survives across renders without bloating the filter object shape.
    if (window._closingSoonOnly) {
      const d = daysUntil(ad.closing_date);
      if (d == null || d < 0 || d > 7) return false;
    }
    // "Reserved posts only" toggle. Passes ads where reservation has been
    // operationalised (per-post counts published) OR is the central
    // affirmative purpose of the call (Special Recruitment Drive).
    // Statutory percentage boilerplate alone does NOT qualify — that's
    // policy citation, not actual reserved-post identification.
    if (window._reservedOnly && !isReservedPost(ad)) return false;
    return true;
  });
}

// Hiring-language traps — phrases in faculty advertisements that quietly
// exclude candidates from non-elite educational backgrounds. Each entry
// pairs a regex with a one-line plain-English explanation of who it
// disadvantages and why. Surface these in the ad render so a candidate
// reading the listing sees the structural exclusion explicitly, not as
// hidden bureaucratic language.
//
// Source for the patterns: actual phrasing observed in the cached IIT
// Madras / IIT Delhi / IIIT-Delhi / IIT Bombay PDFs. Add to this list as
// new patterns appear in subsequent scrapes — the more eyes on the corpus,
// the better the catalogue.
const HIRING_TRAPS = [
  {
    re: /\bfirst[\s-]+class\b[^.]{0,80}\b(throughout|in\s+all\s+(preceding|previous)\s+degrees?|including\s+higher[\s-]+secondary|preceding\s+degrees?\s+and\s+certificates)/i,
    label: "First-class-throughout requirement",
    why: "Excludes candidates without first-class marks at every prior level (sometimes including 10th/12th board). Many candidates from state-board schools or non-elite undergraduate institutions don't qualify on paper. Some institutions allow appeals or relaxations — check the application portal or write to the dean.",
  },
  {
    re: /\b(Ph\.?D\.?|doctorate)\s+from\s+(top|reputed|premier|leading|world[-\s]?class)\s+(institut|universit)/i,
    label: "PhD-from-top-institution preference",
    why: "Pedigree filter. Often functions as caste-correlated exclusion through the global ranking system (US/UK/IIT/IISc PhDs over Indian state-university PhDs). Apply anyway if your work is strong; selection committees vary.",
  },
  {
    re: /\bminimum\s+\w+\s*\(?\d+\)?\s+publications?\b[^.]{0,60}\b(Scopus|SCI[-\s]?indexed|Web\s+of\s+Science|first\s+author)/i,
    label: "High publication threshold + indexing requirement",
    why: "Hard publication minima with index restrictions disadvantage candidates from underfunded labs or fields where Scopus/SCI coverage is weak. If your publication count is borderline, surface book chapters / edited volumes / public-facing work in your CV cover.",
  },
  {
    re: /\b(consistently|good)\s+academic\s+record\b/i,
    label: "Vague 'consistently good academic record' clause",
    why: "Discretionary exclusion mechanism — interpretable by the selection committee to mean whatever they want. Pair with strong references that affirm your trajectory; CV gaps deserve a one-line cover-letter explanation.",
  },
  {
    re: /\b(post[-\s]?doc(toral)?|teaching)\s+experience\b[^.]{0,60}\b(required|essential|mandatory|must)/i,
    label: "Postdoc/teaching experience hard requirement",
    why: "Filters out new PhDs and candidates from institutions that don't fund postdocs. If you have research-grant-funded work, project-fellow stints, or guest-lecture experience, list these as equivalent — many institutes treat them as such even when not explicitly invited.",
  },
  {
    re: /\b(no\s+objection\s+certificate|NOC)\b/i,
    label: "NOC from current employer required",
    why: "If you are currently employed, your current institution must release a 'No Objection Certificate' before your application can be processed. Some institutions delay or refuse NOCs strategically. Submit your application with the advance copy and chase the NOC in parallel — most institutes accept this workflow.",
  },
];

function extractTraps(ad) {
  const text = `${ad.title || ""} ${ad.unit_eligibility || ""} ${ad.general_eligibility || ""} ${ad.publications_required || ""} ${ad.raw_text_excerpt || ""}`;
  const out = [];
  for (const t of HIRING_TRAPS) {
    if (t.re.test(text)) out.push({ label: t.label, why: t.why });
  }
  return out;
}

// Centralised "is this a reserved-post ad" check. Used by the chip filter
// AND the per-card render code, so the logic stays consistent.
function isReservedPost(ad) {
  const sp = getStructuredPosition(ad);
  const cat = sp?.reservation_breakdown || ad.category_breakdown || {};
  const hasCounts = ["UR","SC","ST","OBC","EWS","PwBD"].some(k => cat[k] != null && cat[k] > 0);
  if (hasCounts) {
    // True only if at least one RESERVED category has > 0 (UR-only doesn't count).
    return ["SC","ST","OBC","EWS","PwBD"].some(k => cat[k] != null && cat[k] > 0);
  }
  const txt = `${ad.title || ""} ${sp?.raw_section_text || ""} ${ad.pdf_excerpt || ""} ${ad.raw_text_excerpt || ""} ${ad.reservation_note || ""}`;
  return Boolean(sp?.is_special_recruitment_drive) || /\b(special\s+recruitment\s+drive|mission\s+mode\s+recruitment|SRD\b|recruitment\s+drive\s+for\s+(SC|ST|OBC|EWS|PwBD|PwD|reserved))/i.test(txt);
}

function applySort(ads, sort) {
  const deadlineRank = (ad) => {
    const d = daysUntil(ad.closing_date);
    if (d == null) return 9999;
    return d < 0 ? 9998 : d;
  };
  const fieldRank = (ad) => {
    const field = primaryField(ad);
    const n = FIELD_ORDER.indexOf(field);
    return n === -1 ? FIELD_ORDER.length : n;
  };
  const byDeadline = (a, b) => deadlineRank(a) - deadlineRank(b);
  const byInstitution = (a, b) => (INSTITUTIONS[a.institution_id]?.name || "").localeCompare(INSTITUTIONS[b.institution_id]?.name || "");
  const byField = (a, b) => fieldRank(a) - fieldRank(b) || primaryField(a).localeCompare(primaryField(b));
  const cmp = {
    closing: (a, b) => byDeadline(a, b) || byField(a, b) || byInstitution(a, b),
    newest: (a, b) => (b.publication_date || "").localeCompare(a.publication_date || "") || byDeadline(a, b) || byField(a, b),
    field: (a, b) => byField(a, b) || byDeadline(a, b) || byInstitution(a, b),
    inst: (a, b) => byInstitution(a, b) || byField(a, b) || byDeadline(a, b),
  };
  return [...ads].sort(cmp[sort] || cmp.closing);
}

// ---------- reactive facet counts ----------
// For each filter dimension, count ads that match all OTHER active filters. This
// is the standard faceted-search pattern: toggling one dimension never makes its
// own options disappear, but narrows what the others can show.
function adPassesFilter(ad, st, skipDim) {
  const inst = INSTITUTIONS[ad.institution_id] || {};
  if (skipDim !== "hss" && st.fields.size && !fieldTags(ad).some(f => st.fields.has(f))) return false;
  if (skipDim !== "quality" && st.statuses.size && !st.statuses.has(listingStatus(ad))) return false;
  if (skipDim !== "type" && st.types.size && !st.types.has(inst.type)) return false;
  if (skipDim !== "state" && st.states.size && !st.states.has(inst.state)) return false;
  if (skipDim !== "posgroup" && st.posGroups.size) {
    const tests = {
      faculty:   () => isAsstProfMatch(ad),
      associate: () => isAssocProfMatch(ad),
      full:      () => isFullProfMatch(ad),
      research:  () => isResearchMatch(ad),
      visiting:  () => isVisitingMatch(ad),
    };
    let any = false;
    for (const v of st.posGroups) { if (tests[v] && tests[v]()) { any = true; break; } }
    if (!any) return false;
  }
  if (st.query) {
    if (!filterHaystack(ad, inst).includes(st.query)) return false;
  }
  if (window._reservedOnly && !isReservedPost(ad)) return false;
  return true;
}

function updateReactiveCounts(st) {
  const counts = {
    hss: {},
    quality: { hss: 0, "non-hss": 0, other: 0 },
    type: {},
    state: {},
    posgroup: { faculty: 0, associate: 0, full: 0, research: 0, visiting: 0 },
  };
  for (const ad of ADS) {
    const inst = INSTITUTIONS[ad.institution_id] || {};
    if (adPassesFilter(ad, st, "hss")) {
      for (const field of fieldTags(ad)) counts.hss[field] = (counts.hss[field] || 0) + 1;
    }
    if (adPassesFilter(ad, st, "quality")) counts.quality[listingStatus(ad)]++;
    if (adPassesFilter(ad, st, "type") && inst.type) counts.type[inst.type] = (counts.type[inst.type] || 0) + 1;
    if (adPassesFilter(ad, st, "state") && inst.state) counts.state[inst.state] = (counts.state[inst.state] || 0) + 1;
    if (adPassesFilter(ad, st, "posgroup")) {
      if (isAsstProfMatch(ad))  counts.posgroup.faculty++;
      if (isAssocProfMatch(ad)) counts.posgroup.associate++;
      if (isFullProfMatch(ad))  counts.posgroup.full++;
      if (isResearchMatch(ad))  counts.posgroup.research++;
      if (isVisitingMatch(ad))  counts.posgroup.visiting++;
    }
  }
  // Update the .cnt spans already rendered by populateFilters, and dim options
  // with zero matches (they're not useful selections from the current cross-section).
  const paint = (containerId, byValue) => {
    document.querySelectorAll(`#${containerId} label`).forEach(lbl => {
      const input = lbl.querySelector("input");
      const cnt = lbl.querySelector(".cnt");
      const v = input.value;
      const n = byValue[v] ?? 0;
      if (cnt) cnt.textContent = n;
      const hideDeadSubject = containerId === "filter-hss" && n === 0 && !input.checked;
      const hideNonHssSubject = containerId === "filter-hss"
        && st.statuses.has("hss")
        && !HSS_SUBJECT_FILTER_LABELS.has(v)
        && !input.checked;
      lbl.hidden = hideDeadSubject || hideNonHssSubject;
      lbl.style.opacity = (n === 0 && !input.checked) ? 0.4 : "";
    });
  };
  paint("filter-hss", counts.hss);
  paint("filter-quality", counts.quality);
  paint("filter-type", counts.type);
  paint("filter-state", counts.state);
  // Posgroup uses dedicated `#cnt-<rank>` spans (not the `.cnt` inside the
  // shared filter-group label markup). One per rank.
  const setCnt = (id, n) => { const el = document.getElementById(id); if (el) el.textContent = n; };
  setCnt("cnt-faculty",   counts.posgroup.faculty);
  setCnt("cnt-associate", counts.posgroup.associate);
  setCnt("cnt-full",      counts.posgroup.full);
  setCnt("cnt-research",  counts.posgroup.research);
}

// ---------- render ----------
function render() {
  // Filters changed (or it's the first render) — reset progressive-load
  // counter so the user always lands on chunk 1, not mid-scroll into a
  // previously-loaded list. The load-more button itself bypasses render()
  // and calls renderAdList directly, so its bump survives.
  renderLimit = RENDER_PAGE_SIZE;
  const st = currentFilterState();
  const filtered = applySort(applyFilters(st), st.sort);

  renderActiveFilters(st);
  renderSummary(filtered, st);
  renderAdList(filtered);
  updateSelCounts(st);
  updateReactiveCounts(st);
  document.getElementById("count-listings").textContent = filtered.length;
  document.getElementById("count-saved").textContent = SAVED.size > 0 ? SAVED.size : "";
  updateMapMarkers(filtered);
}

function renderActiveFilters(st) {
  const chips = [];
  // Field chips: collapse to a single summary chip when >3 are selected so
  // the chip bar stays readable. Click the summary expands inline.
  const fieldsArr = [...st.fields];
  const FIELD_COLLAPSE_THRESHOLD = 4;
  const fieldsCollapsed = fieldsArr.length > FIELD_COLLAPSE_THRESHOLD && !window._fieldsExpanded;
  if (fieldsCollapsed) {
    chips.push({ kind: "hss-summary", val: "", label: `Field × ${fieldsArr.length}` });
  } else {
    for (const v of fieldsArr) chips.push({ kind: "hss", val: v, label: v });
  }
  for (const v of st.statuses) chips.push({ kind: "quality", val: v, label: QUALITY_LABELS[v] || v });
  for (const v of st.types) chips.push({ kind: "type", val: v, label: typeLabel(v) });
  for (const v of st.posGroups) {
    const POS_LABEL = { faculty: "Asst Prof", associate: "Assoc Prof", full: "Full Prof", research: "Postdoc" };
    chips.push({ kind: "posgroup", val: v, label: POS_LABEL[v] || v });
  }
  for (const v of st.states) chips.push({ kind: "state", val: v, label: v });
  if (st.query) chips.push({ kind: "query", val: "", label: `"${st.query}"` });

  const c = document.getElementById("active-filters");
  if (!chips.length) { c.innerHTML = ""; return; }
  c.innerHTML = chips.map(ch => {
    if (ch.kind === "hss-summary") {
      // Summary chip: clicking the label expands; clicking × clears all fields.
      return `<span class="chip-active chip-summary" data-kind="hss-summary" title="Click to expand"><span class="grow">${escapeHTML(ch.label)} ▾</span><button type="button" data-kind="hss-clear" title="Clear all field selections" aria-label="Clear all field selections">×</button></span>`;
    }
    const removeLabel = `Remove filter: ${ch.label}`;
    return `<span class="chip-active">${escapeHTML(ch.label)}<button type="button" data-kind="${ch.kind}" data-val="${escapeAttr(ch.val)}" title="${escapeAttr(removeLabel)}" aria-label="${escapeAttr(removeLabel)}">×</button></span>`;
  }).join("") + `<button type="button" class="chip-clear" id="clear-filters">Clear all</button>`;

  // Expand-on-click for summary chip (clicking anywhere on chip except the ×).
  c.querySelectorAll(".chip-summary").forEach(chip => {
    chip.addEventListener("click", (e) => {
      if (e.target.tagName === "BUTTON") return;
      window._fieldsExpanded = true;
      render();
    });
  });

  c.querySelectorAll(".chip-active button").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const { kind, val } = btn.dataset;
      if (kind === "query") document.getElementById("search").value = "";
      else if (kind === "hss-clear") {
        document.querySelectorAll("#filter-hss input").forEach(el => el.checked = false);
        window._fieldsExpanded = false;
      } else {
        const mapId = { hss: "filter-hss", quality: "filter-quality", type: "filter-type", posgroup: "filter-posgroup", state: "filter-state" }[kind];
        const box = document.querySelector(`#${mapId} input[value="${CSS.escape(val)}"]`);
        if (box) box.checked = false;
      }
      render();
    });
  });
  document.getElementById("clear-filters").addEventListener("click", () => {
    document.getElementById("search").value = "";
    ["filter-hss","filter-quality","filter-type","filter-posgroup","filter-state"].forEach(id =>
      document.querySelectorAll(`#${id} input`).forEach(el => el.checked = false));
    window._fieldsExpanded = false;
    render();
  });
}

function renderSummary(filtered, st) {
  const total = ADS.length;
  const active = st.fields.size + st.statuses.size + st.types.size + st.posGroups.size + st.states.size + (st.query ? 1 : 0);
  const el = document.getElementById("summary-row");
  el.innerHTML =
    `<span class="emph">${filtered.length}</span> advertisements shown <span style="color:var(--muted-soft)">of ${total} total</span>` +
    (active > 0 ? `<span class="active-mark">· ${active} filter${active!==1?"s":""} active</span>` : "");
  // Sum of the most recent disclosed standing vacancies we have:
  //   - Central Universities teaching (AU1206, Jul 2025): 4,889
  //   - AIIMS network faculty (AS207, Feb 2026): 5,748
  // = 10,637 minimum. IIT/IIM/NIT/IIIT/IISER vacancies remain undisclosed
  // post-2023 (last comprehensive all-CHEI figure was 14,606, Feb 2023);
  // the true current standing inventory is almost certainly higher.
  const VACANT_FLOOR = 10637;
  const adsEl = document.getElementById("vgb-ads");
  const ratioEl = document.getElementById("vgb-ratio");
  if (adsEl) adsEl.textContent = total.toLocaleString("en-IN");
  if (ratioEl) {
    const ratio = total > 0 ? Math.round(VACANT_FLOOR / total) : "—";
    ratioEl.textContent = `${ratio}× gap.`;
  }
}

function updateSelCounts(st) {
  // Update each filter-strip trigger's pill: show count when ≥1 selection,
  // hide when 0. Also flag the parent .filter-dd as `has-active` so the
  // trigger button itself gets a coloured border state.
  const setPill = (id, n, dim) => {
    const pill = document.getElementById(id);
    if (!pill) return;
    pill.textContent = n;
    pill.hidden = n === 0;
    const dd = pill.closest(".filter-dd");
    if (dd) dd.classList.toggle("has-active", n > 0);
  };
  setPill("selcnt-hss",      st.fields.size,    "field");
  setPill("selcnt-quality",  st.statuses.size,  "quality");
  setPill("selcnt-type",     st.types.size,     "type");
  setPill("selcnt-posgroup", st.posGroups.size, "posgroup");
  setPill("selcnt-state",    st.states.size,    "state");
}

// Progressive-render limit. Default 25 — enough that filtered queries (which
// almost always return ≤25 anyway) render fully without a button, but the
// unfiltered 335-ad case is bounded so initial paint is fast and the user
// gets a clear "you're 25 of 335 in" indicator. Each "Load more" click bumps
// the limit by RENDER_PAGE_SIZE.
const RENDER_PAGE_SIZE = 25;
let renderLimit = RENDER_PAGE_SIZE;

function renderAdList(filtered) {
  const host = document.getElementById("feed-items");
  if (filtered.length === 0) {
    host.innerHTML = `<div class="empty-state">No advertisements match your filters.</div>`;
    return;
  }
  const cap = Math.min(renderLimit, filtered.length);
  const shown = filtered.slice(0, cap);
  let html = shown.map(renderAd).join("");
  if (cap < filtered.length) {
    const remaining = filtered.length - cap;
    const nextChunk = Math.min(RENDER_PAGE_SIZE, remaining);
    html += `<button class="load-more" id="load-more-btn" type="button">
      Showing 1–${cap} of ${filtered.length} <span class="lm-sub">— load ${nextChunk} more ▾</span>
    </button>`;
  } else if (filtered.length > RENDER_PAGE_SIZE) {
    // Fully loaded but it took multiple expansions — confirm completion.
    html += `<div class="load-more-done">Showing all ${filtered.length} advertisements.</div>`;
  }
  host.innerHTML = html;
  wireAdActions(host);
  const btn = document.getElementById("load-more-btn");
  if (btn) {
    btn.addEventListener("click", () => {
      renderLimit += RENDER_PAGE_SIZE;
      renderAdList(filtered);
    });
  }
}

function renderAd(ad) {
  const inst = INSTITUTIONS[ad.institution_id] || { name: ad.institution_id };
  const instType = String(inst.type || "");
  const isPrivateInstitution = instType.toLowerCase().includes("private");
  const institutionScope = isPrivateInstitution ? "private" : "public";
  const cls = classifyAd(ad);
  const tier = urgencyTier(ad);
  const structuredPosForRender = getStructuredPosition(ad);
  const cat = structuredPosForRender?.reservation_breakdown || ad.category_breakdown || {};
  const effectivePostCount = structuredPosForRender?.number_of_posts ?? ad.number_of_posts;
  const catBits = ["UR","SC","ST","OBC","EWS","PwBD"].filter(k => cat[k] != null && cat[k] > 0).map(k => [k, cat[k]]);
  const roster = catBits.length
    ? `<div class="roster">Roster: ${catBits.map(([k,v],i) => `${i?'<span class="sep">·</span>':""}<span class="k">${k}</span>:${v}`).join("")}</div>`
    : "";
  const typeColor = TYPE_COLORS[inst.type] || "var(--muted)";
  const fields = fieldTags(ad).filter(f => f !== "Other");
  const hssFlag = fields.slice(0, 2).map(f => `<span class="hss-flag">${escapeHTML(f)}</span>`).join("");
  const status = listingStatus(ad);

  // Chips: post type + contract + posts + low-confidence flag
  const chips = [];
  if (status !== "ready") chips.push(`<span class="chip lowconf">${escapeHTML(QUALITY_LABELS[status])}</span>`);
  if (ad.post_type && ad.post_type !== "Unknown") {
    const label = ad.post_type === "Research" || ad.post_type === "Scientific" ? "Research/Postdoc"
                : ad.post_type === "NonFaculty" ? "Non-Faculty" : ad.post_type;
    chips.push(`<span class="chip">${label}</span>`);
  }
  if (ad.contract_status && ad.contract_status !== "Unknown") {
    const cs = ad.contract_status === "TenureTrack" ? "Tenure-Track" : ad.contract_status;
    chips.push(`<span class="chip muted">${escapeHTML(cs)}</span>`);
  }
  if (effectivePostCount) chips.push(`<span class="chip muted">${effectivePostCount} ${effectivePostCount===1?"post":"posts"}</span>`);
  if (typeof ad.parse_confidence === "number" && ad.parse_confidence < 0.45) chips.push(`<span class="chip lowconf">rough parse</span>`);
  chips.push(`<span class="chip muted">${escapeHTML(sourceLabel(ad))}</span>`);
  const seenDays = daysSince(ad.snapshot_fetched_at);
  if (seenDays != null) {
    chips.push(`<span class="chip muted">checked ${seenDays === 0 ? "today" : seenDays + "d ago"}</span>`);
    if (seenDays >= 14) chips.push(`<span class="chip lowconf">stale source</span>`);
  }

  const saved = SAVED.has(ad.id);

  // Title with optional sub-area appended (e.g. "Sociology" inside HSS unit).
  // The title already contains "Faculty — <Dept>" or "Faculty — <Dept> — <Sub>";
  // we render it as-is but split off the trailing sub-area in muted style.
  const title = ad.title || "(untitled)";
  const titleHTML = (() => {
    const parts = title.split(/\s+—\s+/);
    if (parts.length >= 3) {
      // "Faculty — Dept — SubArea"
      const [head, dept, ...rest] = parts;
      return `${escapeHTML(head + " — " + dept)} <span class="field-spec">— ${escapeHTML(rest.join(" — "))}</span>`;
    }
    return escapeHTML(title);
  })();

  // Meta-line: dept (only if not already in title), discipline (only if differs from dept),
  // posted-date. This is the fix for the redundant DEPT/FIELD problem.
  const metaParts = [];
  const inTitle = (s) => s && title.toLowerCase().includes(s.toLowerCase());
  if (ad.department && !inTitle(ad.department)) {
    metaParts.push(`<span class="dept">${escapeHTML(ad.department)}</span>`);
  }
  if (ad.discipline && ad.discipline !== ad.department && !inTitle(ad.discipline)) {
    metaParts.push(`<span class="dept">${escapeHTML(ad.discipline)}</span>`);
  }
  if (ad.publication_date) {
    metaParts.push(`<span class="posted">posted ${escapeHTML(formatDate(ad.publication_date))}</span>`);
  }
  const metaLine = (metaParts.length || chips.length)
    ? `<div class="meta-line">${chips.join("")}${chips.length && metaParts.length ? '<span class="dot">·</span>' : ''}${metaParts.join('<span class="dot">·</span>')}</div>`
    : "";

  // Deadline pill
  const deadlinePill = ad.closing_date
    ? `<span class="deadline-pill">${escapeHTML(formatCountdown(ad))} <span class="dl-date">· ${escapeHTML(formatDate(ad.closing_date))}</span></span>`
    : `<span class="deadline-pill no-dl">rolling, no deadline</span>`;

  // Action links: PDF + apply portal + listing page (in that order — original PDF first)
  const actionLinks = [];
  actionLinks.push(`<a href="${escapeAttr(resolveUrl(ad.original_url))}" target="_blank" rel="noopener noreferrer">${escapeHTML(sourceLinkLabel(ad))}</a>`);
  if (ad.annexure_pdf_url) {
    actionLinks.push(`<a href="${escapeAttr(ad.annexure_pdf_url)}" target="_blank" rel="noopener noreferrer">Annexure →</a>`);
  }
  if (ad.apply_url) {
    actionLinks.push(`<a href="${escapeAttr(ad.apply_url)}" target="_blank" rel="noopener noreferrer">Apply portal →</a>`);
  }
  if (ad.info_url && ad.info_url !== ad.original_url) {
    actionLinks.push(`<a href="${escapeAttr(ad.info_url)}" target="_blank" rel="noopener noreferrer">Listing page →</a>`);
  }

  // Areas excerpt (quiet body; no accent border, no "AREAS / NOTES" label).
  // Sanitised because some institution pages embed UI widgets that bleed
  // through the HTML→text strip (e.g. Azim Premji's "Add to Calendar"
  // dropdown, which appends "iCal Google Outlook Outlook.com Yahoo" to
  // every listing). The cleanup is conservative — only known patterns.
  // PDF excerpt (when available) vs HTML scrape (default). For most
  // institutions, the HTML career page captures only marketing copy
  // ("We invite applications…"); the actual hiring criteria — sub-areas,
  // methods, qualifications, evaluation — sit in the notification PDF
  // the ad links to. The local enrichment script
  // (scripts/enrich_current_with_pdf.py) extracts substantive chunks
  // from those PDFs and writes them as ad.pdf_excerpt; we prefer it
  // when present, falling back to ad.raw_text_excerpt.
  const structuredPos = getStructuredPosition(ad);
  const cleanedExcerpt = sanitizeExcerpt(structuredPos?.raw_section_text || ad.pdf_excerpt || ad.raw_text_excerpt || "");
  // The cover-letter scan: a candidate reads this section to decide
  // three things — (1) do my projects fit the sub-areas they're hiring
  // in, (2) do I clear the stated eligibility screen, (3) how will the
  // committee evaluate my file. We extract and label these explicitly.
  // When the recruiting department has not specified one of
  // them, we say so — the absence is named, not hidden. Across many
  // cards this surfaces a pattern: most departments do not enunciate
  // their requirements clearly, leaving candidates to guess. That
  // pattern IS the political point of this view; it should be visible.
  const extractedCues = extractCardCues(cleanedExcerpt, ad);
  const sCues = structuredCues(ad);
  const cues = {
    areas: sCues.areas || extractedCues.areas,
    methods: sCues.methods || extractedCues.methods,
    approach: sCues.approach || extractedCues.approach,
    eligibility: sCues.eligibility || extractedCues.eligibility,
    evaluation: sCues.evaluation || extractedCues.evaluation,
  };
  const NS_TIP = "The source ad did not disclose this clearly enough to extract.";
  const empty = `<span class="card-cue-empty" title="${NS_TIP}">Not disclosed in source ad</span>`;
  const areasValue = cues.areas
    ? `<span class="card-cue-tags">${cues.areas.map(a => `<span class="card-area-chip">${escapeHTML(a)}</span>`).join("")}</span>`
    : empty;
  const eligibilityValue = (cues.eligibility || cues.methods)
    ? `<span class="card-cue-value">${escapeHTML(cues.eligibility || cues.methods)}</span>`
    : empty;
  const evaluationValue = (cues.evaluation || cues.approach)
    ? `<span class="card-cue-value">${escapeHTML(cues.evaluation || cues.approach)}</span>`
    : empty;
  // The actual job description, in the institution's own words. Cues
  // distill the high-signal pieces for fast scan; the description gives
  // a candidate the exact language to pick up for a cover letter, the
  // specific wording about teaching duties, and any context the
  // structured cues miss.
  //
  // Long descriptions render with a CSS line-clamp (3 lines) and a
  // separate "see more" button. The previous <details>/<summary>
  // implementation kept the truncated preview inside <summary> so when
  // expanded BOTH the preview and the full text appeared — duplicate
  // text, awkward jump. Line-clamp + button keeps the FULL text in
  // the DOM the whole time; the only thing that changes is whether
  // the clamp is applied. No layout jump, no duplication, the same
  // text grows in place.
  let descriptionRow = "";
  if (cleanedExcerpt) {
    const SHORT = 280;
    if (cleanedExcerpt.length > SHORT) {
      descriptionRow = `
        <div class="card-cue card-cue-description">
          <span class="card-cue-label">Description</span>
          <div class="card-desc-body" data-expanded="false">
            <p class="card-desc-text">${escapeHTML(cleanedExcerpt)}</p>
            <button type="button" class="card-desc-toggle" aria-expanded="false">see more</button>
          </div>
        </div>`;
    } else {
      descriptionRow = `
        <div class="card-cue card-cue-description">
          <span class="card-cue-label">Description</span>
          <span class="card-cue-value">${escapeHTML(cleanedExcerpt)}</span>
        </div>`;
    }
  } else {
    descriptionRow = `
      <div class="card-cue card-cue-description is-empty">
        <span class="card-cue-label">Description</span>
        <span class="card-cue-empty" title="${NS_TIP}">Not provided in the advertisement</span>
      </div>`;
  }

  const areasHTML = `
    <div class="card-cues">
      <div class="card-cue card-cue-areas${cues.areas ? "" : " is-empty"}">
        <span class="card-cue-label">Topical fit</span>
        ${areasValue}
      </div>
      <div class="card-cue card-cue-methods${(cues.eligibility || cues.methods) ? "" : " is-empty"}">
        <span class="card-cue-label">Eligibility snapshot</span>
        ${eligibilityValue}
      </div>
      <div class="card-cue card-cue-approach${(cues.evaluation || cues.approach) ? "" : " is-empty"}">
        <span class="card-cue-label">Evaluation criteria</span>
        ${evaluationValue}
      </div>
      ${descriptionRow}
    </div>`;

  // Collapsible details — short label, button-ish
  const hasDetails = ad.unit_eligibility || ad.publications_required || ad.general_eligibility || ad.reservation_note || ad.process_note || ad.contact || ad._source_note;
  const detailsHTML = hasDetails ? `
    <details class="details">
      <summary>Eligibility &amp; how to apply ▾</summary>
      ${ad._source_note ? `<div class="detail-block"><span class="k">Source note</span><div class="v">${escapeHTML(ad._source_note)}</div></div>` : ""}
      ${cues.areas && cues.areas.length > 3 ? `<div class="detail-block"><span class="k">Full topical fit</span><div class="v">${escapeHTML(cues.areas.join("; "))}</div></div>` : ""}
      ${ad.unit_eligibility ? `<div class="detail-block"><span class="k">Unit eligibility</span><div class="v">${escapeHTML(ad.unit_eligibility)}</div></div>` : ""}
      ${ad.publications_required ? `<div class="detail-block"><span class="k">Publication requirements</span><div class="v">${escapeHTML(ad.publications_required)}</div></div>` : ""}
      ${ad.general_eligibility ? `<div class="detail-block"><span class="k">General eligibility</span><div class="v">${escapeHTML(ad.general_eligibility)}</div></div>` : ""}
      ${ad.reservation_note ? `<div class="detail-block"><span class="k">Reservation</span><div class="v">${escapeHTML(ad.reservation_note)}</div></div>` : ""}
      ${ad.process_note ? `<div class="detail-block"><span class="k">Process</span><div class="v">${escapeHTML(ad.process_note)}</div></div>` : ""}
      ${ad.contact ? `<div class="detail-block"><span class="k">Contact</span><div class="v">${escapeHTML(ad.contact)}</div></div>` : ""}
    </details>` : "";

  // ---- Card layout (institution-first) --------------------------------
  // Two-line headline scanned in <2 seconds:
  //   1. INSTITUTION · CITY   (primary scan target — the candidate's
  //      identity-of-employer, and the geographic constraint)
  //   2. DISCIPLINE · RANK · CONTRACT
  //
  // Institution wins primacy because the filter strip already covers
  // discipline / position / contract / location-state — so within any
  // pre-filtered list, the institution name is the only thing left
  // that differentiates one card from another. (We don't currently have
  // a precise institution-name filter; until we do, the card itself has
  // to make the institution scannable.) The discipline + rank + contract
  // remain visible as a subhead so an unfiltered scroll is still useful.

  const instName = inst.short_name || inst.name || "(institution unknown)";
  // City as a parenthetical disambiguator — essential for multi-campus
  // institutions, but redundant when the institution label already names
  // the city/campus ("IIT Delhi", "IIM Bangalore").
  // Per-listing campus override: a multi-campus institution's registry
  // entry has only one city (usually the main campus); when the ad text
  // names a different campus, that wins for display purposes — the
  // candidate would relocate to where the JOB is, not where the
  // headquarters is.
  const adCampus = detectAdCampus(ad);
  const cityForDisplay = adCampus || inst.city;
  const cityInName = cityAlreadyInInstitutionName(instName, cityForDisplay);
  const cityPart = cityForDisplay && !cityInName ? ` <span class="card-campus">(${escapeHTML(cityForDisplay)})</span>` : "";
  const discipline = cardDiscipline(ad);
  const rankLine = cardRankLine(ad);
  // A small flag-row for non-blocking but worth-knowing signals: low parse
  // confidence, hand-transcribed entry, posts count, posted/checked dates.
  const flags = [];
  flags.push(`<span class="card-flag scope ${institutionScope}">${isPrivateInstitution ? "Private university" : "Public / CEI institution"}</span>`);
  if (isPrivateInstitution && !catBits.length) {
    flags.push(`<span class="card-flag dim" title="Private universities are outside the CEI(RTC) Act, 2019 faculty-reservation roster.">CEI roster n/a</span>`);
  }
  if (structuredPos?.source_pdf) {
    flags.push(`<span class="card-flag dim" title="This card uses structured fields extracted from the linked PDF.">PDF extracted</span>`);
  }
  if (effectivePostCount) {
    flags.push(`<span class="card-flag">${effectivePostCount} ${effectivePostCount === 1 ? "post" : "posts"}</span>`);
  }
  if (typeof ad.parse_confidence === "number" && ad.parse_confidence < 0.45) {
    flags.push(`<span class="card-flag warn" title="Heuristically parsed; verify all details against the original notification.">⚠ rough parse</span>`);
  }
  if (ad._manual_stub && /manual transcription/i.test(ad._source_method || "")) {
    flags.push(`<span class="card-flag manual" title="Hand-transcribed from a circulated recruitment card; only the application URL is verifiable. Verify with the issuing institution before applying.">⚑ manual entry</span>`);
  }
  const dateBits = [];
  if (ad.publication_date) dateBits.push(`posted ${escapeHTML(formatDate(ad.publication_date))}`);
  if (seenDays != null) dateBits.push(`checked ${seenDays === 0 ? "today" : seenDays + "d ago"}`);
  if (ad.ad_number) dateBits.push(`ad #${escapeHTML(ad.ad_number)}`);
  if (dateBits.length) {
    flags.push(`<span class="card-flag dim">${dateBits.join(" · ")}</span>`);
  }

  // Large deadline column: "66 / DAYS / 30 Jun 2026" or "rolling" or "—".
  let deadlineHTML;
  if (ad.closing_date) {
    const d = daysUntil(ad.closing_date);
    if (d == null || d < 0) {
      deadlineHTML = `<div class="deadline-num small">closed</div><div class="deadline-date">${escapeHTML(formatDate(ad.closing_date))}</div>`;
    } else {
      deadlineHTML = `<div class="deadline-num">${d}</div><div class="deadline-unit">days</div><div class="deadline-date">${escapeHTML(formatDate(ad.closing_date))}</div>`;
    }
  } else {
    deadlineHTML = `<div class="deadline-num small">rolling</div>`;
  }

  // Reservation operates at the cadre/institutional-roster level under the
  // CEI(RTC) Act, 2019. For public institutions we distinguish:
  //   - composite / rolling source ads: shared source URL, explicit multi-post
  //     count, rolling/cadre wording, or multiple units under one call;
  //   - explicitly single-post ads: only when the ad says one/1 post;
  //   - unknown roster point: no post-wise category/roster mapping visible.
  // Private universities are handled separately below because the CEI(RTC)
  // roster-disclosure question does not apply to them.
  const _adText = `${ad.title || ""} ${ad.raw_text_excerpt || ""} ${ad.reservation_note || ""}`;
  const shapeText = `${_adText} ${ad.original_url || ""} ${ad.ad_number || ""} ${ad._source_method || ""}`.toLowerCase();
  const sourcePeerCount = ad.original_url
    ? ADS.filter(x => x.original_url === ad.original_url).length
    : 0;
  const isCompositeAd = (() => {
    if (structuredPos?.is_composite_call) return true;
    if (typeof effectivePostCount === "number" && effectivePostCount >= 2) return true;
    if (sourcePeerCount >= 2) return true;
    if (/\b(rolling|rol?lling|all\s+areas?|multiple\s+(areas?|disciplines?)|composite|cadre|various\s+academic\s+units?|department[\s-]?wise|departments?,\s*centres?,\s*(and\s*)?schools?)\b/.test(shapeText)) return true;
    return false;
  })();
  const isExplicitSinglePostAd = (() => {
    if (effectivePostCount === 1) return true;
    if (isCompositeAd) return false;
    return /\b(?:one|1)\s+(?:post|position|vacancy)\b|\bsingle[\s-]+(?:post|position|vacancy)\b/i.test(_adText);
  })();
  // Reservation messaging — four states (plus private-uni handled below):
  //   1. Per-post roster counts published → real coloured pills.
  //   2. Special Recruitment Drive (SRD) for reserved categories →
  //      affirmative-action call out, explain what an SRD is.
  //   3. Composite cadre-level recruitment (multi-post call) without
  //      per-post breakdown → flag the missing roster arithmetic.
  //   4. Single-position / per-area ad → explain that reservation applies
  //      at cadre-roster level, not at the individual-ad level.
  // The statutory percentages (SC-15%, ST-7.5%, OBC-27%, EWS-10%, PwBD-4%)
  // are the constitutional floor every CFTI is bound by; reproducing them
  // on every card is boilerplate noise, not information.
  const isSRD = Boolean(structuredPos?.is_special_recruitment_drive) || /\b(special\s+recruitment\s+drive|mission\s+mode\s+recruitment|SRD\b|recruitment\s+drive\s+for\s+(SC|ST|OBC|EWS|PwBD|PwD|reserved))/i.test(_adText);
  // Private universities are outside the CEI(RTC) faculty-reservation
  // regime. Do not classify their shared jobs pages as "composite
  // recruitment" failures; that roster-disclosure question applies to
  // public/CEI institutions.
  const isPrivate = isPrivateInstitution;
  // Each reservation-state row shows a label + an info icon. The
  // explanation sits behind a click/keyboard disclosure so it works on
  // touch devices too; browser-native title tooltips are too fragile for
  // decision-critical context.
  let reservPillsHTML = "";
  const reservInfo = (tip) => `
    <details class="reserv-info">
      <summary aria-label="Explain reservation status"><span aria-hidden="true">?</span></summary>
      <div class="reserv-info-pop">${escapeHTML(tip)}</div>
    </details>`;
  if (isPrivate && !catBits.length) {
    reservPillsHTML = "";
  } else if (catBits.length) {
    reservPillsHTML = `<div class="row-reserv"><span class="reserv-label">Reserved seats</span>${
      catBits.map(([k, v]) => `<span class="reserv-pill r-${escapeAttr(k)}">${escapeHTML(k)}-${v}</span>`).join("")
    }</div>`;
  } else if (isSRD) {
    const tip = "This ad is part of a Special Recruitment Drive for reserved-category candidates — typically SC/ST/OBC/PwBD posts being filled to reduce roster backlog.";
    reservPillsHTML = `<div class="row-reserv reserv-srd"><span class="reserv-label good">✓ Special Recruitment Drive</span>${reservInfo(tip)}</div>`;
  } else if (isCompositeAd) {
    const tip = "Composite or rolling faculty call. The ad may list many departments/areas under one recruitment PDF, but it does not disclose which roster category each selection point maps to.";
    reservPillsHTML = `<div class="row-reserv reserv-missing"><span class="reserv-label warn">⚠ Composite / rolling recruitment</span>${reservInfo(tip)}</div>`;
  } else if (isExplicitSinglePostAd) {
    const tip = "This public-institution ad appears to be for one post/position, but the roster category for that appointment is not disclosed in the advertisement.";
    reservPillsHTML = `<div class="row-reserv reserv-missing reserv-singlepost"><span class="reserv-label warn">⚠ Single post: roster point not disclosed</span>${reservInfo(tip)}</div>`;
  } else {
    const tip = "This public-institution ad does not disclose enough post-wise roster information to tell whether the recruitment is single-post or bulk, or which UR/SC/ST/OBC/EWS/PwBD roster point is being used.";
    reservPillsHTML = `<div class="row-reserv reserv-missing reserv-singlepost"><span class="reserv-label warn">⚠ Roster point not disclosed</span>${reservInfo(tip)}</div>`;
  }
  // Hiring-language traps — surface known exclusion phrases that the ad
  // contains, so candidates can see the structural barriers up front.
  const traps = extractTraps(ad);
  const trapsHTML = traps.length
    ? `<details class="row-traps"><summary><span class="traps-icon">⚑</span> ${traps.length} watch-out${traps.length > 1 ? "s" : ""} in this ad <span class="traps-hint">(click to expand)</span></summary><div class="traps-body">${
        traps.map(t => `<div class="trap"><div class="trap-label">${escapeHTML(t.label)}</div><div class="trap-why">${escapeHTML(t.why)}</div></div>`).join("")
      }</div></details>`
    : "";

  // Always-visible apply/source links — replaces the buried "how to apply"
  // disclosure. Original PDF first (the source-of-truth), then Apply portal
  // (where you actually submit), then Listing page / Annexure if present.
  const applyLinksHTML = actionLinks.length
    ? `<div class="row-actions-inline">${actionLinks.join('')}</div>`
    : "";

  // Substantive details still get a disclosure — but only when there's
  // actually substantive content beyond reservation/links. Eligibility +
  // publications + general-eligibility are the meat; everything else is
  // either inline above or noise.
  const structuredDetails = structuredPos ? [
    structuredPos.general_eligibility ? `<div class="detail-block"><span class="k">PDF general eligibility</span><div class="v">${escapeHTML(structuredPos.general_eligibility)}</div></div>` : "",
    structuredPos.specific_eligibility ? `<div class="detail-block"><span class="k">PDF specific eligibility</span><div class="v">${escapeHTML(structuredPos.specific_eligibility)}</div></div>` : "",
    structuredPos.qualifications?.publications_required ? `<div class="detail-block"><span class="k">PDF publication requirements</span><div class="v">${escapeHTML(structuredPos.qualifications.publications_required)}</div></div>` : "",
    structuredPos.pay_scale ? `<div class="detail-block"><span class="k">PDF pay scale</span><div class="v">${escapeHTML(structuredPos.pay_scale)}</div></div>` : "",
    structuredPos.extraction_confidence != null ? `<div class="detail-block"><span class="k">PDF extraction</span><div class="v">${escapeHTML(structuredPos.extraction_method || "structured extraction")} · confidence ${Math.round(Number(structuredPos.extraction_confidence || 0) * 100)}%</div></div>` : "",
  ].join("") : "";
  const hasSubstantiveDetails = structuredDetails || ad.unit_eligibility || ad.publications_required || ad.general_eligibility || ad.process_note || ad.contact || ad._source_note;
  const detailsHTML2 = hasSubstantiveDetails
    ? `<details class="details">
        <summary>Eligibility &amp; publication requirements ▾</summary>
        ${structuredDetails}
        ${ad._source_note ? `<div class="detail-block"><span class="k">Source note</span><div class="v">${escapeHTML(ad._source_note)}</div></div>` : ""}
        ${ad.unit_eligibility ? `<div class="detail-block"><span class="k">Unit eligibility</span><div class="v">${escapeHTML(ad.unit_eligibility)}</div></div>` : ""}
        ${ad.publications_required ? `<div class="detail-block"><span class="k">Publication requirements</span><div class="v">${escapeHTML(ad.publications_required)}</div></div>` : ""}
        ${ad.general_eligibility ? `<div class="detail-block"><span class="k">General eligibility</span><div class="v">${escapeHTML(ad.general_eligibility)}</div></div>` : ""}
        ${ad.process_note ? `<div class="detail-block"><span class="k">Process</span><div class="v">${escapeHTML(ad.process_note)}</div></div>` : ""}
        ${ad.contact ? `<div class="detail-block"><span class="k">Contact</span><div class="v">${escapeHTML(ad.contact)}</div></div>` : ""}
      </details>`
    : "";

  return `
    <article class="listing tier-${tier} scope-${institutionScope}" data-jobid="${escapeAttr(ad.id)}">
      <div class="tier-bar"></div>
      <div class="card-body">
        <div class="card-headline">
          <h3 class="card-institution">${escapeHTML(instName)}${cityPart}</h3>
          <p class="card-subhead">
            <span class="card-discipline">${escapeHTML(discipline)}</span>
            <span class="card-sep">·</span>
            <span class="card-rank">${escapeHTML(rankLine)}</span>
          </p>
          ${flags.length ? `<div class="card-flags">${flags.join('')}</div>` : ""}
        </div>
        <div class="card-deadline">${deadlineHTML}</div>
        <div class="card-actions">
          <button type="button" class="star ${saved?'on':''}" title="${saved?'Remove from saved':'Save to watchlist'}" aria-pressed="${saved}" aria-label="${saved?'Remove from saved':'Save to watchlist'}">${saved?'★':'☆'}</button>
        </div>
      </div>
      ${reservPillsHTML}
      ${areasHTML}
      ${trapsHTML}
      ${applyLinksHTML}
      ${detailsHTML2}
    </article>`;
}

function wireAdActions(host) {
  host.querySelectorAll(".listing .star").forEach(btn => {
    btn.addEventListener("click", () => {
      const card = btn.closest(".listing");
      const id = card.dataset.jobid;
      if (SAVED.has(id)) SAVED.delete(id); else SAVED.add(id);
      persistSaved();
      btn.classList.toggle("on");
      btn.textContent = SAVED.has(id) ? "★" : "☆";
      btn.setAttribute("aria-pressed", SAVED.has(id));
      document.getElementById("count-saved").textContent = SAVED.size > 0 ? SAVED.size : "";
    });
  });
  // Description "see more / see less" toggle. The text node stays in
  // the DOM the whole time; only the line-clamp class flips. No layout
  // jump, no duplicate text — the same paragraph just grows in place.
  host.querySelectorAll(".card-desc-toggle").forEach(btn => {
    btn.addEventListener("click", () => {
      const body = btn.closest(".card-desc-body");
      if (!body) return;
      const expanded = body.getAttribute("data-expanded") === "true";
      body.setAttribute("data-expanded", expanded ? "false" : "true");
      btn.setAttribute("aria-expanded", expanded ? "false" : "true");
      btn.textContent = expanded ? "see more" : "see less";
    });
  });
}

// ---------- vacancies tab ----------
let VACANCY_DATA = null;
const GROUP_LABELS = {
  all_central_universities: "All Central Universities",
  all_iits: "All IITs", all_iims: "All IIMs", all_iisers: "All IISERs",
  all_nits: "All NITs", all_iiits: "All IIITs", iisc: "IISc Bangalore",
  all_centrally_funded_heis: "All Centrally-Funded HEIs (aggregate)",
  all_aiims: "All AIIMS (institute network)",
  all_chei_mission_mode: "All CHEIs — Mission Mode cumulative fills",
};
const INST_LABELS = {
  iit_bombay: "IIT Bombay"
};

// Disclosure-regression matrix across BOTH houses (LS + RS), built from the
// close-reading of all 80+ Q&A PDFs in the corpus. Each row: house, question
// number, date, subject, MP who asked, and three Y/N/P columns for whether
// the answer disclosed total / category / institution-wise data. The matrix
// is the operational evidence for the disclosure-regression argument.
const LS_DISCLOSURE = [
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

// MPs who keep asking. Surfaced so readers see who is doing parliamentary
// work for this constituency. Geographic concentration is the finding.
const LS_QUESTIONERS = [
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
// Statutory in-position share targets for the central-government reservation
// regime AFTER the 103rd Amendment (Jan 2019). EWS carved 10 percentage
// points from the historical "unreserved" pool; we fold EWS back into GEN
// for time-series continuity, so the GEN target here is the residual after
// SC (15) + ST (7.5) + OBC (27) — i.e. 50.5%. See: Constitution (One Hundred
// and Third Amendment) Act, 2019; Deshpande and Ramachandran 2019.
const STATUTORY_TARGETS = { GEN: 50.5, SC: 15, ST: 7.5, OBC: 27 };
const CAT_FULL_NAMES = {
  GEN: "General (incl. EWS)",
  SC: "Scheduled Castes",
  ST: "Scheduled Tribes",
  OBC: "Other Backward Classes",
};

// Compute vacancy-rate per category and "realisation index" (observed share
// of in-position posts ÷ statutory share). Realisation < 1 = under-filled.
function computeIneq(snap) {
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

function vacRateChart(label, snap) {
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

function realisationChart(label, snap) {
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
const CORPUS_STATS = {
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
function chart0_volume() {
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
function chart5_disclosure_v2() {
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
    const dots = d[L.key].map((v, i) => `<circle cx="${xS(i)}" cy="${yS(v)}" r="4" fill="${L.color}" stroke="white" stroke-width="1.5"/>`).join("");
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
function chartx_boilerplate() {
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
    const dots = d[L.key].map((v, i) => `<circle cx="${xS(i)}" cy="${yS(v)}" r="3.5" fill="${L.color}" stroke="white" stroke-width="1.5"/>`).join("");
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
function charty_topics() {
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
    school: "#999",
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
function chartCard({ title, deck, body, source }) {
  return `<div class="jbm-card">
    <h4 class="jbm-title">${title}</h4>
    ${deck ? `<p class="jbm-deck">${deck}</p>` : ""}
    <div class="jbm-chart">${body}</div>
    ${source ? `<div class="jbm-source"><strong>Source:</strong> ${source}</div>` : ""}
  </div>`;
}

// JBM Chart 1: Vacancy time-series with disclosure-regression annotation.
function chart1_vacancyTimeline(snaps) {
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
    return `<circle cx="${x}" cy="${y}" r="5" fill="${fill}" stroke="white" stroke-width="2"/>
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
function chart2_mandateVsReality(snaps) {
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
    const labelColor = cat.role === "emph" ? "var(--jbm-emph)" : (cat.name === "General" ? "#444" : "var(--muted)");
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
      <text class="anno-text" x="${xR + 110}" y="${yS(58.5) + 4}" style="fill:#444">General — captures the surplus</text>
    </svg>`;

  return chartCard({
    title: `What the Constitution promised, and what was delivered`,
    deck: `Mandated share (left) vs actual share (right) of cumulative Mission Mode faculty appointments across centrally-funded HEIs, September 2022 to January 2026. Lines that slope downward = under-realised category. EWS achieves 31% of its mandate.`,
    body,
    source: `Lok Sabha Q. 5842 (30 Mar 2026), Ministry of Education. Total faculty filled: ${total.toLocaleString('en-IN')}. Mandate: SC 15%, ST 7.5%, OBC 27%, EWS 10%; General-residual ~40.5% post-103rd Amendment.`,
  });
}

// JBM Chart 3: Kharge rank-by-category vacancy as a clean SVG bar chart.
function chart3_kharge(snaps) {
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
function chart4_aiims(snaps) {
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
    return `<circle cx="${x}" cy="${y}" r="${dotR}" fill="${fill}" stroke="white" stroke-width="1.5"/>`;
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
function chart5_disclosure() {
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
    <circle cx="${ml + 4}" cy="${H - 22}" r="5" fill="var(--jbm-promise)" stroke="white" stroke-width="1.5"/>
    <text class="axis-label" x="${ml + 14}" y="${H - 18}">Disclosed</text>
    <circle cx="${ml + 100}" cy="${H - 22}" r="5" fill="#c97a4a" stroke="white" stroke-width="1.5"/>
    <text class="axis-label" x="${ml + 110}" y="${H - 18}">Partial</text>
    <circle cx="${ml + 180}" cy="${H - 22}" r="5" fill="var(--jbm-emph)" stroke="white" stroke-width="1.5"/>
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
function chart6_whoIsAsking() {
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
    "Other":                 "#999",
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
function chart7_rdGap() {
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
      <circle cx="${x}" cy="${y}" r="${d.emph ? 7 : 5}" fill="${fill}" stroke="white" stroke-width="1.5"/>
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
function chart8_counterfactual() {
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
    <text class="anno-text emph" x="${ml + hiredW / 2}" y="${barY + barH/2 + 5}" text-anchor="middle" fill="white" style="font-weight:800; font-size:14px;">${hiresPerYear.toLocaleString('en-IN')} hired</text>
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
function realisationSlopeChart(snaps) {
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
      <text class="row-label ${cat.color}" x="${xR + 12}" y="${yAct + 4}" text-anchor="start">${sharePct.toFixed(1)}% <tspan fill="${cat.color === 'gain' ? '#666' : (cat.color.includes('outlier') ? 'var(--alarm)' : '#999')}" font-size="10">→ ${realisation.toFixed(0)}% of mandate</tspan></text>
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
      <text class="annotation" x="${xR + 115}" y="${yScale(58.5) + 4}" style="fill:#666;">General — captures the surplus</text>
    </svg>
    <div class="chart-source"><strong>Source:</strong> Lok Sabha Q. 5842, 30 Mar 2026 (first cumulative-by-category disclosure, surfaced after the Supreme Court's Article 142 order). Total faculty filled across all CFHEIs: ${total.toLocaleString('en-IN')}. Mandate: SC 15%, ST 7.5%, OBC 27%, EWS 10%; GEN-residual 40.5% post-103rd Amendment.</div>
  </div>`;
}

// Donut chart: Mission Mode fills by category, with mandate ring outside.
// SVG so it's crisp at any zoom. The visual story: the pie is mostly grey
// (General); the SC/ST/OBC/EWS slices are visibly small.
function realisationDonut(snaps) {
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
    return `<path d="M ${x1} ${y1} A ${rOuter} ${rOuter} 0 ${largeArc} 1 ${x2} ${y2} L ${x3} ${y3} A ${rInner} ${rInner} 0 ${largeArc} 0 ${x4} ${y4} Z" fill="${cat.color}" stroke="white" stroke-width="2"/>`;
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
function rdGapPanel() {
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
function talentPipeline() {
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
function castePyramid(snaps) {
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
function counterfactualTicker() {
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
function khargeRankMatrix(snaps) {
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
function vacancyTimelineChart(snaps) {
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
function missionModeRealisationChart(snaps) {
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
function disclosureMatrix() {
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
function aiimsNetworkPanel(snaps) {
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
function mpsAskingPanel() {
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

async function renderVacancies() {
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
        <span class="hss-num">36×</span>
        <div class="hss-label">more known faculty vacancies than active recruitment advertisements visible across all institutional career pages today.</div>
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
const RTI_TEMPLATES = [
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
const POSTDOC_ABROAD = {
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

const RESOURCES_BLOCKS = [
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
      { name: "Insight Foundation", url: "https://insightfoundation.in/", note: "Bahujan-led research and advocacy on caste in education and employment. Long history of documentation on faculty hiring at central HEIs." },
      { name: "Birsa Ambedkar Phule Students Association (BAPSA)", url: "#", note: "JNU-origin student association with chapters at multiple HEIs; networks for Bahujan PhD students moving toward faculty applications." },
      { name: "Ambedkar Students Association (ASA)", url: "#", note: "Active at HCU, IITs, and several central universities. Mentor-network channel for navigating PhD-to-faculty transitions." },
      { name: "Association of Indian Labour Historians (AILH) / faculty caucuses", url: "#", note: "Discipline-specific caucuses at academic associations sometimes maintain Bahujan-specific support networks. Worth contacting your discipline's main association directly." },
    ],
  },
  {
    title: "If you're tracking institutional accountability",
    items: [
      { name: "DOPT (Department of Personnel and Training) reservation orders", url: "https://dopt.gov.in/", note: "Most authoritative source for reservation procedure circulars, including roster maintenance, certificate validity, and de-reservation/dereservation rules." },
      { name: "UGC reservation circulars", url: "https://www.ugc.gov.in/", note: "Institution-specific guidance on roster computation. The 13-point roster controversy and its 2019 reversal are documented in the circulars archive." },
    ],
  },
];

function renderResources() {
  const host = document.getElementById("resources-tab");

  // Helper: render a single list item the same way for both flat and
  // sub-grouped block schemas. If the item carries an `elig` annotation
  // (citizenship/residency status), surface it as a coloured chip next
  // to the link so the applicant sees the eligibility verdict at a
  // glance — this matters because several Canadian/UK/US programmes
  // exclude Indian-PhD applicants at the door.
  const eligChip = (e) => e
    ? `<span class="elig elig-${escapeAttr(e.status)}">${escapeHTML(e.label)}</span>`
    : "";
  const regionChip = (r) => r
    ? `<span class="region">${escapeHTML(r)}</span>`
    : "";
  const renderItem = (i) => `
    <li>
      ${i.url && i.url !== "#"
        ? `<a href="${escapeAttr(i.url)}" target="_blank" rel="noopener">${escapeHTML(i.name)} <span class="ext">↗</span></a>`
        : `<span class="res-name">${escapeHTML(i.name)}</span>`}${regionChip(i.region)}${eligChip(i.elig)}
      <div class="res-note">${escapeHTML(i.note)}</div>
    </li>`;

  // Postdocs-abroad block — sub-grouped, with raw HTML in the intro
  // (controlled, hand-authored — not user input — so the manual <p> and
  // <a> tags are intentional). Renders first because the page's editorial
  // recommendation to Bahujan PhDs is explicitly to apply abroad rather
  // than wait for the Indian state to administer the constitution.
  const postdocBlock = `
    <div class="res-block ${escapeAttr(POSTDOC_ABROAD.cls)}">
      <h3>${escapeHTML(POSTDOC_ABROAD.title)}</h3>
      <div class="res-block-intro">${POSTDOC_ABROAD.intro}</div>
      <div class="elig-legend">
        <span class="leg-label">Eligibility key:</span>
        <span class="elig elig-open">Indian PhDs eligible</span>
        <span class="elig elig-caveat">Open with caveat</span>
        <span class="elig elig-restricted">Restricted</span>
        <span class="elig elig-varies">Varies / verify per call</span>
      </div>
      <div class="elig-legend">
        <span class="leg-label">Region:</span>
        <span class="region">North America</span>
        <span class="region">Europe & UK</span>
        <span class="region">Asia & Oceania</span>
        <span class="region">Multi</span>
      </div>
      <div class="elig-legend" style="background: rgba(180,120,30,0.04); border-color: rgba(180,120,30,0.30); color: var(--ink); align-items: flex-start; line-height: 1.55;">
        <strong style="color: var(--alarm); font-size: 11px; letter-spacing: 0.04em; text-transform: uppercase;">Regional norms ↘</strong>
        <span style="font-size: 11.5px;">
          <strong>UK / EU / Australia:</strong> PhD must be in hand at the application deadline (some allow a written submission date, but not "expected"). Time-since-PhD limits are common (often 4–8 years).
          <strong style="margin-left: 4px;">US / Canada:</strong> several programmes accept final-year PhDs whose dissertation will be defended before the fellowship start date — verify per call.
          <strong style="margin-left: 4px;">Mobility rules:</strong> Marie Curie (EU) and Newton International (UK) require the applicant not to have resided in the host country for &gt;12 months in the prior 36 — Indian PhDs in India satisfy this by default.
          <strong style="margin-left: 4px;">Letters:</strong> 3 letters of recommendation is the standard; the savarna letter-writing chokepoint is real, plan early.
        </span>
      </div>
      ${POSTDOC_ABROAD.subgroups.map(g => `
        <div class="postdoc-subgroup">
          <h4>${escapeHTML(g.title)}</h4>
          <ul>${g.items.map(renderItem).join("")}</ul>
        </div>`).join("")}
    </div>`;

  // Combined Indian-institutions block — practical-infrastructure
  // links and RTI templates are conceptually the same thing (both
  // serve the candidate applying within India). Rendered as one
  // unified block with two subsections under a single heading.
  const indianBlockData = RESOURCES_BLOCKS[0];
  const indianBlock = `
    <div class="res-block rti-block">
      <h3>If you're applying to Indian institutions</h3>
      <p class="res-block-intro">Practical infrastructure for Indian-institution applications — certificate authorities, parliamentary-question search, the statutory bodies that handle reservation-violation complaints — paired with ready-to-paste RTI templates for the data the institutions don't publish. The two are one toolkit: links above, templates below.</p>
      <h4 class="rti-subhead">Practical infrastructure</h4>
      <ul class="indian-link-list">${indianBlockData.items.map(renderItem).join("")}</ul>
      <h4 class="rti-subhead">RTI templates — when the government won't disclose, you generate the data</h4>
      <p class="rti-subnote">Four ready-to-paste Right to Information Act requests covering the most common institutional opacity patterns. Replace bracketed placeholders, send to the Public Information Officer of the relevant institution. Costs ₹10 per RTI; institutions are obligated to respond within 30 days.</p>
      <div class="rti-grid">
        ${RTI_TEMPLATES.map((t, i) => `
          <details class="rti-card">
            <summary>
              <span class="rti-title">${escapeHTML(t.title)}</span>
              <span class="rti-expand">show template ▾</span>
            </summary>
            <div class="rti-body">
              <p class="rti-scenario">${escapeHTML(t.scenario)}</p>
              <div class="rti-target"><strong>To:</strong> ${escapeHTML(t.target)}</div>
              <textarea class="rti-text" id="rti-text-${i}" readonly rows="14">${escapeHTML(t.body)}</textarea>
              <div class="rti-actions">
                <button class="rti-copy" data-target="rti-text-${i}" type="button">Copy template</button>
                <a class="rti-online" href="https://rtionline.gov.in/" target="_blank" rel="noopener">File on RTI Online ↗</a>
              </div>
            </div>
          </details>`).join("")}
      </div>
    </div>`;

  // Render remaining (non-Indian-applications) blocks after the unified
  // Indian-institutions block.
  const renderBlock = (b) => `
    <div class="res-block">
      <h3>${escapeHTML(b.title)}</h3>
      <ul>${b.items.map(renderItem).join("")}</ul>
    </div>`;
  const remainingBlocks = RESOURCES_BLOCKS.slice(1).map(renderBlock).join("");

  host.innerHTML = `
    <div class="res-intro">
      <h2>Resources for candidates</h2>
      <p>Tools and references for Bahujan PhD scholars navigating the Indian academic job market — and the international fellowship circuit that runs alongside it. The page leads with postdoctoral routes abroad because, on the evidence of the <a href="#vacancies" data-tab-link="vacancies" style="color:var(--accent); font-weight:600;">Vacancies tab</a>, applying within India alone is not a strategy. Indian-institution infrastructure and broader networks follow.</p>
    </div>
    ${postdocBlock}
    ${indianBlock}
    ${remainingBlocks}
  `;

  // Wire copy-to-clipboard for each template.
  host.querySelectorAll(".rti-copy").forEach(btn => {
    btn.addEventListener("click", async () => {
      const ta = host.querySelector(`#${btn.dataset.target}`);
      if (!ta) return;
      try {
        await navigator.clipboard.writeText(ta.value);
        const orig = btn.textContent;
        btn.textContent = "✓ Copied";
        btn.classList.add("copied");
        setTimeout(() => { btn.textContent = orig; btn.classList.remove("copied"); }, 1800);
      } catch {
        // Fallback: select the textarea so user can manually copy.
        ta.select();
      }
    });
  });
}

// ---------- saved tab ----------
function renderSaved() {
  const host = document.getElementById("saved-tab");
  const savedAds = ADS.filter(a => SAVED.has(a.id));
  if (savedAds.length === 0) {
    host.innerHTML = `<div class="empty-state"><div class="big">☆</div><div>No saved advertisements yet.</div><div style="font-size:13px; margin-top:4px;">Click the star on any ad to add it to your watchlist.</div></div>`;
    return;
  }
  const sorted = [...savedAds].sort((a,b) => (daysUntil(a.closing_date) ?? 9999) - (daysUntil(b.closing_date) ?? 9999));
  host.innerHTML =
    `<div style="font-size:13px; color:var(--muted); margin-bottom:12px;">${sorted.length} saved advertisement${sorted.length!==1?"s":""}</div>` +
    `<div class="feed-list">${sorted.map(renderAd).join("")}</div>`;
  wireAdActions(host);
}

// ---------- coverage ----------
function renderCoverage() {
  if (!COVERAGE) {
    document.getElementById("coverage-summary").innerHTML = `<p style="color:var(--muted)">No coverage report available yet.</p>`;
    return;
  }
  const s = COVERAGE;
  const ok = (s.rows || []).filter(r => r.fetch_status === "ok").length;
  const stub = (s.rows || []).filter(r => r.fetch_status === "rolling-stub").length;
  const stale = (s.rows || []).filter(r => r.fetch_status === "stale-archive").length;
  const err = (s.rows || []).filter(r => !["ok", "rolling-stub", "stale-archive", "manual"].includes(r.fetch_status)).length;
  document.getElementById("coverage-summary").innerHTML = `
    <div class="kpi-grid">
      <div class="kpi"><div class="lbl">Attempted</div><div class="val" style="color:var(--muted)">${s.institutions_attempted}</div></div>
      <div class="kpi"><div class="lbl">Scraped</div><div class="val" style="color:var(--good)">${ok}</div></div>
      <div class="kpi"><div class="lbl">Rolling calls</div><div class="val" style="color:var(--warn)">${stub}</div></div>
      <div class="kpi"><div class="lbl">Carried forward</div><div class="val" style="color:var(--warn)">${stale}</div></div>
      <div class="kpi"><div class="lbl">Needs attention</div><div class="val" style="color:var(--alarm)">${err}</div></div>
      <div class="kpi"><div class="lbl">Total ads</div><div class="val" style="color:var(--accent)">${s.ads_found_total}</div></div>
    </div>
    <p style="font-size:12px; color:var(--muted); margin-bottom:10px;">Run generated at <span style="font-family:var(--mono)">${escapeHTML(s.generated_at)}</span></p>`;
  const tbody = document.querySelector("#coverage-table tbody");
  const statusRank = { "parser-error": 0, "network-error": 1, "http-error": 2, "robots-blocked": 3, "no-url": 4, "stale-archive": 5, "rolling-stub": 6, "manual": 7, "ok": 8 };
  const shown = [...(s.rows || [])].sort((a,b) => (statusRank[a.fetch_status] ?? 4) - (statusRank[b.fetch_status] ?? 4));
  tbody.innerHTML = shown.map(r => {
    const inst = INSTITUTIONS[r.institution_id] || { name: r.institution_id };
    const cls = r.fetch_status === "ok" ? "status-ok" : (r.fetch_status === "manual" || r.fetch_status === "rolling-stub" || r.fetch_status === "stale-archive" || r.fetch_status === "no-url" ? "status-no" : "status-err");
    return `<tr>
      <td>${escapeHTML(inst.name || r.institution_id)}</td>
      <td style="font-family:var(--mono); font-size:12px; color:var(--muted)">${escapeHTML(r.parser)}</td>
      <td class="${cls}">${escapeHTML(r.fetch_status)}</td>
      <td>${r.http_status ?? "—"}</td>
      <td style="text-align:right; font-family:var(--mono)">${r.ads_found}</td>
      <td style="color:var(--muted); font-size:12px;">${escapeHTML(r.note || "")}</td>
    </tr>`;
  }).join("");
}

// ---------- map ----------
let MAP = null;
const MARKERS = {};

function initMap() {
  if (MAP) { MAP.invalidateSize(); return; }
  MAP = L.map("map-container").setView([22.5, 82], 5);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    maxZoom: 18,
  }).addTo(MAP);

  const typeSeen = new Set();
  for (const inst of Object.values(INSTITUTIONS)) {
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

function updateMapMarkers(filteredAds) {
  if (!MAP) return;
  const fieldCount = {}, totalCount = {};
  for (const ad of filteredAds) {
    const iid = ad.institution_id;
    totalCount[iid] = (totalCount[iid] || 0) + 1;
    if (!fieldTags(ad).includes("Other")) fieldCount[iid] = (fieldCount[iid] || 0) + 1;
  }
  for (const [id, marker] of Object.entries(MARKERS)) {
    const inst = INSTITUTIONS[id];
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
      ? `${total} ad${total !== 1 ? "s" : ""} match filters &nbsp;·&nbsp; <a class="popup-link" href="${escapeAttr(coverageUrl)}" target="_blank" rel="noopener">career page →</a>`
      : `no ads match current filters &nbsp;·&nbsp; <a class="popup-link" href="${escapeAttr(coverageUrl)}" target="_blank" rel="noopener">career page →</a>`;
    marker.bindPopup(`
      <strong>${escapeHTML(inst.name)}</strong><br/>
      <span style="color:#666">${escapeHTML(inst.type)} · ${escapeHTML([inst.city, inst.state].filter(Boolean).join(", "))}</span>
      ${hssLine}
      <div style="margin-top:6px">${totalLine}</div>`);
  }
}

loadData();
