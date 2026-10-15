create table if not exists public.household_products (
  household_id uuid not null references public.households(id) on delete cascade,
  barcode text not null check (barcode ~ '^[0-9]{8,14}$'),
  name text not null,
  emoji text not null default '🥫',
  unit text not null default 'pack',
  category text not null check (category in ('Protein', 'Produce', 'Dairy', 'Pantry', 'Other')),
  location text not null check (location in ('Fridge', 'Freezer', 'Pantry')),
  brand text,
  product_image_url text,
  package_amount numeric check (package_amount is null or package_amount > 0),
  package_unit text,
  updated_at timestamptz not null default now(),
  primary key (household_id, barcode)
);

create index if not exists household_products_updated_idx
  on public.household_products(household_id, updated_at desc);

alter table public.household_products enable row level security;
revoke all on public.household_products from anon, authenticated;
grant select on public.household_products to authenticated;

drop policy if exists "Members can read remembered products" on public.household_products;
create policy "Members can read remembered products"
on public.household_products for select to authenticated
using (public.is_household_member(household_id));

create or replace function public.remember_inventory_product()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.barcode is null then
    return new;
  end if;

  insert into public.household_products (
    household_id, barcode, name, emoji, unit, category, location,
    brand, product_image_url, package_amount, package_unit, updated_at
  ) values (
    new.household_id, new.barcode, new.name, new.emoji, new.unit, new.category, new.location,
    new.brand, new.product_image_url, new.package_amount, new.package_unit, now()
  )
  on conflict (household_id, barcode) do update set
    name = excluded.name,
    emoji = excluded.emoji,
    unit = excluded.unit,
    category = excluded.category,
    location = excluded.location,
    brand = excluded.brand,
    product_image_url = excluded.product_image_url,
    package_amount = excluded.package_amount,
    package_unit = excluded.package_unit,
    updated_at = now();

  return new;
end;
$$;

revoke all on function public.remember_inventory_product() from public;

drop trigger if exists inventory_items_remember_product on public.inventory_items;
create trigger inventory_items_remember_product
  after insert or update of barcode, name, emoji, unit, category, location, brand, product_image_url, package_amount, package_unit
  on public.inventory_items
  for each row execute procedure public.remember_inventory_product();

insert into public.household_products (
  household_id, barcode, name, emoji, unit, category, location,
  brand, product_image_url, package_amount, package_unit, updated_at
)
select
  household_id, barcode, name, emoji, unit, category, location,
  brand, product_image_url, package_amount, package_unit, updated_at
from public.inventory_items
where barcode is not null
on conflict (household_id, barcode) do update set
  name = excluded.name,
  emoji = excluded.emoji,
  unit = excluded.unit,
  category = excluded.category,
  location = excluded.location,
  brand = excluded.brand,
  product_image_url = excluded.product_image_url,
  package_amount = excluded.package_amount,
  package_unit = excluded.package_unit,
  updated_at = excluded.updated_at;
