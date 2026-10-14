create table if not exists public.cooking_history (
  id text not null,
  household_id uuid not null references public.households(id) on delete cascade,
  recipe_id text not null,
  recipe_name text not null,
  recipe_emoji text not null default '🍽️',
  servings numeric not null check (servings > 0),
  time_minutes integer not null default 0 check (time_minutes >= 0),
  cooked_at timestamptz not null default now(),
  cooked_by_user_id uuid references auth.users(id) on delete set null default auth.uid(),
  cooked_by_name text not null default 'Kitchen member',
  primary key (household_id, id)
);

create index if not exists cooking_history_household_cooked_idx
  on public.cooking_history(household_id, cooked_at desc);

alter table public.cooking_history enable row level security;
revoke all on public.cooking_history from anon, authenticated;
grant select, insert, delete on public.cooking_history to authenticated;

drop policy if exists "Members can read cooking history" on public.cooking_history;
create policy "Members can read cooking history"
on public.cooking_history for select to authenticated
using (public.is_household_member(household_id));

drop policy if exists "Members can add cooking history" on public.cooking_history;
create policy "Members can add cooking history"
on public.cooking_history for insert to authenticated
with check (
  public.is_household_member(household_id)
  and cooked_by_user_id = auth.uid()
);

drop policy if exists "Actors and owners can remove cooking history" on public.cooking_history;
create policy "Actors and owners can remove cooking history"
on public.cooking_history for delete to authenticated
using (
  cooked_by_user_id = auth.uid()
  or exists (
    select 1 from public.household_members
    where household_members.household_id = cooking_history.household_id
      and household_members.user_id = auth.uid()
      and household_members.role = 'owner'
  )
);
