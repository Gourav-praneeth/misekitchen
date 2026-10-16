alter table public.grocery_items
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists created_by uuid references auth.users(id) on delete set null;

alter table public.grocery_items alter column created_by set default auth.uid();
update public.grocery_items set created_at = updated_at where created_at is null;

create index if not exists grocery_items_household_created_idx
  on public.grocery_items(household_id, created_at desc);

create table if not exists public.household_grocery_read_state (
  household_id uuid not null references public.households(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  last_seen_at timestamptz not null default now(),
  primary key (household_id, user_id)
);

create table if not exists public.household_food_mappings (
  household_id uuid not null references public.households(id) on delete cascade,
  normalized_name text not null,
  display_name text not null,
  emoji text not null default '🥫',
  category text not null check (category in ('Protein', 'Produce', 'Dairy', 'Pantry', 'Other')),
  location text not null check (location in ('Fridge', 'Freezer', 'Pantry')),
  updated_at timestamptz not null default now(),
  primary key (household_id, normalized_name)
);

create table if not exists public.unknown_food_terms (
  normalized_name text primary key,
  occurrence_count bigint not null default 1,
  last_seen_at timestamptz not null default now(),
  status text not null default 'pending' check (status in ('pending', 'mapped', 'ignored'))
);

alter table public.household_grocery_read_state enable row level security;
alter table public.household_food_mappings enable row level security;
alter table public.unknown_food_terms enable row level security;

revoke all on public.household_grocery_read_state, public.household_food_mappings, public.unknown_food_terms from anon, authenticated;
grant select, insert, update on public.household_grocery_read_state to authenticated;
grant select, insert, update, delete on public.household_food_mappings to authenticated;

drop policy if exists "Members manage their grocery read state" on public.household_grocery_read_state;
create policy "Members manage their grocery read state"
on public.household_grocery_read_state for all to authenticated
using (user_id = auth.uid() and public.is_household_member(household_id))
with check (user_id = auth.uid() and public.is_household_member(household_id));

drop policy if exists "Members read household food mappings" on public.household_food_mappings;
create policy "Members read household food mappings"
on public.household_food_mappings for select to authenticated
using (public.is_household_member(household_id));

drop policy if exists "Members manage household food mappings" on public.household_food_mappings;
create policy "Members manage household food mappings"
on public.household_food_mappings for all to authenticated
using (public.is_household_member(household_id))
with check (public.is_household_member(household_id));

create or replace function public.record_unknown_food_term(food_name text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized text;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  normalized := trim(regexp_replace(lower(coalesce(food_name, '')), '[^a-z0-9]+', ' ', 'g'));
  if length(normalized) < 2 or length(normalized) > 80 then return; end if;
  insert into public.unknown_food_terms(normalized_name)
  values (normalized)
  on conflict (normalized_name) do update
    set occurrence_count = public.unknown_food_terms.occurrence_count + 1,
        last_seen_at = now();
end;
$$;

revoke all on function public.record_unknown_food_term(text) from public;
grant execute on function public.record_unknown_food_term(text) to authenticated;

do $$
begin
  alter publication supabase_realtime add table public.grocery_items;
exception when duplicate_object then null;
end $$;
