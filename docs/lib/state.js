// docs/lib/state.js — shared mutable state for the dashboard.
//
// Pattern: single exported object whose fields are mutated (never the
// object itself reassigned). Browser ES modules give us live bindings on
// the import side — every other module that does
//   import { state } from "./state.js"
// sees the same object reference. Setting `state.ADS = newArray` from any
// module is instantly visible to every reader.
//
// Why an object instead of `let ADS = []`? Live-bindings on `let` exports
// are read-only at the import site, so `let` would force everyone through
// setter functions. The object pattern keeps mutation ergonomics close to
// what app.js had as globals while restoring testability and module
// boundaries.
//
// Convention: use UPPERCASE keys for shared state (matches the legacy
// global names). Don't add helpers, computed values, or derived state
// here — those live in their own modules.

export const state = {
  /** Array of ad records loaded from data/current.json. */
  ADS: [],
  /** Aggregate coverage statistics from data/coverage_report.json. */
  COVERAGE: null,
  /** institution_id → registry-entry map from data/institutions_registry.json. */
  INSTITUTIONS: {},
};
