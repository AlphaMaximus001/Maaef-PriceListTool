-- =============================================================================
-- Row Level Security — enforces the §4 invariants at the database boundary.
-- App-side capability gating (has_capability) is mirrored here so a leaked or
-- direct API call can never bypass it. RLS is the real fence; the UI is UX.
-- =============================================================================

-- Enable RLS everywhere.
alter table profiles          enable row level security;
alter table capabilities      enable row level security;
alter table role_defaults     enable row level security;
alter table capability_grants enable row level security;
alter table my_products       enable row level security;
alter table product_costs     enable row level security;
alter table spec_addons       enable row level security;
alter table competitors       enable row level security;
alter table competitor_lists  enable row level security;
alter table competitor_items  enable row level security;
alter table product_matches   enable row level security;
alter table price_edits       enable row level security;

-- -----------------------------------------------------------------------------
-- profiles
--   read: any authenticated user (needed to render "who" in audit, admin list).
--   write: holders of manage_users (the resolver — not a raw role — per
--          invariant 5). Users may update their own display name only.
-- -----------------------------------------------------------------------------
create policy profiles_select on profiles
  for select to authenticated using (true);

create policy profiles_update_self on profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid() and role = (select role from profiles where id = auth.uid()));

create policy profiles_manage on profiles
  for all to authenticated
  using (has_capability(auth.uid(), 'manage_users'))
  with check (has_capability(auth.uid(), 'manage_users'));

-- -----------------------------------------------------------------------------
-- capabilities / role_defaults: readable by all authenticated (drives UI gates);
-- mutable only by admins.
-- -----------------------------------------------------------------------------
create policy capabilities_select on capabilities
  for select to authenticated using (true);
create policy capabilities_admin on capabilities
  for all to authenticated using (is_admin(auth.uid())) with check (is_admin(auth.uid()));

create policy role_defaults_select on role_defaults
  for select to authenticated using (true);
create policy role_defaults_admin on role_defaults
  for all to authenticated using (is_admin(auth.uid())) with check (is_admin(auth.uid()));

-- -----------------------------------------------------------------------------
-- capability_grants: a user may read their own grants; admins manage all.
-- (has_capability is SECURITY DEFINER so it reads grants regardless of these.)
-- -----------------------------------------------------------------------------
create policy capability_grants_select_self on capability_grants
  for select to authenticated
  using (user_id = auth.uid() or has_capability(auth.uid(), 'manage_users'));
create policy capability_grants_manage on capability_grants
  for all to authenticated
  using (has_capability(auth.uid(), 'manage_users'))
  with check (has_capability(auth.uid(), 'manage_users'));

-- -----------------------------------------------------------------------------
-- my_products: all authenticated can READ. Writes require an edit capability.
-- (Single edits + configurator -> edit_price; bulk/category -> bulk_edit.
--  Both capabilities can update; the app records the precise scope to price_edits.)
-- -----------------------------------------------------------------------------
create policy my_products_select on my_products
  for select to authenticated using (true);

create policy my_products_update on my_products
  for update to authenticated
  using (has_capability(auth.uid(), 'edit_price') or has_capability(auth.uid(), 'bulk_edit'))
  with check (has_capability(auth.uid(), 'edit_price') or has_capability(auth.uid(), 'bulk_edit'));

create policy my_products_insert on my_products
  for insert to authenticated
  with check (has_capability(auth.uid(), 'edit_price') or has_capability(auth.uid(), 'bulk_edit'));

-- -----------------------------------------------------------------------------
-- product_costs: THE invariant-1 fence. SELECT only with view_cost.
-- No screen/query/export reachable by a non-view_cost user can read this row.
-- Writes also require view_cost (you can't set a floor you can't see).
-- -----------------------------------------------------------------------------
create policy product_costs_select on product_costs
  for select to authenticated
  using (has_capability(auth.uid(), 'view_cost'));

create policy product_costs_write on product_costs
  for all to authenticated
  using (has_capability(auth.uid(), 'view_cost'))
  with check (has_capability(auth.uid(), 'view_cost'));

-- -----------------------------------------------------------------------------
-- spec_addons: readable by all; managed by admins (catalogue config).
-- -----------------------------------------------------------------------------
create policy spec_addons_select on spec_addons
  for select to authenticated using (true);
create policy spec_addons_admin on spec_addons
  for all to authenticated using (is_admin(auth.uid())) with check (is_admin(auth.uid()));

-- -----------------------------------------------------------------------------
-- competitor data: read-only after upload (invariant 3).
-- SELECT for all authenticated. INSERT requires upload_competitor.
-- NO update/delete policies exist -> updates/deletes are denied for everyone
-- (admins included) via the app; cleanup is a DB-admin operation only.
-- -----------------------------------------------------------------------------
create policy competitors_select on competitors
  for select to authenticated using (true);
create policy competitors_insert on competitors
  for insert to authenticated with check (has_capability(auth.uid(), 'upload_competitor'));

create policy competitor_lists_select on competitor_lists
  for select to authenticated using (true);
create policy competitor_lists_insert on competitor_lists
  for insert to authenticated with check (has_capability(auth.uid(), 'upload_competitor'));

create policy competitor_items_select on competitor_items
  for select to authenticated using (true);
create policy competitor_items_insert on competitor_items
  for insert to authenticated with check (has_capability(auth.uid(), 'upload_competitor'));

-- -----------------------------------------------------------------------------
-- product_matches: readable by all; the matcher (server) proposes; confirming
-- requires confirm_match. We allow insert/update to confirm_match holders and
-- enforce the precise confirm/reject semantics in the server action.
-- -----------------------------------------------------------------------------
create policy product_matches_select on product_matches
  for select to authenticated using (true);
create policy product_matches_write on product_matches
  for all to authenticated
  using (has_capability(auth.uid(), 'confirm_match'))
  with check (has_capability(auth.uid(), 'confirm_match'));

-- -----------------------------------------------------------------------------
-- price_edits: audit trail. Readable by all authenticated (the Edit History
-- screen). Inserts require an edit capability. Updates (undo flag) require one
-- too. Never deletable from the app.
-- -----------------------------------------------------------------------------
create policy price_edits_select on price_edits
  for select to authenticated using (true);
create policy price_edits_insert on price_edits
  for insert to authenticated
  with check (has_capability(auth.uid(), 'edit_price') or has_capability(auth.uid(), 'bulk_edit'));
create policy price_edits_update on price_edits
  for update to authenticated
  using (has_capability(auth.uid(), 'edit_price') or has_capability(auth.uid(), 'bulk_edit'))
  with check (has_capability(auth.uid(), 'edit_price') or has_capability(auth.uid(), 'bulk_edit'));

-- -----------------------------------------------------------------------------
-- Role grants. RLS only takes effect once a role has table privileges; these
-- make the schema self-contained rather than relying on Supabase defaults.
-- Row-level access is still fully governed by the policies above — these are
-- table-level gates that the policies sit on top of. Views have no RLS, so
-- their SELECT grant is the access boundary (neither view exposes cost).
-- -----------------------------------------------------------------------------
grant usage on schema public to authenticated;

grant select, insert, update, delete on
  profiles, capabilities, role_defaults, capability_grants,
  my_products, product_costs, spec_addons,
  competitors, competitor_lists, competitor_items,
  product_matches, price_edits
to authenticated;

grant select on v_overlap, v_unique to authenticated;

-- has_capability() must be callable by the request role for UI resolution.
grant execute on function has_capability(uuid, text) to authenticated;
grant execute on function has_capability(text) to authenticated;
