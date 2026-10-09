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

### Backend behavior

- New accounts automatically receive a private household.
- The first sign-in imports the user's existing local demo kitchen into the cloud.
- Inventory and grocery changes are saved after a short debounce.
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
- Natural-language bulk entry with editable suggestions for quantity, storage, category, icon, and freshness
- Duplicate detection, quantity merging, and one-click undo for smart entry
- Private in-app beta feedback with lightweight screen context
- Account and sync settings, profile-name updates, password recovery, and an application recovery screen
- Recipe matching against current ingredient quantities
- Prioritization of recipes that rescue expiring food
- Recipe filters for ready-now, quick, and high-protein meals
- Adjustable servings with live ingredient recalculation
- Cooking flow that deducts ingredients from inventory
- Missing-ingredient flow that builds a grocery list
- Purchased-items flow back into the kitchen
- Responsive desktop and mobile layouts

## Next production steps

The current version is ready for private beta testing. The next production investments should be shared household support, a larger normalized food and recipe catalog, reliable expiration-date capture, analytics, and error monitoring.
