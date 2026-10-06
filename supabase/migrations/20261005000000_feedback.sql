create table public.feedback (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  category text not null check (category in ('idea', 'problem', 'confusing', 'other')),
  message text not null check (char_length(message) between 3 and 2000),
  context jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index feedback_household_id_idx on public.feedback(household_id);
create index feedback_created_at_idx on public.feedback(created_at desc);

alter table public.feedback enable row level security;

revoke all on public.feedback from anon, authenticated;
grant insert on public.feedback to authenticated;

create policy "Members can send feedback"
on public.feedback for insert to authenticated
with check (
  user_id = auth.uid()
  and public.is_household_member(household_id)
);
