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

revoke all on function public.create_household_invite(uuid) from public;
grant execute on function public.create_household_invite(uuid) to authenticated;
