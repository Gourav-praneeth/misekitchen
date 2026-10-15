# Mise product roadmap

Last reviewed: October 14, 2026

This file is the source of truth for Mise's implementation order. Add new ideas here when they come up, even when work temporarily moves to another feature. Moving an item does not remove it from the roadmap; record the reason in the decision log.

## Status guide

- **In progress** — currently being implemented or validated
- **Next** — the next committed feature after the active work
- **Queued** — agreed work with a later priority
- **Candidate** — useful idea that still needs scope or validation
- **Parked** — intentionally deferred
- **Done** — implemented and verified

## Current implementation order

### 1. Barcode scanning reliability — In progress

The core mobile scanning workflow, product lookup, multi-product queue, household product memory, retries, offline fallback, and manual review are implemented.

Remaining validation:

- Test the rear camera on a physical iPhone with several UPC, EAN, and GTIN formats.
- Test known, unknown, damaged, and partially visible barcodes.
- Test mixed package sizes and repeated scans of the same product.
- Confirm weak-network and offline recovery on a real device.
- Review Open Food Facts results for confusing names, quantities, or images found during normal use.
- Keep all test inventory reversible and remove it after verification.

Exit criteria: scanning is reliable enough for regular grocery unloading without creating incorrect inventory or trapping the user when lookup fails.

### 2. Smarter recommendations — Next

Make Overview and recipe suggestions more useful than a simple ingredient-match ranking.

- Combine ingredient availability, use-by urgency, cook time, food preferences, saved recipes, and recent cooking history into one recommendation score.
- Explain each recommendation with clear reasons such as “uses two ingredients expiring soon” or “ready in 20 minutes.”
- Avoid repeatedly recommending recently cooked meals when alternatives exist.
- Prefer recipes that fit meals already planned for today and the rest of the week.
- Offer useful actions directly from a recommendation: cook, add missing items, save, or place in the meal plan.
- Add empty and low-match states that tell the user what would unlock better suggestions.
- Keep recommendation logic deterministic and testable before considering paid AI services.

Exit criteria: a user can understand why a meal was suggested and act on it in one or two taps.

### 3. Meal Planner 2.1 — Queued

Build on the current weekly planner after recommendation ranking is available.

- Add recommended meals directly into an open meal slot.
- Improve mobile planning controls so meals can be moved or copied without cramped button stacks.
- Preview missing groceries before a recipe is placed into the week.
- Make leftovers and repeat servings explicit instead of treating every slot as a new cook.
- Highlight schedule conflicts, duplicated meals, and ingredients that will expire before their planned meal.
- Add a compact week summary for cook time, grocery impact, and use-soon ingredients rescued.
- Preserve template, serving, household sync, and grocery calculation behavior.

Exit criteria: planning a useful week on a phone is faster than building the same plan one slot at a time.

### 4. Grocery List 2.1 — Queued

- Carry recommendation and meal-plan context into grocery items.
- Show which recipe or planned meal requested an item.
- Improve duplicate resolution when manual, staple, recipe, and meal-plan additions overlap.
- Consider adding unit search and recently used choices if beta testing shows the grouped picker is too slow for larger unit lists.
- Add optional aisle ordering and a compact in-store mode for mobile.
- Keep icons, package quantities, universal-unit conversion, and purchased-to-kitchen transfer accurate.

### 5. Smart Entry and receipt refinement — Queued

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
- Household activity filters so users can quickly find inventory, meal-plan, or grocery changes.
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

## Decision log

- **October 14, 2026:** Barcode scanning was pulled ahead of smarter recommendations and Meal Planner 2.1 because reliable product entry is foundational to accurate inventory, recipes, and grocery planning. After barcode beta validation, work returns to smarter recommendations, followed by Meal Planner 2.1.

## How to maintain this roadmap

When a new idea or issue appears:

1. Add it under the related feature or UX backlog.
2. Give it a status and describe the user outcome, not only the UI change.
3. Record any priority change in the decision log.
4. Define testable exit criteria before implementation begins.
5. Move completed work to the foundation list only after automated checks and a production smoke test.
