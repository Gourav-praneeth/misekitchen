alter table public.grocery_items
  add column if not exists category text;

alter table public.grocery_items
  drop constraint if exists grocery_items_category_check;

alter table public.grocery_items
  add constraint grocery_items_category_check
  check (category is null or category in ('Protein', 'Produce', 'Dairy', 'Pantry', 'Other'));
