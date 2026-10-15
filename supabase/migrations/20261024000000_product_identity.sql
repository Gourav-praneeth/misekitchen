alter table public.inventory_items
  add column if not exists barcode text,
  add column if not exists brand text,
  add column if not exists product_image_url text,
  add column if not exists package_amount numeric,
  add column if not exists package_unit text,
  add column if not exists product_source text;

alter table public.inventory_items
  drop constraint if exists inventory_items_barcode_digits,
  add constraint inventory_items_barcode_digits
    check (barcode is null or barcode ~ '^[0-9]{8,14}$'),
  drop constraint if exists inventory_items_package_amount_positive,
  add constraint inventory_items_package_amount_positive
    check (package_amount is null or package_amount > 0),
  drop constraint if exists inventory_items_product_source_known,
  add constraint inventory_items_product_source_known
    check (product_source is null or product_source in ('open-food-facts', 'household'));

create index if not exists inventory_items_household_barcode_idx
  on public.inventory_items (household_id, barcode)
  where barcode is not null;
