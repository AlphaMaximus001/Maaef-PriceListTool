-- =============================================================================
-- Every account must have a first name AND a surname (they drive the PDF
-- employee ID). Someone without a surname enters their first name in both
-- fields — so that is also how missing surnames are filled in here.
--
--   1. Backfill: surname := first name wherever it is missing.
--   2. New accounts: the sign-up hook applies the same rule, and builds the
--      display name without repeating it ("Asha", not "Asha Asha").
--   3. A CHECK constraint makes both mandatory from now on.
--
-- Accounts that signed up before names were collected carry their EMAIL as a
-- first name. Those are not guessed at here — the Admin page flags them so an
-- admin can set the real name with the pencil.
-- =============================================================================

-- protect_employee_id() reverts name changes made by anyone without
-- manage_users, and a migration runs with no signed-in user — it would silently
-- undo this backfill. Pause it for the backfill only.
alter table profiles disable trigger trg_protect_employee_id;

update profiles
   set first_name = coalesce(
         nullif(btrim(first_name), ''),
         nullif(btrim(regexp_replace(btrim(coalesce(full_name, '')), '\s.*$', '')), ''),
         email)
 where nullif(btrim(first_name), '') is null;

-- Prefer the last word of a multi-word full name ("Ravi Kumar" → "Kumar");
-- only a genuinely single-word name falls back to the first name.
update profiles
   set surname = coalesce(
         case when btrim(coalesce(full_name, '')) ~ '\s'
                   and position('@' in full_name) = 0
              then nullif(btrim(regexp_replace(btrim(full_name), '^.*\s', '')), '') end,
         btrim(first_name))
 where nullif(btrim(surname), '') is null;

alter table profiles enable trigger trg_protect_employee_id;

alter table profiles drop constraint if exists profiles_names_required;
alter table profiles add constraint profiles_names_required
  check (nullif(btrim(first_name), '') is not null and nullif(btrim(surname), '') is not null);

-- ── New-user hook: never leaves a name empty ─────────────────────────────────
create or replace function handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_full text := coalesce(new.raw_user_meta_data ->> 'full_name', '');
  v_first text;
  v_surname text;
  v_seq bigint := nextval('profile_onboard_seq');
begin
  -- The app always sends first_name + surname. The email fallback only applies to
  -- accounts created outside the app (e.g. the Supabase dashboard) — it is
  -- deliberately conspicuous so the Admin page flags it for a real name.
  v_first := coalesce(
    nullif(btrim(new.raw_user_meta_data ->> 'first_name'), ''),
    nullif(btrim(regexp_replace(btrim(v_full), '\s.*$', '')), ''),
    new.email);
  v_surname := coalesce(
    nullif(btrim(new.raw_user_meta_data ->> 'surname'), ''),
    v_first);  -- no surname → first name again (the house rule)

  insert into public.profiles (id, email, full_name, first_name, surname, onboard_no, role)
  values (
    new.id, new.email,
    case when lower(v_surname) = lower(v_first) then v_first else v_first || ' ' || v_surname end,
    v_first, v_surname, (100 - v_seq)::int, 'viewer')
  on conflict (id) do nothing;
  return new;
end; $$;
