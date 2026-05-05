// docs/lib/schema.js — runtime schema validation for current.json.
//
// Goal: catch data-shape regressions at the boundary, not at render-time.
// If the scraper or inject step ships a malformed ad (null institution_id,
// non-array areas, javascript: in apply_url, etc.), validateCurrent flags
// it now and the renderer can decide whether to skip or render-with-warning.
//
// Vitest imports `z` directly. The browser also imports zod from npm —
// served by the Pages CDN as a same-origin file once Phase-2 build step
// vendor-copies node_modules/zod/lib/index.js into docs/lib/vendor/. Until
// then, the browser path through schema.js is stubbed with a thin shim
// (see ./schema-shim.js) that no-ops validation in production but keeps
// the module surface identical for testing.

import { z } from "zod";

/* ---------- primitives ---------- */

const SafeUrlScheme = z.string().refine(
  (s) => {
    if (!s) return true; // empty allowed; render code handles missing
    if (s.startsWith("#") || s.startsWith("/")) return true;
    try {
      const p = new URL(s, "http://localhost");
      return ["http:", "https:", "mailto:", "file:"].includes(p.protocol.toLowerCase());
    } catch (_) { return false; }
  },
  { message: "URL must be http(s)/mailto/file or same-origin" }
);

const NullableString = z.string().nullish().transform(v => v ?? null);
const NullableInt = z.number().int().nullish().transform(v => v ?? null);
const ISODate = z.string().regex(/^\d{4}-\d{2}-\d{2}/).nullish().or(z.null());

/* ---------- structured_position (LLM-extracted per-position record) ---------- */

const ReservationBreakdown = z.object({
  UR: z.union([z.number().int().nonnegative(), z.null()]).optional(),
  SC: z.union([z.number().int().nonnegative(), z.null()]).optional(),
  ST: z.union([z.number().int().nonnegative(), z.null()]).optional(),
  OBC: z.union([z.number().int().nonnegative(), z.null()]).optional(),
  EWS: z.union([z.number().int().nonnegative(), z.null()]).optional(),
  PwBD: z.union([z.number().int().nonnegative(), z.null()]).optional(),
}).passthrough();

const Qualifications = z.object({
  phd: z.string().nullish(),
  first_class_preceding_degree: z.string().nullish(),
  post_phd_experience_years: z.union([z.number().int().nonnegative(), z.null()]).optional(),
  publications_required: z.string().nullish(),
  teaching_experience: z.string().nullish(),
  other: z.string().nullish(),
}).passthrough();

export const StructuredPositionSchema = z.object({
  department: NullableString,
  discipline: NullableString,
  school_or_centre: NullableString,
  ranks: z.array(z.string()).optional().default([]),
  contract_status: z.string().nullish(),
  post_type: z.string().nullish(),
  areas: z.array(z.string()).optional().default([]),
  methods_preference: NullableString,
  approach: NullableString,
  qualifications: Qualifications.optional(),
  general_eligibility: NullableString,
  specific_eligibility: NullableString,
  reservation_breakdown: ReservationBreakdown.optional(),
  is_special_recruitment_drive: z.boolean().optional().default(false),
  is_composite_call: z.boolean().optional().default(false),
  number_of_posts: NullableInt,
  pay_scale: NullableString,
  application_deadline: ISODate.optional(),
  open_date: ISODate.optional(),
  raw_section_text: z.string().nullish(),
  apply_url: SafeUrlScheme.nullish(),
  source_pdf: z.string().nullish(),
  source_pdf_url: z.string().nullish(),
  extraction_method: z.string().nullish(),
  extraction_confidence: z.number().min(0).max(1).optional(),
  structure_family: z.string().nullish(),
}).passthrough();

/* ---------- ad row in current.json ---------- */

export const AdSchema = z.object({
  id: z.string().min(1),
  institution_id: z.string().min(1),
  title: z.string().nullish(),
  ad_number: z.string().nullish(),
  department: NullableString,
  discipline: NullableString,
  post_type: z.string().nullish(),
  contract_status: z.string().nullish(),
  number_of_posts: NullableInt,
  pay_scale: z.string().nullish(),
  publication_date: ISODate.optional(),
  closing_date: ISODate.optional(),
  original_url: SafeUrlScheme.nullish(),
  apply_url: SafeUrlScheme.nullish(),
  info_url: SafeUrlScheme.nullish(),
  annexure_pdf_url: SafeUrlScheme.nullish(),
  raw_text_excerpt: z.string().nullish(),
  pdf_excerpt: z.string().nullish(),
  parse_confidence: z.number().min(0).max(1).optional(),
  category_breakdown: ReservationBreakdown.optional(),
  structured_position: StructuredPositionSchema.optional(),
  structured_positions: z.array(StructuredPositionSchema).optional(),
  pdf_extraction: z.unknown().optional(),
}).passthrough();

export const CurrentSchema = z.object({
  ads: z.array(z.unknown()),  // validate each ad individually below for partial recovery
}).passthrough();

/* ---------- entry point ---------- */

/**
 * Validate the parsed current.json. Returns:
 *   { ok, ads, invalid, errors }
 * - ads: list of ads that passed the schema (rendered as-is)
 * - invalid: list of {index, ad, error} for ads that failed
 * - errors: top-level shape errors (no `ads` array, etc.)
 *
 * Behaviour: invalid ads are EXCLUDED from `ads` so render-side code never
 * has to defensively guard against malformed records. `invalid.length` and
 * the per-record error are surfaced to the developer console at load.
 */
export function validateCurrent(parsed) {
  const top = CurrentSchema.safeParse(parsed);
  if (!top.success) {
    return { ok: false, ads: [], invalid: [], errors: top.error.issues };
  }
  const ads = [];
  const invalid = [];
  for (let i = 0; i < top.data.ads.length; i++) {
    const r = AdSchema.safeParse(top.data.ads[i]);
    if (r.success) {
      ads.push(r.data);
    } else {
      invalid.push({ index: i, ad: top.data.ads[i], error: r.error.issues });
    }
  }
  return { ok: true, ads, invalid, errors: [] };
}
