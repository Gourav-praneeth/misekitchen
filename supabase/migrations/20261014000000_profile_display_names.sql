update public.profiles profile
set display_name = coalesce(
  auth_user.raw_user_meta_data ->> 'display_name',
  auth_user.raw_user_meta_data ->> 'full_name',
  auth_user.raw_user_meta_data ->> 'name',
  auth_user.raw_user_meta_data ->> 'given_name',
  split_part(auth_user.email, '@', 1)
)
from auth.users auth_user
where profile.id = auth_user.id
  and (
    profile.display_name is null
    or profile.display_name = split_part(auth_user.email, '@', 1)
  );

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
  values (new.id, coalesce(
    new.raw_user_meta_data ->> 'display_name',
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'name',
    new.raw_user_meta_data ->> 'given_name',
    split_part(new.email, '@', 1)
  ));

  insert into public.households (name, created_by)
  values ('My kitchen', new.id)
  returning id into new_household_id;

  insert into public.household_members (household_id, user_id, role)
  values (new_household_id, new.id, 'owner');

  update public.profiles set active_household_id = new_household_id where id = new.id;
  return new;
end;
$$;
