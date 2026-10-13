create table if not exists public.grocery_staple_groups (
  household_id uuid not null references public.households(id) on delete cascade,
  id text not null,
  name text not null check (char_length(trim(name)) between 1 and 80),
  sort_order integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (household_id, id)
);

create table if not exists public.grocery_staples (
  household_id uuid not null references public.households(id) on delete cascade,
  id text not null,
  group_id text not null,
  name text not null check (char_length(trim(name)) between 1 and 120),
  amount numeric not null default 1 check (amount > 0),
  unit text not null default 'item',
  sort_order integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (household_id, id),
  constraint grocery_staples_group_fk foreign key (household_id, group_id)
    references public.grocery_staple_groups(household_id, id) on delete cascade
);

create index if not exists grocery_staples_household_group_idx
  on public.grocery_staples(household_id, group_id, sort_order);

drop trigger if exists grocery_staple_groups_touch_updated_at on public.grocery_staple_groups;
create trigger grocery_staple_groups_touch_updated_at
  before update on public.grocery_staple_groups
  for each row execute procedure public.touch_updated_at();

drop trigger if exists grocery_staples_touch_updated_at on public.grocery_staples;
create trigger grocery_staples_touch_updated_at
  before update on public.grocery_staples
  for each row execute procedure public.touch_updated_at();

alter table public.grocery_staple_groups enable row level security;
alter table public.grocery_staples enable row level security;

revoke all on public.grocery_staple_groups, public.grocery_staples from anon, authenticated;
grant select, insert, update, delete on public.grocery_staple_groups, public.grocery_staples to authenticated;

drop policy if exists "Members can read staple groups" on public.grocery_staple_groups;
create policy "Members can read staple groups" on public.grocery_staple_groups for select to authenticated
using (public.is_household_member(household_id));
drop policy if exists "Members can add staple groups" on public.grocery_staple_groups;
create policy "Members can add staple groups" on public.grocery_staple_groups for insert to authenticated
with check (public.is_household_member(household_id));
drop policy if exists "Members can update staple groups" on public.grocery_staple_groups;
create policy "Members can update staple groups" on public.grocery_staple_groups for update to authenticated
using (public.is_household_member(household_id)) with check (public.is_household_member(household_id));
drop policy if exists "Members can delete staple groups" on public.grocery_staple_groups;
create policy "Members can delete staple groups" on public.grocery_staple_groups for delete to authenticated
using (public.is_household_member(household_id));

drop policy if exists "Members can read staples" on public.grocery_staples;
create policy "Members can read staples" on public.grocery_staples for select to authenticated
using (public.is_household_member(household_id));
drop policy if exists "Members can add staples" on public.grocery_staples;
create policy "Members can add staples" on public.grocery_staples for insert to authenticated
with check (public.is_household_member(household_id));
drop policy if exists "Members can update staples" on public.grocery_staples;
create policy "Members can update staples" on public.grocery_staples for update to authenticated
using (public.is_household_member(household_id)) with check (public.is_household_member(household_id));
drop policy if exists "Members can delete staples" on public.grocery_staples;
create policy "Members can delete staples" on public.grocery_staples for delete to authenticated
using (public.is_household_member(household_id));

drop trigger if exists grocery_staple_groups_activity on public.grocery_staple_groups;
create trigger grocery_staple_groups_activity after insert or update or delete on public.grocery_staple_groups
for each row execute procedure public.capture_kitchen_activity();

drop trigger if exists grocery_staples_activity on public.grocery_staples;
create trigger grocery_staples_activity after insert or update or delete on public.grocery_staples
for each row execute procedure public.capture_kitchen_activity();
