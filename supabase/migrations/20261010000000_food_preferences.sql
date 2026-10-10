alter table public.profiles
  add column if not exists diet text,
  add column if not exists intolerances text[] not null default '{}',
  add column if not exists excluded_ingredients text[] not null default '{}';

alter table public.profiles
  drop constraint if exists profiles_diet_check;

alter table public.profiles
  add constraint profiles_diet_check check (
    diet is null or diet in ('Vegetarian', 'Vegan', 'Pescetarian', 'Ketogenic', 'Paleo', 'Whole30', 'Low FODMAP')
  );
