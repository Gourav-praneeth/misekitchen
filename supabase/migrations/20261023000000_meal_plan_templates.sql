create table if not exists public.meal_plan_templates (
  household_id uuid not null references public.households(id) on delete cascade,
  id text not null,
  name text not null check (char_length(trim(name)) between 1 and 80),
  entries jsonb not null default '[]'::jsonb check (jsonb_typeof(entries) = 'array'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (household_id, id)
);

create index if not exists meal_plan_templates_household_updated_idx
  on public.meal_plan_templates(household_id, updated_at desc);

drop trigger if exists meal_plan_templates_touch_updated_at on public.meal_plan_templates;
create trigger meal_plan_templates_touch_updated_at
  before update on public.meal_plan_templates
  for each row execute procedure public.touch_updated_at();

alter table public.meal_plan_templates enable row level security;

revoke all on public.meal_plan_templates from anon, authenticated;
grant select, insert, update, delete on public.meal_plan_templates to authenticated;

drop policy if exists "Members can read meal plan templates" on public.meal_plan_templates;
create policy "Members can read meal plan templates" on public.meal_plan_templates for select to authenticated
using (public.is_household_member(household_id));

drop policy if exists "Members can add meal plan templates" on public.meal_plan_templates;
create policy "Members can add meal plan templates" on public.meal_plan_templates for insert to authenticated
with check (public.is_household_member(household_id));

drop policy if exists "Members can update meal plan templates" on public.meal_plan_templates;
create policy "Members can update meal plan templates" on public.meal_plan_templates for update to authenticated
using (public.is_household_member(household_id)) with check (public.is_household_member(household_id));

drop policy if exists "Members can delete meal plan templates" on public.meal_plan_templates;
create policy "Members can delete meal plan templates" on public.meal_plan_templates for delete to authenticated
using (public.is_household_member(household_id));

drop trigger if exists meal_plan_templates_activity on public.meal_plan_templates;
create trigger meal_plan_templates_activity after insert or update or delete on public.meal_plan_templates
for each row execute procedure public.capture_kitchen_activity();
