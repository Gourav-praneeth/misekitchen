-- Food type, physical storage, and freshness are independent concepts.
-- This migration is additive and safe to run more than once.

create table if not exists public.household_storage_areas (
  household_id uuid not null references public.households(id) on delete cascade,
  id text not null,
  name text not null,
  condition text not null default 'ambient' check (condition in ('ambient', 'chilled', 'frozen')),
  sort_order integer not null default 0,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (household_id, id)
);

create unique index if not exists household_storage_area_name_idx
  on public.household_storage_areas (household_id, lower(name)) where archived_at is null;

alter table public.household_storage_areas enable row level security;
revoke all on public.household_storage_areas from anon, authenticated;
grant select, insert, update, delete on public.household_storage_areas to authenticated;

drop policy if exists "Members manage household storage areas" on public.household_storage_areas;
create policy "Members manage household storage areas"
on public.household_storage_areas for all to authenticated
using (public.is_household_member(household_id))
with check (public.is_household_member(household_id));

drop trigger if exists household_storage_areas_touch_updated_at on public.household_storage_areas;
create trigger household_storage_areas_touch_updated_at
  before update on public.household_storage_areas
  for each row execute procedure public.touch_updated_at();

create or replace function public.seed_household_storage_areas()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.household_storage_areas (household_id, id, name, condition, sort_order)
  values
    (new.id, 'fridge', 'Fridge', 'chilled', 0),
    (new.id, 'freezer', 'Freezer', 'frozen', 1),
    (new.id, 'pantry', 'Pantry', 'ambient', 2),
    (new.id, 'spice-rack', 'Spice rack', 'ambient', 3)
  on conflict (household_id, id) do nothing;
  return new;
end;
$$;

drop trigger if exists households_seed_storage_areas on public.households;
create trigger households_seed_storage_areas
  after insert on public.households
  for each row execute procedure public.seed_household_storage_areas();

insert into public.household_storage_areas (household_id, id, name, condition, sort_order)
select h.id, area.id, area.name, area.condition, area.sort_order
from public.households h
cross join (values
  ('fridge', 'Fridge', 'chilled', 0),
  ('freezer', 'Freezer', 'frozen', 1),
  ('pantry', 'Pantry', 'ambient', 2),
  ('spice-rack', 'Spice rack', 'ambient', 3)
) as area(id, name, condition, sort_order)
on conflict (household_id, id) do nothing;

alter table public.inventory_items
  add column if not exists food_group text,
  add column if not exists storage_area_id text,
  add column if not exists freshness_policy text;
alter table public.household_food_mappings
  add column if not exists food_group text,
  add column if not exists storage_area_id text,
  add column if not exists freshness_policy text;
alter table public.household_products
  add column if not exists food_group text,
  add column if not exists storage_area_id text,
  add column if not exists freshness_policy text;

update public.inventory_items set
  food_group = coalesce(food_group, case category when 'Protein' then 'Protein' when 'Produce' then 'Produce' when 'Dairy' then 'Dairy & alternatives' else 'Other' end),
  storage_area_id = coalesce(storage_area_id, lower(location)),
  freshness_policy = coalesce(freshness_policy, case when expires_on is null and expires_in is null then 'none' else 'tracked' end);
update public.household_food_mappings set
  food_group = coalesce(food_group, case category when 'Protein' then 'Protein' when 'Produce' then 'Produce' when 'Dairy' then 'Dairy & alternatives' else 'Other' end),
  storage_area_id = coalesce(storage_area_id, lower(location)),
  freshness_policy = coalesce(freshness_policy, 'none');
update public.household_products set
  food_group = coalesce(food_group, case category when 'Protein' then 'Protein' when 'Produce' then 'Produce' when 'Dairy' then 'Dairy & alternatives' else 'Other' end),
  storage_area_id = coalesce(storage_area_id, lower(location)),
  freshness_policy = coalesce(freshness_policy, 'none');

-- Known dry foods intentionally do not participate in freshness tracking.
update public.inventory_items
set freshness_policy = 'none', expires_on = null, expires_in = null
where lower(name) = any(array[
  'rolled oats','oats','rice','quinoa','pasta','flour','cereal','black beans','chickpeas','lentils','beans',
  'peanut butter','almonds','pecans','walnuts','milled flax seeds','chia seeds','hemp seeds','protein powder',
  'cocoa powder','honey','cinnamon','turmeric','kosher salt','salt','black pepper','red chilli powder',
  'red chili powder','chilli powder','chili powder','cumin','paprika','oregano','olive oil','rice vinegar',
  'vinegar','sugar','coffee','tea'
]);

do $$ begin
  alter table public.inventory_items add constraint inventory_food_group_check check (food_group in ('Protein','Produce','Dairy & alternatives','Grains & starches','Legumes','Nuts & seeds','Spices & seasonings','Condiments & oils','Other'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.inventory_items add constraint inventory_freshness_policy_check check (freshness_policy in ('tracked','none'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter publication supabase_realtime add table public.household_storage_areas;
exception when duplicate_object then null; end $$;
alter table public.household_storage_areas replica identity full;

create or replace function public.remember_inventory_product()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.barcode is null then return new; end if;
  insert into public.household_products (
    household_id, barcode, name, emoji, unit, category, location, food_group, storage_area_id, freshness_policy,
    brand, product_image_url, package_amount, package_unit, updated_at
  ) values (
    new.household_id, new.barcode, new.name, new.emoji, new.unit, new.category, new.location,
    new.food_group, new.storage_area_id, new.freshness_policy,
    new.brand, new.product_image_url, new.package_amount, new.package_unit, now()
  )
  on conflict (household_id, barcode) do update set
    name = excluded.name, emoji = excluded.emoji, unit = excluded.unit,
    category = excluded.category, location = excluded.location, food_group = excluded.food_group,
    storage_area_id = excluded.storage_area_id, freshness_policy = excluded.freshness_policy,
    brand = excluded.brand, product_image_url = excluded.product_image_url,
    package_amount = excluded.package_amount, package_unit = excluded.package_unit, updated_at = now();
  return new;
end;
$$;

drop trigger if exists inventory_items_remember_product on public.inventory_items;
create trigger inventory_items_remember_product
  after insert or update on public.inventory_items
  for each row execute procedure public.remember_inventory_product();
