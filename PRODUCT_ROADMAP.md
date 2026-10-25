# Mise product roadmap

Last reviewed: October 25, 2026

This file is the source of truth for Mise's implementation order. Add new ideas here when they come up, even when work temporarily moves to another feature. Moving an item does not remove it from the roadmap; record the reason in the decision log.

## Status guide

- **In progress** — currently being implemented or validated
- **Next** — the next committed feature after the active work
- **Queued** — agreed work with a later priority
- **Candidate** — useful idea that still needs scope or validation
- **Parked** — intentionally deferred
- **Done** — implemented and verified

## Current implementation order

### 1. Effortless kitchen tracking — In progress (validation)

- [x] Replace measured kitchen stock with ingredient presence while keeping recipe and grocery quantities.
- [x] Ask what ran out after cooking instead of deducting measured amounts.
- [x] Review generated and bulk grocery additions before saving.
- [x] Indicate grocery items newly added by another household member.
- [x] Remember household icon choices and anonymously count confirmed catalog gaps.
- [x] Reconcile household inventory, groceries, recipes, plans, staples, cooking history, and product memory through Supabase Realtime without rewriting unrelated collections.
- [x] Save row-level collection deltas so simultaneous household changes preserve unrelated remote additions and edits instead of replacing whole collections.
- [x] Make Undo reliable for legacy and new kitchen, grocery, recipe, meal-plan, template, and staple records, including delayed cloud saves and realtime reconciliation.
- [x] Normalize legacy inventory and grocery rows during hydration while preserving existing IDs and assigning stable IDs only when missing.
- [x] Resolve icons in household mapping, built-in catalog, stored legacy icon, and generic fallback order; backfill confirmed legacy custom icons into household mappings.
- [x] Polish My Kitchen interactions with compact freshness labels, category counts, accessible search, non-repeating metadata, a focused Restock action, and an overflow menu for edit/delete.
- [x] Make grocery entry and review consistent: distinct single/paste actions, cancel-safe pasted drafts, exact merge previews, row-level validation, and one clear confirmation summary on desktop and mobile.
- [x] Reorganize Grocery List around the daily flow: add, shop, check off, and review purchases first; keep aisle order, staples management, and bulk completion in a compact utility menu.
- [x] Surface saving, offline, refresh-error, and conflict states inside My Kitchen and Grocery List so household sync health remains visible on mobile.
- [x] Add recovery actions to grocery empty/filter states, Escape/outside-click behavior to working menus, and 44px mobile grocery controls.
- [ ] Validate the complete signed-in two-member flow end to end, including delayed Undo, offline recovery, and realtime changes from the other member.

Meal Planner 2.1 remains intentionally deferred until this lower-friction kitchen model is validated.

### 2. Barcode scanning reliability — In progress

The core mobile scanning workflow, product lookup, multi-product queue, household product memory, retries, offline fallback, and manual review are implemented.

Remaining validation:

- Test the rear camera on a physical iPhone with several UPC, EAN, and GTIN formats.
- Test known, unknown, damaged, and partially visible barcodes.
- Test mixed package sizes and repeated scans of the same product.
- Confirm weak-network and offline recovery on a real device.
- Review Open Food Facts results for confusing names, quantities, or images found during normal use.
- Keep all test inventory reversible and remove it after verification.

Exit criteria: scanning is reliable enough for regular grocery unloading without creating incorrect inventory or trapping the user when lookup fails.

### 3. Smarter recommendations — Done

Make Overview and recipe suggestions more useful than a simple ingredient-match ranking.

- [x] Combine ingredient availability, use-by urgency, cook time, food preferences, saved recipes, recent cooking history, and meal-plan context into one recommendation score.
- [x] Explain each recommendation with clear reasons such as “uses two ingredients expiring soon” or “ready in 20 minutes.”
- [x] Avoid repeatedly recommending recently cooked meals when alternatives exist.
- [x] Prefer recipes already planned for today or the next seven days.
- [x] Offer useful actions directly from a recommendation: cook or add missing items, open saved recipes, and place a meal in the plan.
- [x] Add empty and low-match states that tell the user what would unlock better suggestions.
- [x] Keep recommendation logic deterministic and testable before considering paid AI services.

Exit criteria: a user can understand why a meal was suggested and act on it in one or two taps.

### 4. Grocery List 2.1 — Done

- [x] Keep duplicate merging conservative while source tracking is deferred: compatible duplicates use the larger requirement instead of adding blindly.
- [x] Let users customize aisle order and provide a compact mobile in-store mode.
- [x] Separate the needed amount from the actual package quantity purchased.
- [x] Confirm package count, package size, and unit before transferring purchases into the kitchen.
- [x] Keep icons, universal-unit conversion, custom units, and purchased-to-kitchen transfer accurate.
- [x] Scan purchased package barcodes during review, match them to the list, support unplanned purchases and repeated packages, and preserve product details in household memory.

Exit criteria: shopping is fast on a phone, actual package quantities reach inventory, and no duplicate is inflated without enough source information.

### 5. Meal Planner 2.1 — On hold

Build on the current weekly planner after recommendation ranking is available.

- Add recommended meals directly into an open meal slot.
- Improve mobile planning controls so meals can be moved or copied without cramped button stacks.
- Preview missing groceries before a recipe is placed into the week.
- Make leftovers and repeat servings explicit instead of treating every slot as a new cook.
- Highlight schedule conflicts, duplicated meals, and ingredients that will expire before their planned meal.
- Add a compact week summary for cook time, grocery impact, and use-soon ingredients rescued.
- Preserve template, serving, household sync, and grocery calculation behavior.

Exit criteria: planning a useful week on a phone is faster than building the same plan one slot at a time.

### 6. Smart Entry and receipt refinement — Parked

Receipt work is intentionally paused while shared-kitchen reliability, barcode validation, and other daily-use improvements take priority.

- Expand the food intelligence catalog using real tester receipts and corrections.
- Improve package-size, brand, and date extraction from receipt text.
- Learn from user-confirmed corrections within the household without exposing private data.
- Make partial OCR failures easy to repair rather than forcing a rescan.

## UX improvement backlog

These ideas should be considered during related feature work but do not override the implementation order above.

- First-use onboarding that demonstrates Smart Add, recipe matching, and the grocery-to-kitchen loop.
- A small “What changed?” notice after meaningful releases.
- Consistent loading, empty, error, offline, and undo states across every page.
- Accessibility pass for keyboard use, screen readers, contrast, focus order, and reduced motion.
- Better one-handed mobile placement for primary actions and modal controls.
- Install guidance for adding Mise to an iPhone or Android home screen.
- Optional local reminders for expiring ingredients as a separate preference from meal reminders.
- Search that can find ingredients, recipes, planned meals, and grocery items from one place.
- Source-aware grocery provenance showing which recipe, recommendation, staple, or meal-plan entry requested each item; required before additive multi-recipe merging can be completely reliable.
- Household activity filters so users can quickly find inventory, meal-plan, or grocery changes.
- Household icon overrides for recognized catalog foods, with a clear “Reset to Mise default” action; currently learned mappings are created only for unknown foods.
- Export and account-data deletion controls before expanding beyond private beta.

## Parked to keep the app free

- Paid analytics platforms and hosted error monitoring.
- Paid AI-generated recipe or recommendation services.
- Apple sign-in until the beta needs another identity provider.

These can be reconsidered only when the free-tier limits or beta feedback justify the added cost and maintenance.

## Recently completed foundations

- Meal Planner 2.0, templates, today reminders, and Overview meal highlights.
- Grocery List 2.0, reusable staples, aisle grouping, and purchased-item transfer.
- Shared-kitchen invitations, member management, activity, and household switching.
- Custom and default recipes, Spoonacular Discover, food preferences, and cooking history.
- Smart Entry 2.0, receipt OCR, Food Intelligence, and expiration intelligence.
- Universal ingredient measurement conversion.
- Multi-tab and offline-safe cloud synchronization.
- Barcode-ready product data, mobile scanner, Open Food Facts lookup, scan queue, household memory, and failure recovery.
- Single-item staple entry with food suggestions, alongside the existing bulk workflow.
- A shared grouped unit picker across inventory, groceries, staples, recipes, Smart Entry review, and barcode review, with custom-unit support.
- Persistent, cloud-race-safe Undo for destructive inventory, grocery, recipe, meal-plan, template, and staple actions.
- Legacy record normalization and household icon backfill without a Supabase migration.

## Decision log

- **October 25, 2026:** The shared-kitchen reliability gate now treats silent staleness as an error: failed realtime reconciliation is visible within the two daily-use pages, local edits remain safe, and users can retry without leaving their task. Deterministic coverage now includes a legacy Undo interleaved with another member's addition and the edit-versus-re-add grocery “New” lifecycle. Signed-in two-device validation remains the final gate.
- **October 25, 2026:** Grocery List navigation now prioritizes the actions used on every trip. Add item and Start shopping remain visible, checked items surface a dedicated Review purchases next step, and lower-frequency list setup lives under More. Mobile shows one action row before the shopping status and list.
- **October 25, 2026:** Grocery entry now keeps single-item addition fast while pasted and generated lists share one stricter review contract. Cancel preserves unsaved pasted text, every visible row must be valid, and merge messaging is computed with the same unit-aware logic used by the final save.
- **October 25, 2026:** Shared-kitchen saves moved from whole-collection replacement to baseline-aware row deltas so concurrent additions, offline changes, and remote edits can reconcile without deleting unrelated household data.
- **October 25, 2026:** Undo was hardened for both legacy and newly created records using per-collection forced-save generations. Household mappings remain the highest icon priority, while an explicit override flow for recognized catalog foods is queued as a UX candidate rather than changing the catalog automatically.
- **October 25, 2026:** My Kitchen kept its existing Mise visual identity while shifting mobile rows to a clearer working-list pattern: concise status, one visible Restock action, and secondary edit/delete actions in an overflow menu.

- **October 24, 2026:** Receipt and Smart Entry refinement was parked at the user's request. Work remains recorded here and will resume after higher-priority shared-kitchen and daily-use validation.

- **October 16, 2026:** Beta feedback showed that exact kitchen quantities created more work than value. Inventory now represents ingredient presence; quantities remain in recipes and grocery planning, and cooking completion asks only what ran out.

- **October 14, 2026:** Barcode scanning was pulled ahead of smarter recommendations and Meal Planner 2.1 because reliable product entry is foundational to accurate inventory, recipes, and grocery planning. After barcode beta validation, work returns to smarter recommendations, followed by Meal Planner 2.1.
- **October 14, 2026:** Grocery List 2.1 moved ahead of Meal Planner 2.1. Source-aware grocery provenance is deferred; package confirmation, aisle order, store mode, and accurate purchased-to-kitchen transfer proceed independently.
- **October 14, 2026:** Barcode lookup was connected to Grocery List 2.1 purchase review so actual package quantities can be captured without manual entry. This does not depend on deferred source-aware grocery provenance.

## How to maintain this roadmap

When a new idea or issue appears:

1. Add it under the related feature or UX backlog.
2. Give it a status and describe the user outcome, not only the UI change.
3. Record any priority change in the decision log.
4. Define testable exit criteria before implementation begins.
5. Move completed work to the foundation list only after automated checks and a production smoke test.
