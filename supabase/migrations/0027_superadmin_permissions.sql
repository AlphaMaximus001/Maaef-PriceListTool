-- =============================================================================
-- Superadmin role — part 2 of 2: capabilities + protection rules.
--
-- A Superadmin is an Admin who can also permanently DELETE user accounts
-- (the `delete_users` capability). Nobody else can, at any role.
--
-- Mutual protection ("two superadmins can do nothing against themselves"):
-- a Superadmin account cannot be deleted, demoted, deactivated, or have its
-- access revoked — not by another Superadmin, and not by itself. Enforced by
-- database triggers, so a direct API call can't get around it either.
--
-- Escalation guard: only an existing Superadmin can promote someone TO
-- Superadmin. Otherwise any admin with manage_users could self-promote and
-- walk straight through every rule above.
-- =============================================================================

-- ── The new capability ───────────────────────────────────────────────────────
insert into capabilities (key, label, description) values
  ('delete_users', 'Delete users',
   'Permanently delete a user account and its sign-in. Superadmin only. Superadmin accounts can never be deleted.')
on conflict (key) do update
  set label = excluded.label, description = excluded.description;

-- Nobody below Superadmin gets it.
insert into role_defaults (role, capability_key, granted) values
  ('admin','delete_users',false), ('editor','delete_users',false), ('viewer','delete_users',false)
on conflict (role, capability_key) do update set granted = excluded.granted;

-- Superadmin holds EVERY capability — written as a cross join so any
-- capability added later is covered automatically by re-running this insert.
insert into role_defaults (role, capability_key, granted)
  select 'superadmin', c.key, true from capabilities c
on conflict (role, capability_key) do update set granted = excluded.granted;

-- ── Resolvers ────────────────────────────────────────────────────────────────
create or replace function is_superadmin(uid uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from profiles where id = uid and role = 'superadmin' and active = true
  );
$$;
grant execute on function is_superadmin(uuid) to authenticated;

-- is_admin() gates the admin/permission surface; a Superadmin is an admin too.
create or replace function is_admin(uid uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from profiles
    where id = uid and role in ('admin','superadmin') and active = true
  );
$$;

-- ── Protection: a Superadmin row is immutable in the ways that matter ────────
create or replace function guard_superadmin()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    if old.role = 'superadmin' then
      raise exception 'A Superadmin account cannot be deleted.';
    end if;
    return old;
  end if;

  -- UPDATE. Existing Superadmins can't be demoted, deactivated, or revoked —
  -- by anyone, including themselves and other Superadmins.
  if old.role = 'superadmin' and (
       new.role <> old.role
    or new.active is distinct from old.active
    or new.approved is distinct from old.approved
  ) then
    raise exception 'A Superadmin cannot be demoted, deactivated, or have access revoked.';
  end if;

  -- Only an existing Superadmin may promote someone to Superadmin. auth.uid()
  -- is null for trusted server-side/service-role work (e.g. seeding the first
  -- Superadmin), which is allowed through.
  if new.role = 'superadmin' and old.role <> 'superadmin'
     and auth.uid() is not null and not is_superadmin(auth.uid()) then
    raise exception 'Only a Superadmin can grant the Superadmin role.';
  end if;

  return new;
end; $$;

drop trigger if exists trg_guard_superadmin_update on profiles;
create trigger trg_guard_superadmin_update before update on profiles
  for each row execute function guard_superadmin();

-- BEFORE DELETE on profiles also blocks the cascade from auth.users, so even
-- a service-role deletion of the auth user fails for a Superadmin.
drop trigger if exists trg_guard_superadmin_delete on profiles;
create trigger trg_guard_superadmin_delete before delete on profiles
  for each row execute function guard_superadmin();

-- ── Bootstrapping the first Superadmin ───────────────────────────────────────
-- There is no Superadmin yet, and the UI can't create the first one (only a
-- Superadmin can grant the role). Promote your own account ONCE by running
-- this in the Supabase SQL editor, with your email:
--
--   update profiles set role = 'superadmin' where email = 'you@example.com';
--
-- The guard above allows it because auth.uid() is null in the SQL editor.
