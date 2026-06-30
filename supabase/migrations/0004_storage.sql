-- =============================================================================
-- Storage: archive every intake file's original (brief F1 "archive the
-- original to Storage"). Private bucket; access mirrors the capability model.
-- =============================================================================

insert into storage.buckets (id, name, public)
values ('intake-archives', 'intake-archives', false)
on conflict (id) do nothing;

-- Any authenticated user may read archived originals (they're reference data;
-- competitor prices are visible app-wide anyway). Cost is never archived here.
drop policy if exists "intake archives read" on storage.objects;
create policy "intake archives read" on storage.objects
  for select to authenticated
  using (bucket_id = 'intake-archives');

-- Upload requires a capability that produces intake: competitor upload, or an
-- edit/bulk capability for the my-list import. Enforced again in the action.
drop policy if exists "intake archives write" on storage.objects;
create policy "intake archives write" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'intake-archives'
    and (
      has_capability(auth.uid(), 'upload_competitor')
      or has_capability(auth.uid(), 'bulk_edit')
      or has_capability(auth.uid(), 'edit_price')
    )
  );
