# Mise

**A shared kitchen companion that helps households remember what is at home, use food before it goes to waste, decide what to cook, and shop together.**

[Open the live app](https://misekitchen-ten.vercel.app/) · [View the product roadmap](PRODUCT_ROADMAP.md)

Mise replaces detailed stock counting with a lighter presence-based model: an ingredient is either **at home** or it is not. Recipes keep their full measurements, while the kitchen stays quick enough to update during everyday life.

## What Mise does

Mise connects four daily household workflows:

1. **My Kitchen** shows what is available, where it is stored, and what needs attention.
2. **What Can I Make?** ranks recipes using ingredient availability, freshness, cook time, preferences, and recent meals.
3. **Meal Plan** organizes breakfast, lunch, dinner, and snacks across the week.
4. **Grocery List** combines missing recipe ingredients, household staples, and manually added items into a shared shopping flow.

The result is a simple loop:

> Know what you have → cook what makes sense → review what is missing → shop → move purchases back into the kitchen.

## Product highlights

### A low-effort kitchen inventory

- Presence-based tracking instead of exact remaining quantities.
- Physical storage areas: Fridge, Freezer, Pantry, and Spice rack.
- Independent food types such as Protein, Produce, Grains & starches, and Spices & seasonings.
- Profile-specific freshness: perishable foods can receive use-by suggestions while dry staples stay date-free.
- Search, storage filters, food-type filters, Restock actions, and recoverable deletion with Undo.
- Manual entry, natural-language Smart Add, barcode entry, and reviewed receipt import.

### Recipes that reflect the real kitchen

- Recipe readiness based on ingredient presence.
- Recommendations that consider use-soon ingredients, cook time, preferences, saved recipes, recent cooking history, and meal-plan context.
- Clear explanations for why a recipe is recommended.
- Adjustable servings with recalculated recipe and grocery quantities.
- Household recipes plus optional Spoonacular discovery.
- A post-cooking “What ran out?” review instead of automatic ingredient deduction.

### A collaborative grocery list

- Shared household list with realtime updates.
- “New” indicators for items added by another household member.
- Review before generated or pasted groups of ingredients are added.
- Conservative duplicate merging and compatible-unit conversion.
- Automatic aisle grouping, custom aisle order, reusable staples, and a mobile shopping mode.
- Purchase review for package count, package size, and unexpected purchases before items return to the kitchen.
- Barcode lookup through Open Food Facts with household product memory.

### Planning and household coordination

- Weekly meal planning with breakfast, lunch, dinner, and snack slots.
- Servings, day copying, next-week repeat, reusable templates, and meal reminders.
- Shared kitchens with invite codes, member management, household switching, and recent activity.
- Realtime Supabase synchronization with row-level household security.
- Account-scoped cache, pending-change recovery, conflict protection, and offline reconciliation.

## Design principles

- **Less tracking, more usefulness.** Mise should never require more work than the problem it solves.
- **Review before bulk changes.** Generated grocery lists and imports remain editable before saving.
- **Household-safe by default.** Realtime changes, Undo, and offline recovery must not overwrite another member's work.
- **Private and predictable.** Receipt images are processed in the browser and are not uploaded or stored.
- **Free-tier friendly.** Core recommendations are deterministic; paid AI and analytics services are not required.

## Technology

| Area | Implementation |
| --- | --- |
| Frontend | React, TypeScript, Vite |
| Authentication and database | Supabase Auth and PostgreSQL |
| Realtime collaboration | Supabase Realtime with household-scoped RLS |
| Deployment and server functions | Vercel |
| Barcode scanning | ZXing Browser |
| Product lookup | Open Food Facts through a protected Vercel Function |
| Receipt OCR | Tesseract.js in the browser |
| Optional recipe discovery | Spoonacular through an authenticated Vercel Function |
| Testing | Vitest, ESLint, and TypeScript production builds |

## Run locally

Requirements:

- Node.js 20 or newer
- npm

```bash
git clone https://github.com/Gourav-praneeth/misekitchen.git
cd misekitchen
npm install
npm run dev
```

Open the URL printed by Vite. Without Supabase environment variables, Mise automatically runs as a browser-only demo and stores changes in local storage.

### Quality checks

```bash
npm test
npm run lint
npm run build
```

## Configure Supabase

Mise supports email/password authentication, Google OAuth, private households, realtime collaboration, and household-scoped cloud storage.

1. Create or select a Supabase project.
2. Apply the SQL files in `supabase/migrations` in filename order using the Supabase SQL Editor, or link the repository and run `supabase db push`.
3. Copy `.env.example` to `.env.local`.
4. Add the public browser configuration:

   ```bash
   VITE_SUPABASE_URL=https://your-project.supabase.co
   VITE_SUPABASE_PUBLISHABLE_KEY=your-publishable-key
   ```

5. Add the same public variables to Vercel for Production, Preview, and Development.
6. Configure the production Site URL and the required local/preview redirect URLs in Supabase Authentication.

The publishable key is intentionally available to the browser. Access is enforced through PostgreSQL grants and Row Level Security. Never expose a Supabase secret or service-role key in a `VITE_` environment variable.

### Google sign-in

Create a Web OAuth client in Google Cloud, add the callback URL provided by Supabase to Google's authorized redirect URIs, and configure the client ID and secret in Supabase Authentication → Providers → Google. Keep the Google client secret in Supabase.

## Optional integrations

### Spoonacular recipe discovery

Set `SPOONACULAR_API_KEY` as a private Vercel environment variable and redeploy. Do not prefix it with `VITE_`.

The `/api/spoonacular` function verifies the Supabase access token, applies the user's diet and intolerance settings, and caches responses to reduce quota usage. Use `vercel dev` when testing this function locally.

### Product lookup

The `/api/product` function provides authenticated Open Food Facts lookup, normalized package metadata, friendly unknown-product handling, and short-lived caching.

## Data and privacy

- Household data is accessible only to authenticated members through Supabase RLS policies.
- Personal food preferences remain user-scoped rather than household-shared.
- Receipt photos are processed locally with Tesseract.js and are never uploaded or persisted by Mise.
- Confirmed household food mappings can remember icons, food types, and storage choices.
- Unknown-food trend counts are anonymous and do not store household or user identifiers.
- No Supabase service-role credential is shipped to the browser.

## Current status

Mise is in **private beta**. The core My Kitchen, recipe, meal-planning, grocery, household collaboration, and barcode workflows are implemented.

The current validation priorities are:

1. Complete a physical two-device offline/reconnection test.
2. Validate barcode scanning on a real iPhone across UPC, EAN, GTIN, damaged, and unknown codes.
3. Finish the My Kitchen and Grocery List accessibility and mobile quality pass.
4. Improve the What Can I Make? experience, followed by Meal Planner 2.1.

Receipt-specific refinement is intentionally parked while the higher-frequency kitchen, grocery, and barcode workflows are validated. See [PRODUCT_ROADMAP.md](PRODUCT_ROADMAP.md) for the complete implementation order and decision history.
