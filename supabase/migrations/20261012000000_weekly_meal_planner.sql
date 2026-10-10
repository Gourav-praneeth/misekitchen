create table if not exists public.meal_plan_entries (
  household_id uuid not null references public.households(id) on delete cascade,
  id text not null,
  plan_date date not null,
  recipe_id text not null,
  servings integer not null default 2 check (servings > 0 and servings <= 24),
  meal_slot text not null default 'dinner' check (meal_slot = 'dinner'),
  created_by uuid not null default auth.uid() references auth.users(id) on delete cascade,
  updated_at timestamptz not null default now(),
  primary key (household_id, id),
  unique (household_id, plan_date, meal_slot)
);

create index if not exists meal_plan_entries_household_date_idx
  on public.meal_plan_entries(household_id, plan_date);

drop trigger if exists meal_plan_entries_touch_updated_at on public.meal_plan_entries;
create trigger meal_plan_entries_touch_updated_at
  before update on public.meal_plan_entries
  for each row execute procedure public.touch_updated_at();

alter table public.meal_plan_entries enable row level security;

revoke all on public.meal_plan_entries from anon, authenticated;
grant select, insert, update, delete on public.meal_plan_entries to authenticated;

create policy "Members can read meal plans"
on public.meal_plan_entries for select to authenticated
using (public.is_household_member(household_id));

create policy "Members can add meal plans"
on public.meal_plan_entries for insert to authenticated
with check (public.is_household_member(household_id) and created_by = auth.uid());

create policy "Members can update meal plans"
on public.meal_plan_entries for update to authenticated
using (public.is_household_member(household_id))
with check (public.is_household_member(household_id));

create policy "Members can delete meal plans"
on public.meal_plan_entries for delete to authenticated
using (public.is_household_member(household_id));
