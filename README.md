# Mise

A kitchen-first food management MVP. Mise helps you understand what is at home, what should be used soon, what you can cook, and what you still need to buy.

## Run locally

```bash
npm install
npm run dev
```

Open the local URL printed by Vite. Inventory and grocery changes are saved in browser local storage.

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
