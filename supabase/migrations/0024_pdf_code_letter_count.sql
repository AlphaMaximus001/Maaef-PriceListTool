-- =============================================================================
-- Tweak: the "number of letters in the first name" part of the code is now
-- expressed as a LETTER (1→A, 2→B, 3→C, 4→D, 5→E …, capped at Z) instead of a
-- digit. So Asha Rao (first name 4 letters, 1st hire, 1st PDF) -> MAED99R00.
-- =============================================================================

create or replace function record_pdf_export(p_list_id uuid, p_list_name text)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_first text; v_surname text; v_onboard int;
  v_fl text; v_flen int; v_len_letter text; v_sl text; v_cnt bigint; v_code text;
begin
  if not has_capability(v_uid, 'export_pdf') then raise exception 'Missing capability: export_pdf'; end if;

  select first_name, surname, onboard_no into v_first, v_surname, v_onboard from profiles where id = v_uid;

  v_first := coalesce(nullif(regexp_replace(coalesce(v_first, ''), '[^A-Za-z]', '', 'g'), ''), 'X');
  v_fl    := upper(substr(v_first, 1, 1));
  v_flen  := length(v_first);
  -- letter-count -> letter (A=1 … Z=26, capped).
  v_len_letter := chr(64 + least(greatest(v_flen, 1), 26));
  v_sl    := upper(substr(coalesce(nullif(regexp_replace(coalesce(v_surname, ''), '[^A-Za-z]', '', 'g'), ''), v_first), 1, 1));
  v_cnt   := (select count(*) from pdf_exports where generated_by = v_uid);

  v_code := 'M' || v_fl || 'E' || v_len_letter || lpad(coalesce(v_onboard, 99)::text, 2, '0')
          || v_sl || lpad((v_cnt % 100)::text, 2, '0');

  insert into pdf_exports (code, list_id, list_name, generated_by)
    values (v_code, p_list_id, p_list_name, v_uid);
  return v_code;
end; $$;
grant execute on function record_pdf_export(uuid, text) to authenticated;
