alter table public.households
  add column if not exists hidden_mise_recipe_ids text[] not null default '{}';

create table if not exists public.household_activity (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id text,
  description text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists household_activity_household_created_idx
  on public.household_activity(household_id, created_at desc);

alter table public.household_activity enable row level security;
revoke all on public.household_activity from anon, authenticated;
grant select on public.household_activity to authenticated;

drop policy if exists "Members can read household activity" on public.household_activity;
create policy "Members can read household activity"
on public.household_activity for select to authenticated
using (public.is_household_member(household_id));

create or replace function public.log_household_activity(
  target_household_id uuid,
  activity_action text,
  activity_entity_type text,
  activity_entity_id text,
  activity_description text,
  activity_metadata jsonb default '{}'::jsonb
)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.household_activity (household_id, actor_user_id, action, entity_type, entity_id, description, metadata)
  values (target_household_id, auth.uid(), activity_action, activity_entity_type, activity_entity_id, activity_description, activity_metadata);
$$;

revoke all on function public.log_household_activity(uuid, text, text, text, text, jsonb) from public;

create or replace function public.capture_kitchen_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  row_data jsonb;
  previous_data jsonb;
  kitchen_id uuid;
  item_id text;
  item_name text;
  activity_action text;
  activity_entity text;
begin
  row_data := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  previous_data := case when tg_op = 'UPDATE' then to_jsonb(old) else null end;
  if tg_op = 'UPDATE' and (row_data - 'updated_at') is not distinct from (previous_data - 'updated_at') then
    return new;
  end if;

  kitchen_id := (row_data ->> 'household_id')::uuid;
  item_id := row_data ->> 'id';
  activity_action := case tg_op when 'INSERT' then 'added' when 'UPDATE' then 'updated' else 'removed' end;
  activity_entity := case tg_table_name
    when 'inventory_items' then 'ingredient'
    when 'grocery_items' then 'grocery item'
    when 'household_recipes' then 'recipe'
    when 'meal_plan_entries' then 'meal plan'
    else tg_table_name
  end;
  item_name := coalesce(row_data ->> 'name', row_data ->> 'recipe_id', 'Meal plan');

  perform public.log_household_activity(
    kitchen_id,
    activity_action,
    activity_entity,
    item_id,
    item_name || ' ' || activity_action,
    jsonb_build_object('table', tg_table_name)
  );
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists inventory_items_activity on public.inventory_items;
create trigger inventory_items_activity after insert or update or delete on public.inventory_items
for each row execute procedure public.capture_kitchen_activity();

drop trigger if exists grocery_items_activity on public.grocery_items;
create trigger grocery_items_activity after insert or update or delete on public.grocery_items
for each row execute procedure public.capture_kitchen_activity();

drop trigger if exists household_recipes_activity on public.household_recipes;
create trigger household_recipes_activity after insert or update or delete on public.household_recipes
for each row execute procedure public.capture_kitchen_activity();

drop trigger if exists meal_plan_entries_activity on public.meal_plan_entries;
create trigger meal_plan_entries_activity after insert or update or delete on public.meal_plan_entries
for each row execute procedure public.capture_kitchen_activity();

create or replace function public.get_active_household_invite(target_household_id uuid)
returns table (invite_code text, expires_at timestamptz, use_count integer, max_uses integer)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.household_members
    where household_id = target_household_id and user_id = auth.uid() and role = 'owner'
  ) then
    raise exception 'Only the kitchen owner can view invite codes.';
  end if;
  return query
    select invite.code, invite.expires_at, invite.use_count, invite.max_uses
    from public.household_invites invite
    where invite.household_id = target_household_id
      and invite.active = true and invite.expires_at > now() and invite.use_count < invite.max_uses
    order by invite.created_at desc limit 1;
end;
$$;

create or replace function public.create_household_invite(target_household_id uuid)
returns table (invite_code text, expires_at timestamptz)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  generated_code text;
begin
  if not exists (
    select 1 from public.household_members
    where household_id = target_household_id and user_id = auth.uid() and role = 'owner'
  ) then
    raise exception 'Only the kitchen owner can create invite codes.';
  end if;
  update public.household_invites set active = false
  where household_id = target_household_id and active = true;
  loop
    generated_code := upper(encode(extensions.gen_random_bytes(5), 'hex'));
    exit when not exists (select 1 from public.household_invites where code = generated_code);
  end loop;
  perform public.log_household_activity(target_household_id, 'created', 'invite', generated_code, 'Created a kitchen invite', '{}'::jsonb);
  return query
    insert into public.household_invites (household_id, code, created_by)
    values (target_household_id, generated_code, auth.uid())
    returning household_invites.code, household_invites.expires_at;
end;
$$;

create or replace function public.revoke_household_invite(target_household_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.household_members
    where household_id = target_household_id and user_id = auth.uid() and role = 'owner'
  ) then
    raise exception 'Only the kitchen owner can revoke invite codes.';
  end if;
  update public.household_invites set active = false
  where household_id = target_household_id and active = true;
  perform public.log_household_activity(target_household_id, 'revoked', 'invite', null, 'Revoked the active kitchen invite', '{}'::jsonb);
end;
$$;

create or replace function public.join_household_by_code(invite_code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  invitation public.household_invites%rowtype;
  joined_count integer;
  joining_name text;
begin
  select * into invitation from public.household_invites
  where code = upper(regexp_replace(invite_code, '[^a-zA-Z0-9]', '', 'g'))
    and active = true and expires_at > now() and use_count < max_uses
  for update;
  if invitation.id is null then raise exception 'That invite code is invalid or expired.'; end if;
  insert into public.household_members (household_id, user_id, role)
  values (invitation.household_id, auth.uid(), 'member') on conflict do nothing;
  get diagnostics joined_count = row_count;
  if joined_count > 0 then
    update public.household_invites set use_count = use_count + 1 where id = invitation.id;
    select coalesce(display_name, 'A new member') into joining_name from public.profiles where id = auth.uid();
    perform public.log_household_activity(invitation.household_id, 'joined', 'member', auth.uid()::text, joining_name || ' joined the kitchen', '{}'::jsonb);
  end if;
  update public.profiles set active_household_id = invitation.household_id where id = auth.uid();
  return invitation.household_id;
end;
$$;

create or replace function public.set_household_member_role(target_household_id uuid, target_user_id uuid, next_role text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  member_name text;
  current_role text;
begin
  if next_role not in ('owner', 'member') then raise exception 'Unknown kitchen role.'; end if;
  if not exists (select 1 from public.household_members where household_id = target_household_id and user_id = auth.uid() and role = 'owner') then
    raise exception 'Only a kitchen owner can manage roles.';
  end if;
  select membership.role, coalesce(profile.display_name, 'Kitchen member') into current_role, member_name
  from public.household_members membership join public.profiles profile on profile.id = membership.user_id
  where membership.household_id = target_household_id and membership.user_id = target_user_id;
  if current_role is null then raise exception 'That person is not a member of this kitchen.'; end if;
  if current_role = 'owner' and next_role = 'member' and (select count(*) from public.household_members where household_id = target_household_id and role = 'owner') <= 1 then
    raise exception 'A shared kitchen must keep at least one owner.';
  end if;
  update public.household_members set role = next_role where household_id = target_household_id and user_id = target_user_id;
  perform public.log_household_activity(target_household_id, 'updated', 'member', target_user_id::text, member_name || ' is now a kitchen ' || next_role, jsonb_build_object('role', next_role));
end;
$$;

create or replace function public.remove_household_member(target_household_id uuid, target_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  member_name text;
  member_role text;
begin
  if not exists (select 1 from public.household_members where household_id = target_household_id and user_id = auth.uid() and role = 'owner') then
    raise exception 'Only a kitchen owner can remove members.';
  end if;
  if target_user_id = auth.uid() then raise exception 'Switch ownership before removing yourself.'; end if;
  select membership.role, coalesce(profile.display_name, 'Kitchen member') into member_role, member_name
  from public.household_members membership join public.profiles profile on profile.id = membership.user_id
  where membership.household_id = target_household_id and membership.user_id = target_user_id;
  if member_role is null then raise exception 'That person is not a member of this kitchen.'; end if;
  if member_role = 'owner' then raise exception 'Change this owner to a member before removing them.'; end if;
  delete from public.household_members where household_id = target_household_id and user_id = target_user_id;
  update public.profiles profile
  set active_household_id = (
    select membership.household_id from public.household_members membership
    where membership.user_id = target_user_id order by membership.joined_at limit 1
  )
  where profile.id = target_user_id and profile.active_household_id = target_household_id;
  perform public.log_household_activity(target_household_id, 'removed', 'member', target_user_id::text, member_name || ' was removed from the kitchen', '{}'::jsonb);
end;
$$;

create or replace function public.list_household_activity(target_household_id uuid, activity_limit integer default 30)
returns table (id uuid, actor_user_id uuid, actor_name text, action text, entity_type text, entity_id text, description text, created_at timestamptz)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_household_member(target_household_id) then raise exception 'You do not have access to this kitchen.'; end if;
  return query
    select activity.id, activity.actor_user_id, coalesce(profile.display_name, 'Mise'), activity.action,
      activity.entity_type, activity.entity_id, activity.description, activity.created_at
    from public.household_activity activity
    left join public.profiles profile on profile.id = activity.actor_user_id
    where activity.household_id = target_household_id
    order by activity.created_at desc
    limit greatest(1, least(activity_limit, 100));
end;
$$;

create or replace function public.set_mise_recipe_hidden(target_household_id uuid, recipe_id text, recipe_name text, hidden boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_household_member(target_household_id) then raise exception 'You do not have access to this kitchen.'; end if;
  if hidden then
    update public.households
    set hidden_mise_recipe_ids = case when recipe_id = any(hidden_mise_recipe_ids) then hidden_mise_recipe_ids else array_append(hidden_mise_recipe_ids, recipe_id) end
    where id = target_household_id;
  else
    update public.households set hidden_mise_recipe_ids = array_remove(hidden_mise_recipe_ids, recipe_id) where id = target_household_id;
  end if;
  perform public.log_household_activity(target_household_id, case when hidden then 'removed' else 'restored' end, 'Mise recipe', recipe_id,
    recipe_name || case when hidden then ' removed' else ' restored' end, '{}'::jsonb);
end;
$$;

revoke all on function public.get_active_household_invite(uuid) from public;
revoke all on function public.create_household_invite(uuid) from public;
revoke all on function public.revoke_household_invite(uuid) from public;
revoke all on function public.join_household_by_code(text) from public;
revoke all on function public.set_household_member_role(uuid, uuid, text) from public;
revoke all on function public.remove_household_member(uuid, uuid) from public;
revoke all on function public.list_household_activity(uuid, integer) from public;
revoke all on function public.set_mise_recipe_hidden(uuid, text, text, boolean) from public;

grant execute on function public.get_active_household_invite(uuid) to authenticated;
grant execute on function public.create_household_invite(uuid) to authenticated;
grant execute on function public.revoke_household_invite(uuid) to authenticated;
grant execute on function public.join_household_by_code(text) to authenticated;
grant execute on function public.set_household_member_role(uuid, uuid, text) to authenticated;
grant execute on function public.remove_household_member(uuid, uuid) to authenticated;
grant execute on function public.list_household_activity(uuid, integer) to authenticated;
grant execute on function public.set_mise_recipe_hidden(uuid, text, text, boolean) to authenticated;
