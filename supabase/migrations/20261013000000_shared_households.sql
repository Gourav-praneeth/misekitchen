alter table public.profiles
  add column if not exists active_household_id uuid references public.households(id) on delete set null;

update public.profiles profile
set active_household_id = (
  select membership.household_id
  from public.household_members membership
  where membership.user_id = profile.id
  order by membership.joined_at
  limit 1
)
where profile.active_household_id is null;

create table if not exists public.household_invites (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  code text not null unique,
  created_by uuid not null references auth.users(id) on delete cascade,
  expires_at timestamptz not null default (now() + interval '7 days'),
  max_uses integer not null default 8 check (max_uses between 1 and 25),
  use_count integer not null default 0 check (use_count >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists household_invites_household_id_idx
  on public.household_invites(household_id);

alter table public.household_invites enable row level security;
revoke all on public.household_invites from anon, authenticated;

create or replace function public.get_active_household_id()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  selected_id uuid;
begin
  select profile.active_household_id into selected_id
  from public.profiles profile
  where profile.id = auth.uid();

  if selected_id is not null and public.is_household_member(selected_id) then
    return selected_id;
  end if;

  select membership.household_id into selected_id
  from public.household_members membership
  where membership.user_id = auth.uid()
  order by membership.joined_at
  limit 1;

  if selected_id is not null then
    update public.profiles set active_household_id = selected_id where id = auth.uid();
  end if;
  return selected_id;
end;
$$;

create or replace function public.list_my_households()
returns table (id uuid, name text, member_role text, member_count bigint)
language sql
stable
security definer
set search_path = public
as $$
  select household.id, household.name, mine.role, count(all_members.user_id)
  from public.household_members mine
  join public.households household on household.id = mine.household_id
  join public.household_members all_members on all_members.household_id = household.id
  where mine.user_id = auth.uid()
  group by household.id, household.name, mine.role, mine.joined_at
  order by mine.joined_at;
$$;

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
    select membership.user_id, coalesce(profile.display_name, 'Kitchen member'), membership.role, membership.joined_at
    from public.household_members membership
    join public.profiles profile on profile.id = membership.user_id
    where membership.household_id = target_household_id
    order by case when membership.role = 'owner' then 0 else 1 end, membership.joined_at;
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

  return query
    insert into public.household_invites (household_id, code, created_by)
    values (target_household_id, generated_code, auth.uid())
    returning household_invites.code, household_invites.expires_at;
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
begin
  select * into invitation
  from public.household_invites
  where code = upper(regexp_replace(invite_code, '[^a-zA-Z0-9]', '', 'g'))
    and active = true
    and expires_at > now()
    and use_count < max_uses
  for update;

  if invitation.id is null then
    raise exception 'That invite code is invalid or expired.';
  end if;

  insert into public.household_members (household_id, user_id, role)
  values (invitation.household_id, auth.uid(), 'member')
  on conflict do nothing;
  get diagnostics joined_count = row_count;

  if joined_count > 0 then
    update public.household_invites set use_count = use_count + 1 where id = invitation.id;
  end if;
  update public.profiles set active_household_id = invitation.household_id where id = auth.uid();
  return invitation.household_id;
end;
$$;

create or replace function public.set_active_household(target_household_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_household_member(target_household_id) then
    raise exception 'You do not have access to this kitchen.';
  end if;
  update public.profiles set active_household_id = target_household_id where id = auth.uid();
end;
$$;

create or replace function public.rename_household(target_household_id uuid, next_name text)
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
    raise exception 'Only the kitchen owner can rename it.';
  end if;
  if char_length(trim(next_name)) not between 2 and 40 then
    raise exception 'Kitchen names must be between 2 and 40 characters.';
  end if;
  update public.households set name = trim(next_name) where id = target_household_id;
end;
$$;

revoke all on function public.get_active_household_id() from public;
revoke all on function public.list_my_households() from public;
revoke all on function public.list_household_members(uuid) from public;
revoke all on function public.create_household_invite(uuid) from public;
revoke all on function public.join_household_by_code(text) from public;
revoke all on function public.set_active_household(uuid) from public;
revoke all on function public.rename_household(uuid, text) from public;

grant execute on function public.get_active_household_id() to authenticated;
grant execute on function public.list_my_households() to authenticated;
grant execute on function public.list_household_members(uuid) to authenticated;
grant execute on function public.create_household_invite(uuid) to authenticated;
grant execute on function public.join_household_by_code(text) to authenticated;
grant execute on function public.set_active_household(uuid) to authenticated;
grant execute on function public.rename_household(uuid, text) to authenticated;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  new_household_id uuid;
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)));

  insert into public.households (name, created_by)
  values ('My kitchen', new.id)
  returning id into new_household_id;

  insert into public.household_members (household_id, user_id, role)
  values (new_household_id, new.id, 'owner');

  update public.profiles set active_household_id = new_household_id where id = new.id;
  return new;
end;
$$;
