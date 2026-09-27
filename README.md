# Mise

A kitchen-first food management MVP. Mise helps you understand what is at home, what should be used soon, what you can cook, and what you still need to buy.

## Run locally

```bash
npm install
npm run dev
```

Open the local URL printed by Vite. Inventory and grocery changes are saved in browser local storage.

## Supabase backend

Mise supports email/password authentication and household-scoped cloud synchronization through Supabase. Without Supabase environment variables, it automatically remains a local demo.

1. Create or select a Supabase project.
2. Run [`supabase/migrations/20260927000000_initial_kitchen_schema.sql`](supabase/migrations/20260927000000_initial_kitchen_schema.sql) in the Supabase SQL Editor. If the repository is linked through the Supabase CLI, `supabase db push` applies the migration instead.
3. Copy `.env.example` to `.env.local` and provide:

   ```bash
   VITE_SUPABASE_URL=https://your-project.supabase.co
   VITE_SUPABASE_PUBLISHABLE_KEY=your-publishable-key
   ```

4. Add the same variables to Vercel for Production, Preview, and Development.
5. In Supabase Authentication URL Configuration, set the Site URL to the production Vercel address and add local/preview redirect URLs as needed.

The publishable key is intentionally used by the browser. Authorization is enforced with PostgreSQL grants and Row Level Security. Never expose a Supabase secret or service-role key through a `VITE_` variable.

### Backend behavior

- New accounts automatically receive a private household.
- The first sign-in imports the user's existing local demo kitchen into the cloud.
- Inventory and grocery changes are saved after a short debounce.
- Each query is restricted to authenticated household members by Row Level Security.
- Signed-out users can explicitly continue with a browser-only demo.

## Included in this MVP

- Kitchen status overview with category counts and freshness score
- Expiration-aware “use soon” list
- Inventory search, filters, quantity controls, add, and remove
- Natural-language bulk entry with editable suggestions for quantity, storage, category, icon, and freshness
- Recipe matching against current ingredient quantities
- Prioritization of recipes that rescue expiring food
- Recipe filters for ready-now, quick, and high-protein meals
- Adjustable servings with live ingredient recalculation
- Cooking flow that deducts ingredients from inventory
- Missing-ingredient flow that builds a grocery list
- Purchased-items flow back into the kitchen
- Responsive desktop and mobile layouts

## Next production steps

The current version is deliberately local-first so the product loop can be tested quickly. A production version should add authentication, a persistent database, shared household support, a larger normalized food/recipe catalog, and reliable expiration-date capture.
