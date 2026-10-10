create table if not exists public.household_recipes (
  household_id uuid not null references public.households(id) on delete cascade,
  id text not null,
  created_by uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  description text not null default '',
  time_minutes integer not null default 20 check (time_minutes > 0),
  servings integer not null default 2 check (servings > 0),
  protein_grams numeric not null default 0 check (protein_grams >= 0),
  accent text not null default '#678669',
  emoji text not null default '🍳',
  ingredients jsonb not null default '[]'::jsonb check (jsonb_typeof(ingredients) = 'array'),
  instructions jsonb not null default '[]'::jsonb check (jsonb_typeof(instructions) = 'array'),
  updated_at timestamptz not null default now(),
  primary key (household_id, id)
);

create index if not exists household_recipes_household_id_idx
  on public.household_recipes(household_id);

drop trigger if exists household_recipes_touch_updated_at on public.household_recipes;
create trigger household_recipes_touch_updated_at
  before update on public.household_recipes
  for each row execute procedure public.touch_updated_at();

alter table public.household_recipes enable row level security;

revoke all on public.household_recipes from anon, authenticated;
grant select, insert, update, delete on public.household_recipes to authenticated;

create policy "Members can read recipes"
on public.household_recipes for select to authenticated
using (public.is_household_member(household_id));

create policy "Members can add recipes"
on public.household_recipes for insert to authenticated
with check (public.is_household_member(household_id) and created_by = auth.uid());

create policy "Members can update recipes"
on public.household_recipes for update to authenticated
using (public.is_household_member(household_id))
with check (public.is_household_member(household_id));

create policy "Members can delete recipes"
on public.household_recipes for delete to authenticated
using (public.is_household_member(household_id));
