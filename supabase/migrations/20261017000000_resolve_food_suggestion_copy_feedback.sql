update public.feedback
set
  status = 'resolved',
  resolved_at = now(),
  resolution_note = 'Resolved: ingredient intelligence suggestions now show the food name directly without the “Mise recognizes” prefix.'
where id = 'babd08f1-4f57-495c-b0f1-94f9ad11fd05'::uuid;
