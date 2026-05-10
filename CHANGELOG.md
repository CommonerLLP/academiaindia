# Changelog

## 2026-05-10
- **feat: comprehensive accessibility remediation for whoseuniversity.org**
  - Implemented findings from the design audit to ensure the forensic record is accessible to researchers using assistive technologies.
  - **Semantic Navigation:** Corrected heading hierarchy in "The Gap" report.
  - **ARIA Labeling:** Added `aria-label` to search inputs and descriptive `<title>` tags to SVGs.
  - **Focus Management:** Updated filter popovers to capture focus on open and return it on close.
  - **Map Accessibility:** Enabled keyboard navigation for Leaflet markers.
- **feat: custom SVG map markers with institution-specific icons**
  - Replaced `L.circleMarker` with custom `L.divIcon` SVG pins for improved visual hierarchy.
  - Assigned unique icons for Universities (🎓), Technical HEIs (⚙️), and Management Institutions (📊).
  - Implemented dynamic 'Active' state styling.
- **feat: accessible data-pill map markers with representative palette**
  - Implemented Airbnb-style 'Data Pills' showing the number of jobs.
  - Added institutional symbols to active pills for color-blind accessibility.
  - Applied representative color palette: Saffron for IIM/Private, Light Blue for IIT/IISc, Ambedkar Blue for Central Universities.
- **feat: Airbnb-style marker clustering**
  - Integrated `Leaflet.markercluster` to bunch markers at low zoom levels.
  - Implemented layered discovery: National -> Regional -> Institutional.
  - Enhanced cluster pills to show both institutional count and total job count.
- **fix: test suite hardening**
  - Centralized `localStorage` mock in `tests/setup.js` to resolve conflicting mocks.
  - Created `vitest.config.js` to standardize the test environment.

## 2026-05-09
- **chore: security posture and privacy purge**
  - Rotated keys, purged git history, and enforced local-only policy for `CLAUDE.md`, `AGENTS.md`, and `MISTAKES.md`.
  - Updated `.gitignore` across all repos.
- **docs: unified READMEs and handoff protocols**
  - Consolidated per-repo instructions into a single `_org/` source of truth.

... (older entries)
