-- =============================================================================
-- Systematic, collision-free catalogue codes. The code suffix is a global
-- running counter rendered as <letter><2 digits>: A00, A01, … A99, B00, …
-- A DB sequence makes it atomic even under concurrent exports. The full code is
-- M<employee initial>E<suffix>, e.g. MAE-A00 -> "MAEA00".
-- =============================================================================

create sequence if not exists pdf_export_seq;

-- Generate the next code AND record who/when/which-list in one atomic call.
create or replace function record_pdf_export(p_initial text, p_list_id uuid, p_list_name text)
returns text
language plpgsql security definer set search_path = public
as $$
declare
  v_uid  uuid := auth.uid();
  v      bigint;
  v_init text;
  v_code text;
begin
  if not has_capability(v_uid, 'export_pdf') then
    raise exception 'Missing capability: export_pdf';
  end if;

  -- 0-based running index -> letter (A..Z, wraps after 2600) + two digits.
  v := nextval('pdf_export_seq') - 1;
  v_init := upper(substr(regexp_replace(coalesce(p_initial, ''), '[^A-Za-z]', '', 'g'), 1, 1));
  if v_init = '' then v_init := 'X'; end if;

  v_code := 'M' || v_init || 'E'
          || chr((65 + ((v / 100) % 26))::int)
          || lpad((v % 100)::text, 2, '0');

  insert into pdf_exports (code, list_id, list_name, generated_by)
    values (v_code, p_list_id, p_list_name, v_uid);

  return v_code;
end;
$$;
grant execute on function record_pdf_export(text, uuid, text) to authenticated;
