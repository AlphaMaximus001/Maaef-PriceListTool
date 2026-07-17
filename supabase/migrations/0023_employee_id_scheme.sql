-- =============================================================================
-- Employee ID scheme for catalogue PDF codes.
--
-- Full printed code = FIXED employee ID + per-PDF suffix:
--   FIXED  = M + <first letter of first name> + E + <#letters in first name>
--            + <onboarding countdown, 2 digits: earliest hire = 99, then 98…>
--   SUFFIX = <first letter of surname> + <this employee's PDF count, 00–99>
-- e.g. Asha Rao, 1st hire, 1st PDF -> MAE499R00.
--
-- The fixed part is DERIVED from the current name (so an admin typo-fix updates
-- it) except the onboarding number, which is assigned once and never changes.
-- Employees cannot edit the name fields the ID derives from (trigger-enforced).
-- =============================================================================

alter table profiles add column if not exists first_name text;
alter table profiles add column if not exists surname    text;
alter table profiles add column if not exists onboard_no int;

create sequence if not exists profile_onboard_seq;

-- ── Backfill existing accounts: split full_name, assign onboarding numbers ────
-- Earliest created_at = 99, counting down. Runs BEFORE the lock trigger exists.
do $$
declare r record; i int := 0;
begin
  for r in select id, full_name from profiles where onboard_no is null order by created_at asc, id asc loop
    update profiles set
      first_name = coalesce(first_name, nullif(trim(regexp_replace(trim(coalesce(full_name,'')), '\s.*$', '')), '')),
      surname    = coalesce(surname,    nullif(trim(regexp_replace(trim(coalesce(full_name,'')), '^.*\s', '')), '')),
      onboard_no = 99 - i
    where id = r.id;
    i := i + 1;
  end loop;
  -- Next signup continues the countdown (is_called=false => next nextval = i+1).
  perform setval('profile_onboard_seq', i + 1, false);
end $$;

-- ── New-user hook: capture first/surname + assign the fixed onboarding number ─
create or replace function handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_full text := coalesce(new.raw_user_meta_data ->> 'full_name', '');
  v_first text;
  v_surname text;
  v_seq bigint := nextval('profile_onboard_seq');
begin
  v_first := coalesce(
    nullif(new.raw_user_meta_data ->> 'first_name', ''),
    nullif(trim(regexp_replace(trim(v_full), '\s.*$', '')), ''),
    new.email);
  v_surname := coalesce(
    nullif(new.raw_user_meta_data ->> 'surname', ''),
    nullif(trim(regexp_replace(trim(v_full), '^.*\s', '')), ''));

  insert into public.profiles (id, email, full_name, first_name, surname, onboard_no, role)
  values (
    new.id, new.email,
    coalesce(nullif(trim(coalesce(v_first,'') || ' ' || coalesce(v_surname,'')), ''), new.email),
    v_first, v_surname, (100 - v_seq)::int, 'viewer')
  on conflict (id) do nothing;
  return new;
end; $$;

-- ── Lock the ID-defining fields against employee edits ───────────────────────
-- Only admins (manage_users) may change first_name/surname; the onboarding
-- number is immutable for everyone once set.
create or replace function protect_employee_id()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not has_capability(auth.uid(), 'manage_users') then
    new.first_name := old.first_name;
    new.surname    := old.surname;
  end if;
  new.onboard_no := old.onboard_no;  -- never changes
  return new;
end; $$;
drop trigger if exists trg_protect_employee_id on profiles;
create trigger trg_protect_employee_id before update on profiles
  for each row execute function protect_employee_id();

-- ── record_pdf_export: build the code from the profile + per-employee count ──
drop function if exists record_pdf_export(text, uuid, text);
create or replace function record_pdf_export(p_list_id uuid, p_list_name text)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_first text; v_surname text; v_onboard int;
  v_fl text; v_flen int; v_sl text; v_cnt bigint; v_code text;
begin
  if not has_capability(v_uid, 'export_pdf') then raise exception 'Missing capability: export_pdf'; end if;

  select first_name, surname, onboard_no into v_first, v_surname, v_onboard from profiles where id = v_uid;

  -- Letters-only first name -> first letter + length.
  v_first := coalesce(nullif(regexp_replace(coalesce(v_first, ''), '[^A-Za-z]', '', 'g'), ''), 'X');
  v_fl    := upper(substr(v_first, 1, 1));
  v_flen  := length(v_first);
  -- Surname initial; fall back to the first-name initial when no surname.
  v_sl    := upper(substr(coalesce(nullif(regexp_replace(coalesce(v_surname, ''), '[^A-Za-z]', '', 'g'), ''), v_first), 1, 1));
  -- This employee's PDF count so far (0-based -> first PDF = 00), wraps at 100.
  v_cnt   := (select count(*) from pdf_exports where generated_by = v_uid);

  v_code := 'M' || v_fl || 'E' || v_flen::text || lpad(coalesce(v_onboard, 99)::text, 2, '0')
          || v_sl || lpad((v_cnt % 100)::text, 2, '0');

  insert into pdf_exports (code, list_id, list_name, generated_by)
    values (v_code, p_list_id, p_list_name, v_uid);
  return v_code;
end; $$;
grant execute on function record_pdf_export(uuid, text) to authenticated;

drop sequence if exists pdf_export_seq;  -- old global counter, no longer used
