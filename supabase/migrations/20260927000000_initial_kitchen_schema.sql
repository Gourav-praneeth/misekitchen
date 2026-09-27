create extension if not exists pgcrypto;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now()
);

create table public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'My kitchen',
  created_by uuid not null references auth.users(id) on delete cascade,
  initialized boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.household_members (
  household_id uuid not null references public.households(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  joined_at timestamptz not null default now(),
  primary key (household_id, user_id)
);

create table public.inventory_items (
  household_id uuid not null references public.households(id) on delete cascade,
  id text not null,
  name text not null,
  emoji text not null default '🥫',
  quantity numeric not null default 1 check (quantity >= 0),
  unit text not null default 'item',
  category text not null check (category in ('Protein', 'Produce', 'Dairy', 'Pantry', 'Other')),
  location text not null check (location in ('Fridge', 'Freezer', 'Pantry')),
  expires_in integer check (expires_in is null or expires_in >= 0),
  updated_at timestamptz not null default now(),
  primary key (household_id, id)
);

create table public.grocery_items (
  household_id uuid not null references public.households(id) on delete cascade,
  id text not null,
  name text not null,
  amount numeric not null default 1 check (amount > 0),
  unit text not null default 'item',
  checked boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (household_id, id)
);

create index inventory_items_household_id_idx on public.inventory_items(household_id);
create index grocery_items_household_id_idx on public.grocery_items(household_id);
create index household_members_user_id_idx on public.household_members(user_id);

create or replace function public.is_household_member(target_household_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.household_members
    where household_id = target_household_id and user_id = auth.uid()
  );
$$;

revoke all on function public.is_household_member(uuid) from public;
grant execute on function public.is_household_member(uuid) to authenticated;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  new_household_id uuid;
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)));

  insert into public.households (name, created_by)
  values ('My kitchen', new.id)
  returning id into new_household_id;

  insert into public.household_members (household_id, user_id, role)
  values (new_household_id, new.id, 'owner');

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger inventory_items_touch_updated_at
  before update on public.inventory_items
  for each row execute procedure public.touch_updated_at();

create trigger grocery_items_touch_updated_at
  before update on public.grocery_items
  for each row execute procedure public.touch_updated_at();

alter table public.profiles enable row level security;
alter table public.households enable row level security;
alter table public.household_members enable row level security;
alter table public.inventory_items enable row level security;
alter table public.grocery_items enable row level security;

revoke all on public.profiles, public.households, public.household_members, public.inventory_items, public.grocery_items from anon, authenticated;
grant select, update on public.profiles to authenticated;
grant select, update, delete on public.households to authenticated;
grant select on public.household_members to authenticated;
grant select, insert, update, delete on public.inventory_items to authenticated;
grant select, insert, update, delete on public.grocery_items to authenticated;

create policy "Users can read their profile"
on public.profiles for select to authenticated
using (id = auth.uid());

create policy "Users can update their profile"
on public.profiles for update to authenticated
using (id = auth.uid()) with check (id = auth.uid());

create policy "Members can read their household"
on public.households for select to authenticated
using (public.is_household_member(id));

create policy "Owners can update their household"
on public.households for update to authenticated
using (created_by = auth.uid()) with check (created_by = auth.uid());

create policy "Owners can delete their household"
on public.households for delete to authenticated
using (created_by = auth.uid());

create policy "Users can read their memberships"
on public.household_members for select to authenticated
using (user_id = auth.uid());

create policy "Members can read inventory"
on public.inventory_items for select to authenticated
using (public.is_household_member(household_id));

create policy "Members can add inventory"
on public.inventory_items for insert to authenticated
with check (public.is_household_member(household_id));

create policy "Members can update inventory"
on public.inventory_items for update to authenticated
using (public.is_household_member(household_id))
with check (public.is_household_member(household_id));

create policy "Members can delete inventory"
on public.inventory_items for delete to authenticated
using (public.is_household_member(household_id));

create policy "Members can read groceries"
on public.grocery_items for select to authenticated
using (public.is_household_member(household_id));

create policy "Members can add groceries"
on public.grocery_items for insert to authenticated
with check (public.is_household_member(household_id));

create policy "Members can update groceries"
on public.grocery_items for update to authenticated
using (public.is_household_member(household_id))
with check (public.is_household_member(household_id));

create policy "Members can delete groceries"
on public.grocery_items for delete to authenticated
using (public.is_household_member(household_id));
