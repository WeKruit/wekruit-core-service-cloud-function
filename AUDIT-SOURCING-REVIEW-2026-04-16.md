# Sourcing Review Audit — 2026-04-16

## Anti-Patterns Verdict
The previous sourcing review page failed the anti-pattern check. It looked like
an AI-style dashboard template instead of an operator review tool because it
opened with a hero, workflow cards, metric cards, and variable-height content
cards instead of stable scanable tables.

## Executive Summary
- Critical issues found before rewrite: 3
- High-severity issues found before rewrite: 4
- Most critical problems:
  1. The first screen was a landing-page layout, not a working review console.
  2. Core review objects had no stable row model, so operators could not compare
     runs, records, or dedup candidates efficiently.
  3. Review actions were detached from the selected candidate context.
  4. The flow was not closed for singleton person records with no dedup match.

## Critical Issues

### 1. Card-first review UI blocked scanability
- Location: previous `web/index.html`, `web/app.js`, `web/styles.css`
- Severity: Critical
- Category: Responsive / Theming / Anti-pattern
- Description: runs, records, dedup candidates, and approved entities were all
  rendered as stacked cards with nested cards inside cards.
- Impact: operators could not compare rows or work at queue speed.
- Recommendation: move to a table-first operator console with a single selected
  detail pane.

### 2. Review actions were separated from review evidence
- Location: previous `web/index.html` review form and candidate cards
- Severity: Critical
- Category: Accessibility / UX
- Description: selecting a candidate only copied an ID into a separate form.
- Impact: reviewers had to cross-reference context manually and were more likely
  to make mistakes.
- Recommendation: bind row selection directly to a detail pane with inline
  review actions.

### 3. Closure excluded singleton person records
- Location: `src/services/sourcing/application/service.ts`,
  `src/services/sourcing/application/dedup.ts`,
  `src/services/sourcing/domain/records.ts`
- Severity: Critical
- Category: Functional
- Description: only multi-record dedup candidates could be reviewed into
  approved entities.
- Impact: person records without a merge partner could never reach downstream
  approved storage.
- Recommendation: generate `singleton_review` candidates for uncovered person
  records.

## High-Severity Issues

### 1. No reviewed queue view
- Description: only pending candidates were visible.
- Recommendation: support pending / reviewed / all queue modes.

### 2. No run completion action in UI
- Description: run completion existed in the API but not in the operator UI.
- Recommendation: add a selected-run completion action.

### 3. Approved entities were not scoped to the selected run
- Description: the UI only showed a global approved list.
- Recommendation: filter approved entities by source record IDs from the
  selected run.

### 4. Entity type filter was hard-coded
- Description: the UI assumed `research_work` and `person_profile`.
- Recommendation: build type options dynamically from the selected run payload.

## Remediation Executed
- Replaced the landing-page/card layout with a table-first console.
- Added selected-run summary, run completion action, and row-based run table.
- Added sortable record table plus detail pane.
- Added pending / reviewed / all dedup queue modes plus inline review actions.
- Added run-scoped approved entity table plus detail pane.
- Added singleton review candidate generation for uncovered person records.

## Residual Risks
- Candidate and approved queries still use bounded list sizes from the backend.
- Runtime still deploys on Node.js 20 and an older `firebase-functions`
  version.
- Suppressed singleton candidates are hidden from the UI by design, so any
  debugging of suppression logic still requires API inspection.
