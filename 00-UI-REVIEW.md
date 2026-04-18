# UI Review — Sourcing Review Console

Date: 2026-04-17
Scope: `/web` review console in `wekruit-core-service-cloud-function`

## Score Summary

Overall: **22 / 24**

| Pillar | Score | Notes |
|--------|-------|-------|
| Copywriting | 4 / 4 | Visible machine labels were reduced; decisions and tabs now read like operator actions. |
| Visuals | 4 / 4 | The console now reads as a review desk with rails and a main stage, not a card quilt. |
| Color | 3 / 4 | Palette is calmer and more decisive; semantic states are readable without shouting. |
| Typography | 4 / 4 | Header, section, and table hierarchy are much easier to parse. |
| Spacing | 3 / 4 | Primary workflow density is strong; explorer detail can still get visually dense with long titles. |
| Experience Design | 4 / 4 | The main loop is now obvious: choose run, inspect queue, decide match, then consult supporting data. |

## What Changed

1. The layout was rebuilt into a true operator workbench:
   `run rail -> merge queue -> decision rail`, with supporting data moved into a secondary row.
2. The old equal-weight panel problem is gone.
   The merge queue is now the visual center of gravity, and the decision panel no longer competes with utilities.
3. Utility and ingest controls were pushed out of the primary review surface.
   They now behave like a drawer instead of a fourth primary destination.
4. Copy is more human.
   The decision lane now uses `Approve merge`, `Keep separate`, and `Need more evidence` instead of surfacing raw internal values.
5. Run scanning improved.
   The left rail behaves like a compact run list instead of a stack of mini-cards.

## Remaining Issues

1. The queue and explorer still share a quiet neutral palette.
   The structure is clear now, but one more pass could sharpen the visual distinction between “active judgment” and “reference data”.
2. Very long record titles still create weight in the lower explorer.
   The layout handles them, but the panel feels denser than the top review stage.
3. Live data hydration still causes first-paint movement.
   Desktop Lighthouse is back to `accessibility 100`, but CLS remains elevated because the shell shifts when live run data and queue state hydrate.

## Verdict

This is now a credible internal review console. It no longer looks like a generic admin dashboard, and the primary task is finally obvious on first paint. Further work would be polish, not rescue.
