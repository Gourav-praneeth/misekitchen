-- Keep Mise's default location model intentionally small.
-- Counter was briefly seeded as a fifth default; fold it into Pantry for
-- households that already received it, then archive it without losing data.

update public.inventory_items
set storage_area_id = 'pantry', location = 'Pantry'
where storage_area_id = 'counter';

update public.household_food_mappings
set storage_area_id = 'pantry', location = 'Pantry'
where storage_area_id = 'counter';

update public.household_products
set storage_area_id = 'pantry', location = 'Pantry'
where storage_area_id = 'counter';

update public.household_storage_areas
set archived_at = coalesce(archived_at, now()), updated_at = now()
where id = 'counter';

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
