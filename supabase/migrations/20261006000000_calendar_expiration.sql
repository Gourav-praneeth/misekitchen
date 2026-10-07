alter table public.inventory_items
  add column if not exists expires_on date;

update public.inventory_items
set expires_on = current_date + expires_in
where expires_on is null and expires_in is not null;

create index if not exists inventory_items_expires_on_idx
  on public.inventory_items (household_id, expires_on);
