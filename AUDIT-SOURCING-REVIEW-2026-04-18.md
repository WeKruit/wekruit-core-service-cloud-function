# Sourcing Review UI Audit — 2026-04-18

## Post-Fix Outcome
- This audit was executed first, then the screen was rebuilt in the same session.
- Current staging outcome after optimization:
  - Lighthouse desktop: `performance 100`, `accessibility 100`, `best-practices 100`
  - FCP `0.3s`, LCP `0.3s`, TTI `0.3s`, TBT `0ms`, CLS `0.026`
- Key changes shipped:
  - Reframed the page into a denser operator-console layout with a primary review stage and inspector rail.
  - Tightened table density, column widths, and selected-row treatment for faster scanning.
  - Fixed the major layout-shift culprit by reserving inspector detail height instead of letting the review form jump.
  - Reduced the old soft-card feel by flattening surfaces, simplifying borders, and shrinking the header chrome.

## Anti-Patterns Verdict
**Fail.** The current UI is functional but still looks AI-generated. The main tells are a beige card quilt, timid hierarchy, repeated rounded containers, and a layout that spreads attention evenly instead of creating one decisive operator workflow. It no longer looks like a landing page, but it still looks like a generic admin dashboard assembled from safe patterns.

## Executive Summary
- Total issues found: 6
- High: 3
- Medium: 3
- Low: 0
- Overall quality score: **5.1 / 10**
- Measured baseline:
  - Lighthouse desktop: `performance 99`, `accessibility 100`, `best-practices 100`
  - FCP `0.3s`, LCP `0.4s`, TTI `0.4s`, TBT `0ms`, CLS `0.072`
  - Network requests: `9`
  - Source size: `78,373` bytes across `index.html`, `styles.css`, `app.js`

Most critical issues:
1. The interface still has no memorable visual point of view.
2. The queue, inspector, records, and approved states are fragmented into too many equal-looking boxes.
3. The right side of the workspace is visually overloaded while the queue table still feels cramped.

## Detailed Findings By Severity

### High-Severity Issues

#### 1. The interface still reads as generic AI admin SaaS
- Location: [web/index.html](/Users/adam/Desktop/WeKruit/wekruit-core-service-cloud-function/web/index.html), [web/styles.css](/Users/adam/Desktop/WeKruit/wekruit-core-service-cloud-function/web/styles.css)
- Category: Theming / Anti-pattern
- Description: The design language is still dominated by pale beige surfaces, soft shadows, repeated rounded panels, and evenly weighted headings.
- Impact: Users do not get a strong sense that this is a purpose-built research review desk. The whole tool feels provisional.
- Recommendation: Commit to a sharper internal-console aesthetic with stronger anchors, less card repetition, and more assertive structure.
- Suggested command: `/frontend-design`

#### 2. The core review workflow is visually fragmented
- Location: [web/index.html](/Users/adam/Desktop/WeKruit/wekruit-core-service-cloud-function/web/index.html:116)
- Category: Responsive / Information architecture
- Description: The current workspace splits attention across queue table, candidate detail, records, and approved entities at the same depth.
- Impact: The operator's main task, review and merge judgment, does not dominate the screen. Scanning effort is higher than it should be.
- Recommendation: Rebuild the screen around a primary queue stage and a separate inspector rail, with records and approved content clearly secondary.
- Suggested command: `/optimize`

#### 3. Table density and hierarchy are still too soft
- Location: [web/styles.css](/Users/adam/Desktop/WeKruit/wekruit-core-service-cloud-function/web/styles.css:347), [web/styles.css](/Users/adam/Desktop/WeKruit/wekruit-core-service-cloud-function/web/styles.css:453)
- Category: Theming / Responsive
- Description: Summary strips, tables, and detail panes all use similarly soft fills and similar spacing. Headers, rows, and selected states do not separate strongly enough.
- Impact: Users cannot instantly parse priority, which reduces trust and slows review throughput.
- Recommendation: Increase contrast between surfaces, tighten row rhythm, and make selected/active states much more legible.
- Suggested command: `/frontend-design`

### Medium-Severity Issues

#### 4. Connection and metrics chrome still spends too much space on support information
- Location: [web/index.html](/Users/adam/Desktop/WeKruit/wekruit-core-service-cloud-function/web/index.html:29)
- Category: Layout
- Description: The API base input and all six counters sit in a wide panel that competes with actual review content.
- Impact: Screen real estate is spent on context that matters less often than the queue itself.
- Recommendation: Compress the control layer further and treat counts as instrumentation, not hero information.
- Suggested command: `/distill`

#### 5. Inspector content feels stacked, not narrated
- Location: [web/app.js](/Users/adam/Desktop/WeKruit/wekruit-core-service-cloud-function/web/app.js:930), [web/app.js](/Users/adam/Desktop/WeKruit/wekruit-core-service-cloud-function/web/app.js:1092)
- Category: UX / Theming
- Description: Candidate detail and approved detail are technically present, but they still feel like raw panels rather than a coherent decision surface.
- Impact: The operator has to mentally assemble the story of why a merge is valid instead of having the UI tell that story clearly.
- Recommendation: Treat the inspector as a dedicated judgment surface with stronger sectioning and clearer narrative order.
- Suggested command: `/clarify`

#### 6. Performance is excellent, but perceived performance can still improve through layout containment
- Location: [web/styles.css](/Users/adam/Desktop/WeKruit/wekruit-core-service-cloud-function/web/styles.css), [web/index.html](/Users/adam/Desktop/WeKruit/wekruit-core-service-cloud-function/web/index.html)
- Category: Performance
- Description: Lighthouse scores are already very strong, but large below-the-fold panels and repeated dense tables could benefit from render containment and more deliberate scroll regions.
- Impact: Users on lower-end machines may still experience unnecessary paint cost as the interface grows.
- Recommendation: Preserve current performance wins while adding containment and cleaner scroll boundaries where safe.
- Suggested command: `/optimize`

## Patterns & Systemic Issues
- Rounded bordered panels still appear as the default answer to every grouping problem.
- Surface tones are too close together, so hierarchy depends on borders rather than composition.
- The layout still behaves like a dashboard with sections, not a dedicated workbench with one main task.

## Positive Findings
- The product now uses real data and the end-to-end review loop is intact.
- Table-first rendering is the right foundation for this tool.
- Accessibility and baseline performance are already strong and should be preserved.

## Recommendations By Priority
1. **Immediate**: Rebuild the workspace into a clearer main stage plus inspector rail.
2. **Short-term**: Replace the soft beige panel stack with a more decisive design system and stronger active states.
3. **Medium-term**: Apply safe render containment to secondary/below-fold sections and keep performance scores stable.
4. **Long-term**: Add richer review ergonomics only after the base visual system is clearly solved.

## Suggested Commands For Fixes
- Use `/frontend-design` to replace the generic admin look with a sharper operator-console point of view.
- Use `/optimize` to preserve current Lighthouse quality while improving perceived performance and render containment.
- Use `/clarify` if review copy and section labels still feel too raw after the redesign.
