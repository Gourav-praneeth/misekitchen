-- Publish every household-owned collection that Mise reconciles live.
-- Each block is intentionally independent and rerunnable.
do $$ begin
  alter publication supabase_realtime add table public.inventory_items;
exception when duplicate_object then null; end $$;

do $$ begin
  alter publication supabase_realtime add table public.grocery_items;
exception when duplicate_object then null; end $$;

do $$ begin
  alter publication supabase_realtime add table public.household_recipes;
exception when duplicate_object then null; end $$;

do $$ begin
  alter publication supabase_realtime add table public.meal_plan_entries;
exception when duplicate_object then null; end $$;

do $$ begin
  alter publication supabase_realtime add table public.meal_plan_templates;
exception when duplicate_object then null; end $$;

do $$ begin
  alter publication supabase_realtime add table public.grocery_staple_groups;
exception when duplicate_object then null; end $$;

do $$ begin
  alter publication supabase_realtime add table public.grocery_staples;
exception when duplicate_object then null; end $$;

do $$ begin
  alter publication supabase_realtime add table public.cooking_history;
exception when duplicate_object then null; end $$;

do $$ begin
  alter publication supabase_realtime add table public.household_products;
exception when duplicate_object then null; end $$;

do $$ begin
  alter publication supabase_realtime add table public.household_food_mappings;
exception when duplicate_object then null; end $$;

do $$ begin
  alter publication supabase_realtime add table public.households;
exception when duplicate_object then null; end $$;

alter table public.inventory_items replica identity full;
alter table public.grocery_items replica identity full;
alter table public.household_recipes replica identity full;
alter table public.meal_plan_entries replica identity full;
alter table public.meal_plan_templates replica identity full;
alter table public.grocery_staple_groups replica identity full;
alter table public.grocery_staples replica identity full;
alter table public.cooking_history replica identity full;
alter table public.household_products replica identity full;
alter table public.household_food_mappings replica identity full;
alter table public.households replica identity full;
