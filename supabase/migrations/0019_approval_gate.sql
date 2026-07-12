-- =============================================================================
-- Approval gate. Open sign-up creates an account that is authenticated but NOT
-- yet approved: it sees an "Awaiting access" screen and can read no business
-- data until an admin approves it from the Admin page. This is enforced in RLS
-- (the real fence), not just the UI, so a direct API call leaks nothing either.
-- =============================================================================

-- New flag. Add with default false, but backfill EXISTING accounts to true so
-- nobody already using the app (incl. the first admin) gets locked out.
alter table profiles add column if not exists approved boolean not null default false;
update profiles set approved = true where approved = false;
-- New rows (from the sign-up trigger, which doesn't set it) default to false.

-- is_approved(uid): active AND approved. SECURITY DEFINER so policies can call it.
create or replace function is_approved(uid uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (select 1 from profiles where id = uid and active = true and approved = true);
$$;
grant execute on function is_approved(uuid) to authenticated;

-- has_capability: an unapproved (or inactive) account holds NO capabilities.
create or replace function has_capability(uid uuid, cap text)
returns boolean
language plpgsql stable security definer set search_path = public
as $$
declare
  v_override boolean; v_default boolean; v_role app_role;
  v_active boolean; v_approved boolean;
begin
  if uid is null then return false; end if;
  select role, active, approved into v_role, v_active, v_approved from profiles where id = uid;
  if v_role is null or v_active is false or v_approved is false then return false; end if;

  select granted into v_override from capability_grants where user_id = uid and capability_key = cap;
  if found then return v_override; end if;

  select granted into v_default from role_defaults where role = v_role and capability_key = cap;
  return coalesce(v_default, false);
end;
$$;

-- current_session: still resolves for a pending (active) account so the app can
-- show "Awaiting access"; now carries the `approved` flag. Only a DISABLED
-- account (active=false) returns null (bounced to login).
create or replace function current_session()
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare v_uid uuid := auth.uid(); v_profile record; v_caps jsonb;
begin
  if v_uid is null then return null; end if;
  select id, email, full_name, role, active, approved into v_profile from profiles where id = v_uid;
  if v_profile.id is null or v_profile.active is false then return null; end if;

  select jsonb_object_agg(c.key, has_capability(v_uid, c.key)) into v_caps from capabilities c;

  return jsonb_build_object(
    'profile', jsonb_build_object(
      'id', v_profile.id, 'email', v_profile.email, 'full_name', v_profile.full_name,
      'role', v_profile.role, 'active', v_profile.active, 'approved', v_profile.approved
    ),
    'can', coalesce(v_caps, '{}'::jsonb)
  );
end;
$$;
grant execute on function current_session() to authenticated;

-- -----------------------------------------------------------------------------
-- Gate every business-data SELECT on approval. Capability-gated tables
-- (product_costs, etc.) are already covered because has_capability now returns
-- false for the unapproved. profiles / capabilities / role_defaults stay open —
-- they carry no pricing data and are needed to resolve the session and admin UI.
-- -----------------------------------------------------------------------------
drop policy if exists my_products_select on my_products;
create policy my_products_select on my_products for select to authenticated
  using (is_approved(auth.uid()));

drop policy if exists price_lists_select on price_lists;
create policy price_lists_select on price_lists for select to authenticated
  using (is_approved(auth.uid()));

drop policy if exists competitors_select on competitors;
create policy competitors_select on competitors for select to authenticated
  using (is_approved(auth.uid()));

drop policy if exists competitor_lists_select on competitor_lists;
create policy competitor_lists_select on competitor_lists for select to authenticated
  using (is_approved(auth.uid()));

drop policy if exists competitor_items_select on competitor_items;
create policy competitor_items_select on competitor_items for select to authenticated
  using (is_approved(auth.uid()));

drop policy if exists product_matches_select on product_matches;
create policy product_matches_select on product_matches for select to authenticated
  using (is_approved(auth.uid()));

drop policy if exists price_edits_select on price_edits;
create policy price_edits_select on price_edits for select to authenticated
  using (is_approved(auth.uid()));

drop policy if exists spec_addons_select on spec_addons;
create policy spec_addons_select on spec_addons for select to authenticated
  using (is_approved(auth.uid()));

drop policy if exists flags_select on flags;
create policy flags_select on flags for select to authenticated
  using (is_approved(auth.uid()));

drop policy if exists change_log_select on product_change_log;
create policy change_log_select on product_change_log for select to authenticated
  using (is_approved(auth.uid()));

drop policy if exists documents_select on documents;
create policy documents_select on documents for select to authenticated
  using (is_approved(auth.uid()));

-- The two overlap/unique views bypass RLS by default (they run as owner). Make
-- them respect the querying user's RLS so an unapproved user reading them gets
-- nothing (their underlying tables are now approval-gated).
alter view v_overlap    set (security_invoker = on);
alter view v_unique     set (security_invoker = on);
alter view v_market_gap set (security_invoker = on);
