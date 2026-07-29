-- =============================================================================
-- Peer protection: people of the SAME role cannot change each other's access.
--
--   * An Admin cannot change another Admin's role, active state, approval, or
--     per-person capability grants.
--   * A Superadmin cannot change another Superadmin's (0027 already made a
--     Superadmin account immutable; this generalises the rule).
--   * A Superadmin CAN still manage Admins and everyone below — different role.
--   * An Admin still cannot touch a Superadmin (0027), in either direction.
--
-- "Access" means role / active / approved / capability grants / deletion. It
-- does NOT cover editing someone's name or contact details for the directory —
-- peers can still keep each other's profile details tidy.
--
-- Self-actions are unchanged and still governed by the existing rules (you
-- can't demote, deactivate, or revoke yourself).
--
-- auth.uid() is null for trusted server-side/service-role work, which is
-- allowed through — that is how the first Superadmin gets bootstrapped and how
-- admin-created accounts get their initial role.
-- =============================================================================

-- True when the caller is acting on a DIFFERENT person who holds the caller's
-- own role.
create or replace function same_role_as_actor(target_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select auth.uid() is not null
     and target_id is distinct from auth.uid()
     and exists (
       select 1
       from profiles a
       join profiles t on t.id = target_id
       where a.id = auth.uid() and a.role = t.role
     );
$$;
grant execute on function same_role_as_actor(uuid) to authenticated;

-- ── profiles: supersedes guard_superadmin() from 0027 ────────────────────────
create or replace function guard_account_access()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_target uuid := coalesce(new.id, old.id);
begin
  if tg_op = 'DELETE' then
    if old.role = 'superadmin' then
      raise exception 'A Superadmin account cannot be deleted.';
    end if;
    if same_role_as_actor(v_target) then
      raise exception 'You cannot delete an account that holds your own role.';
    end if;
    return old;
  end if;

  -- Superadmin accounts stay immutable in the ways that matter (0027).
  if old.role = 'superadmin' and (
       new.role <> old.role
    or new.active is distinct from old.active
    or new.approved is distinct from old.approved
  ) then
    raise exception 'A Superadmin cannot be demoted, deactivated, or have access revoked.';
  end if;

  -- Peers cannot change each other's access.
  if same_role_as_actor(v_target) and (
       new.role <> old.role
    or new.active is distinct from old.active
    or new.approved is distinct from old.approved
  ) then
    raise exception 'You cannot change the access of someone who holds your own role.';
  end if;

  -- Only a Superadmin may appoint a Superadmin.
  if new.role = 'superadmin' and old.role <> 'superadmin'
     and auth.uid() is not null and not is_superadmin(auth.uid()) then
    raise exception 'Only a Superadmin can grant the Superadmin role.';
  end if;

  return new;
end; $$;

drop trigger if exists trg_guard_superadmin_update on profiles;
drop trigger if exists trg_guard_superadmin_delete on profiles;
drop trigger if exists trg_guard_account_access_update on profiles;
create trigger trg_guard_account_access_update before update on profiles
  for each row execute function guard_account_access();
drop trigger if exists trg_guard_account_access_delete on profiles;
create trigger trg_guard_account_access_delete before delete on profiles
  for each row execute function guard_account_access();

drop function if exists guard_superadmin();

-- ── capability_grants: per-person overrides are "access" too ─────────────────
-- Without this an Admin could simply revoke manage_users from a peer Admin,
-- or from a Superadmin, and walk around every rule above.
create or replace function guard_peer_capability()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_target uuid := coalesce(new.user_id, old.user_id);
  v_target_role app_role;
begin
  select role into v_target_role from profiles where id = v_target;

  if same_role_as_actor(v_target) then
    raise exception 'You cannot change the capabilities of someone who holds your own role.';
  end if;

  if v_target_role = 'superadmin'
     and auth.uid() is not null and not is_superadmin(auth.uid()) then
    raise exception 'Only a Superadmin can change a Superadmin''s capabilities.';
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end; $$;

drop trigger if exists trg_guard_peer_capability on capability_grants;
create trigger trg_guard_peer_capability before insert or update or delete on capability_grants
  for each row execute function guard_peer_capability();
