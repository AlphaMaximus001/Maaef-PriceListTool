-- =============================================================================
-- Personal Dashboard + Department Directory.
--
-- The Dashboard becomes an employee home page. This migration adds the data it
-- needs:
--   * profiles.phone / profiles.title — contact details + designation, shown in
--     the directory. Admin-managed (employees can't self-edit, same as the ID
--     fields — extended in the protect trigger below).
--   * teams / team_members — an admin builds departments and assigns each
--     member a role (lead / hr / member). An employee's Dashboard shows the
--     directory for the team(s) they belong to.
--   * dashboard_prefs — per-employee pinned list, pinned SKU, and free-text
--     notes. Each row is private to its owner (RLS on profile_id = auth.uid()).
-- =============================================================================

-- ── Contact + designation on the profile ────────────────────────────────────
alter table profiles add column if not exists phone text;
alter table profiles add column if not exists title text;   -- job title / designation

-- Directory contact fields are admin-managed, like the ID-defining fields.
-- Extend the existing protect trigger so a non-admin can't change them either.
create or replace function protect_employee_id()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not has_capability(auth.uid(), 'manage_users') then
    new.first_name := old.first_name;
    new.surname    := old.surname;
    new.phone      := old.phone;
    new.title      := old.title;
  end if;
  new.onboard_no := old.onboard_no;  -- never changes
  return new;
end; $$;

-- ── Teams (departments) ──────────────────────────────────────────────────────
create table if not exists teams (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  created_at timestamptz not null default now()
);
create unique index if not exists teams_name_key on teams (lower(name));

create table if not exists team_members (
  id          uuid primary key default gen_random_uuid(),
  team_id     uuid not null references teams (id) on delete cascade,
  profile_id  uuid not null references profiles (id) on delete cascade,
  member_role text not null default 'member' check (member_role in ('lead','hr','member')),
  created_at  timestamptz not null default now(),
  unique (team_id, profile_id)
);
create index if not exists team_members_team_idx    on team_members (team_id);
create index if not exists team_members_profile_idx on team_members (profile_id);

alter table teams        enable row level security;
alter table team_members enable row level security;

-- Any approved teammate can read the directory; only admins build it.
drop policy if exists teams_select on teams;
create policy teams_select on teams for select to authenticated
  using (is_approved(auth.uid()));
drop policy if exists teams_write on teams;
create policy teams_write on teams for all to authenticated
  using (has_capability(auth.uid(),'manage_users'))
  with check (has_capability(auth.uid(),'manage_users'));
grant select, insert, update, delete on teams to authenticated;

drop policy if exists team_members_select on team_members;
create policy team_members_select on team_members for select to authenticated
  using (is_approved(auth.uid()));
drop policy if exists team_members_write on team_members;
create policy team_members_write on team_members for all to authenticated
  using (has_capability(auth.uid(),'manage_users'))
  with check (has_capability(auth.uid(),'manage_users'));
grant select, insert, update, delete on team_members to authenticated;

-- ── Per-employee dashboard preferences (pins + notes) ────────────────────────
create table if not exists dashboard_prefs (
  profile_id        uuid primary key references profiles (id) on delete cascade,
  pinned_list_id    uuid references price_lists (id) on delete set null,
  pinned_product_id uuid references my_products (id) on delete set null,
  notes             text not null default '',
  updated_at        timestamptz not null default now()
);

alter table dashboard_prefs enable row level security;
-- Strictly private: a row is visible and writable only by its owner.
drop policy if exists dash_prefs_select on dashboard_prefs;
create policy dash_prefs_select on dashboard_prefs for select to authenticated
  using (profile_id = auth.uid());
drop policy if exists dash_prefs_insert on dashboard_prefs;
create policy dash_prefs_insert on dashboard_prefs for insert to authenticated
  with check (profile_id = auth.uid());
drop policy if exists dash_prefs_update on dashboard_prefs;
create policy dash_prefs_update on dashboard_prefs for update to authenticated
  using (profile_id = auth.uid()) with check (profile_id = auth.uid());
grant select, insert, update, delete on dashboard_prefs to authenticated;
