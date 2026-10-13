alter table public.meal_plan_entries
  drop constraint if exists meal_plan_entries_meal_slot_check;

alter table public.meal_plan_entries
  add constraint meal_plan_entries_meal_slot_check
  check (meal_slot in ('breakfast', 'lunch', 'dinner', 'snack'));
