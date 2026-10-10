alter table public.feedback
  add column if not exists status text not null default 'open'
    check (status in ('open', 'in_progress', 'resolved', 'wont_fix')),
  add column if not exists resolved_at timestamptz,
  add column if not exists resolution_note text;

create index if not exists feedback_status_created_at_idx
  on public.feedback(status, created_at desc);

update public.feedback
set
  status = 'resolved',
  resolved_at = now(),
  resolution_note = case id
    when '1f03ddd2-bc70-48ac-8722-c23407f00364'::uuid then
      'Resolved in 53d063d: compatible duplicate ingredients now merge across manual, Smart Add, and grocery-to-kitchen entry.'
    when '8377a99a-b301-4064-bbb4-762e2f7c0df2'::uuid then
      'Resolved in 53d063d: grocery entries now infer food icons and carry intelligent food details into the kitchen.'
  end
where id in (
  '1f03ddd2-bc70-48ac-8722-c23407f00364'::uuid,
  '8377a99a-b301-4064-bbb4-762e2f7c0df2'::uuid
);
