alter table public.household_recipes
  add column if not exists recipe_source text not null default 'user',
  add column if not exists external_id integer,
  add column if not exists source_url text,
  add column if not exists image_url text;

alter table public.household_recipes
  drop constraint if exists household_recipes_recipe_source_check;

alter table public.household_recipes
  add constraint household_recipes_recipe_source_check
  check (recipe_source in ('user', 'spoonacular'));

create unique index if not exists household_recipes_external_source_idx
  on public.household_recipes(household_id, recipe_source, external_id)
  where external_id is not null;
