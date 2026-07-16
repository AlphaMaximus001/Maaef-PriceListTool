-- =============================================================================
-- Catalogue PDF traceability. Each generated catalogue carries a short code
-- (M<first letter of name>E<3 digits>) printed on every generated page. This
-- table records who generated which code and when, so an admin can search a
-- code back to its creator.
-- =============================================================================

create table if not exists pdf_exports (
  id           uuid primary key default gen_random_uuid(),
  code         text not null,
  list_id      uuid references price_lists (id) on delete set null,
  list_name    text,
  generated_by uuid references profiles (id),
  generated_at timestamptz not null default now()
);
create index if not exists idx_pdf_exports_code on pdf_exports (upper(code));
create index if not exists idx_pdf_exports_when on pdf_exports (generated_at desc);

alter table pdf_exports enable row level security;

-- Anyone who can export records their own code; admins (manage_users) search.
drop policy if exists pdf_exports_insert on pdf_exports;
create policy pdf_exports_insert on pdf_exports for insert to authenticated
  with check (has_capability(auth.uid(),'export_pdf') and generated_by = auth.uid());
drop policy if exists pdf_exports_select on pdf_exports;
create policy pdf_exports_select on pdf_exports for select to authenticated
  using (has_capability(auth.uid(),'manage_users'));
grant select, insert on pdf_exports to authenticated;
