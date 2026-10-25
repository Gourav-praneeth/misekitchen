-- Keep household membership visible for older accounts and publish member/activity
-- changes so an open Settings screen stays current. This migration is rerunnable.

insert into public.profiles (id, display_name)
select
  auth_user.id,
  coalesce(
    auth_user.raw_user_meta_data ->> 'display_name',
    auth_user.raw_user_meta_data ->> 'full_name',
    auth_user.raw_user_meta_data ->> 'name',
    auth_user.raw_user_meta_data ->> 'given_name',
    split_part(auth_user.email, '@', 1),
    'Kitchen member'
  )
from auth.users auth_user
on conflict (id) do update
set display_name = case
  when public.profiles.display_name is null or btrim(public.profiles.display_name) = ''
    then excluded.display_name
  else public.profiles.display_name
end;

create or replace function public.list_household_members(target_household_id uuid)
returns table (user_id uuid, display_name text, member_role text, joined_at timestamptz)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_household_member(target_household_id) then
    raise exception 'You do not have access to this kitchen.';
  end if;
  return query
    select
      membership.user_id,
      coalesce(nullif(btrim(profile.display_name), ''), 'Kitchen member'),
      membership.role,
      membership.joined_at
    from public.household_members membership
    left join public.profiles profile on profile.id = membership.user_id
    where membership.household_id = target_household_id
    order by case when membership.role = 'owner' then 0 else 1 end, membership.joined_at;
end;
$$;

revoke all on function public.list_household_members(uuid) from public;
grant execute on function public.list_household_members(uuid) to authenticated;

drop policy if exists "Users can read their memberships" on public.household_members;
drop policy if exists "Members can read household memberships" on public.household_members;
create policy "Members can read household memberships"
on public.household_members for select to authenticated
using (public.is_household_member(household_id));

do $$ begin
  alter publication supabase_realtime add table public.household_members;
exception when duplicate_object then null; end $$;

do $$ begin
  alter publication supabase_realtime add table public.household_activity;
exception when duplicate_object then null; end $$;

alter table public.household_members replica identity full;
alter table public.household_activity replica identity full;
