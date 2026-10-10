# Mise

A kitchen-first food management MVP. Mise helps you understand what is at home, what should be used soon, what you can cook, and what you still need to buy.

## Run locally

```bash
npm install
npm run dev
```

Open the local URL printed by Vite. Inventory and grocery changes are saved in browser local storage.

Run the quality checks before shipping changes:

```bash
npm run lint
npm test
npm run build
```

## Supabase backend

Mise supports email/password authentication and household-scoped cloud synchronization through Supabase. Without Supabase environment variables, it automatically remains a local demo.

1. Create or select a Supabase project.
2. Run the SQL files in `supabase/migrations` in filename order in the Supabase SQL Editor. If the repository is linked through the Supabase CLI, `supabase db push` applies the migrations instead.
3. Copy `.env.example` to `.env.local` and provide:

   ```bash
   VITE_SUPABASE_URL=https://your-project.supabase.co
   VITE_SUPABASE_PUBLISHABLE_KEY=your-publishable-key
   ```

4. Add the same variables to Vercel for Production, Preview, and Development.
5. In Supabase Authentication URL Configuration, set the Site URL to the production Vercel address and add local/preview redirect URLs as needed.

### Google sign-in

The sign-in screen includes Google OAuth. To activate it, create a Web OAuth client in Google Cloud, add the callback URL shown in Supabase Authentication → Providers → Google to Google's authorized redirect URIs, then add the Google Client ID and secret to that Supabase provider. Keep the Google secret in Supabase; it must never be added to a `VITE_` variable.

The publishable key is intentionally used by the browser. Authorization is enforced with PostgreSQL grants and Row Level Security. Never expose a Supabase secret or service-role key through a `VITE_` variable.

### Spoonacular recipe discovery

The optional Discover tab calls Spoonacular through a protected Vercel Function. Add `SPOONACULAR_API_KEY` as a private Vercel environment variable for Production and Preview, then redeploy. Do not prefix this key with `VITE_`; browser-exposed variables would reveal it. The function verifies the user's Supabase access token, searches only when requested, and caches Spoonacular responses for up to 55 minutes. Local Vite mode shows the Discover interface but requires `vercel dev` to run the `/api` function.

### Backend behavior

- New accounts automatically receive a private household.
- The first sign-in imports the user's existing local demo kitchen into the cloud.
- Inventory, grocery, and household recipe changes are saved after a short debounce.
- Signed-in kitchens keep an account-scoped browser cache and a pending-change snapshot so temporary connection loss does not discard edits.
- Failed cloud saves retry automatically, remain available for manual retry, and resume when the browser reconnects.
- Ingredient freshness is stored as a calendar use-by date, with legacy `expires_in` values migrated automatically.
- Each query is restricted to authenticated household members by Row Level Security.
- Signed-out users can explicitly continue with a browser-only demo.
- Signed-in testers can send private, household-scoped feedback. Feedback is insert-only from the app and can be reviewed by project owners in the Supabase table editor.

## Included in this MVP

- Kitchen status overview with category counts and freshness score
- Expiration-aware “use soon” list
- Inventory search, filters, quantity controls, add, and remove
- Smart Entry 2.0 for natural-language notes, multiline receipt text, and on-device receipt-photo OCR, including metric units, storage and freshness cues, and confidence-based review prompts
- Food Intelligence 2.0 with a private offline catalog, receipt-abbreviation normalization, canonical food names, and category, icon, unit, storage, and shelf-life suggestions across smart and manual entry
- Expiration Intelligence with purchased/opened freshness states, storage-aware date estimates, printed-date normalization, and implausible-date warnings
- Stronger duplicate detection across common name/unit variants, quantity merging, and one-click undo
- Private in-app beta feedback with lightweight screen context
- Account and sync settings, profile-name updates, password recovery, and an application recovery screen
- Recipe matching against current ingredient quantities
- Household-scoped My Recipes with create, edit, delete, ingredients, serving data, and cooking instructions
- Optional Spoonacular Discover search protected by Supabase authentication, short-lived caching, attribution, and graceful quota handling
- Prioritization of recipes that rescue expiring food
- Recipe filters for ready-now, quick, and high-protein meals
- Adjustable servings with live ingredient recalculation
- Cooking flow that deducts ingredients from inventory
- Missing-ingredient flow that builds a grocery list
- Purchased-items flow back into the kitchen
- Responsive desktop and mobile layouts

## Next production steps

The current version is ready for private beta testing. The next production investments should be shared household support, catalog expansion based on tester receipts, optional external recipe discovery, analytics, and error monitoring.

Receipt photos are processed in the browser with Tesseract.js. Mise does not upload or persist the image; only the user-reviewed ingredient data is saved.
