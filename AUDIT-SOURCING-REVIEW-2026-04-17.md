# Sourcing Review UI Audit — 2026-04-17

## Anti-Patterns Verdict
**Fail.** The previous UI was functionally correct but still looked AI-generated. The main tells were:
- oversized hero treatment for an internal tool
- repeated stat-card pattern for simple counts
- nested soft cards inside larger cards
- too much decorative whitespace for a dense review workflow
- panel hierarchy that looked like a dashboard template rather than an operator console

## Executive Summary
- Total issues: 5
- Critical: 0
- High: 3
- Medium: 2
- Low: 0
- Overall quality score before redesign: **5.8 / 10**

Most important fixes:
1. Remove the landing-page hero and replace it with a compact operator header.
2. Collapse the repeated card hierarchy into denser tables, rails, and summary strips.
3. Rebalance the layout so the merge queue feels like the primary workspace instead of one panel among many.

## Detailed Findings

### High

#### 1. Oversized hero wastes prime review space
- Location: [web/index.html](/Users/adam/Desktop/WeKruit/wekruit-core-service-cloud-function/web/index.html), [web/styles.css](/Users/adam/Desktop/WeKruit/wekruit-core-service-cloud-function/web/styles.css)
- Category: Anti-pattern / Layout
- Description: The page opened with a large serif headline and roomy intro copy more appropriate for a landing page than a review tool.
- Impact: Users had to scroll past branding theatre before getting to the queue, which weakens throughput and makes the tool feel less serious.
- Recommendation: Replace with a compact top rail that keeps the title, status, and refresh controls visible without dominating the viewport.

#### 2. Repeated metric cards create generic dashboard SaaS styling
- Location: [web/index.html](/Users/adam/Desktop/WeKruit/wekruit-core-service-cloud-function/web/index.html), [web/styles.css](/Users/adam/Desktop/WeKruit/wekruit-core-service-cloud-function/web/styles.css)
- Category: Anti-pattern / Theming
- Description: Simple counters were rendered as six nearly identical cards, then followed by more nested cards in the selected-run summary.
- Impact: This flattens hierarchy and makes the interface feel templated. The eye has to parse too many containers before reaching the tables that matter.
- Recommendation: Convert counts into a compact summary strip with separators instead of standalone mini-cards.

#### 3. Merge workflow was visually under-weighted
- Location: [web/index.html](/Users/adam/Desktop/WeKruit/wekruit-core-service-cloud-function/web/index.html)
- Category: UX / Layout
- Description: The dedup queue shared equal visual emphasis with record browsing and config, even though review is the primary job to be done.
- Impact: The page did not clearly communicate where an operator should spend attention first.
- Recommendation: Promote the merge queue to the primary workspace and move records/approved into a supporting rail.

### Medium

#### 4. Nested card styling reduced information density
- Location: [web/styles.css](/Users/adam/Desktop/WeKruit/wekruit-core-service-cloud-function/web/styles.css)
- Category: Anti-pattern / Layout
- Description: Large rounded panels contained more rounded cards, which contained pill chips and inset surfaces.
- Impact: Valuable space was spent on chrome rather than data, and the UI felt soft rather than precise.
- Recommendation: Replace inner cards with strip-based metadata and hairline separators.

#### 5. Connection settings were over-exposed
- Location: [web/index.html](/Users/adam/Desktop/WeKruit/wekruit-core-service-cloud-function/web/index.html)
- Category: Information architecture
- Description: API target configuration occupied a full-width feature panel even though it is an occasional operator action.
- Impact: The screen over-prioritized setup over review.
- Recommendation: Compress connection settings into a thinner control bar that still keeps the endpoint editable.

## Positive Findings
- The table-first interaction model is directionally correct.
- Real data, reviewed history, and approved entities are already wired into the UI.
- The core review actions are on-screen and do not require modal hopping.

## Recommended Fix Order
1. Replace hero and summary cards with compact operator chrome.
2. Rebalance the workspace around the merge queue.
3. Remove remaining nested-card patterns in detail panes and summaries.
