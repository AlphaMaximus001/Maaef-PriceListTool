-- =============================================================================
-- Perf: resolve the whole session (profile + every capability) in ONE round
-- trip instead of an auth call + profile query + role_defaults + grants.
-- The heavy lifting (capability resolution) happens inside the DB, which is
-- near-instant; the network cost is a single request.
-- =============================================================================

create or replace function current_session()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid     uuid := auth.uid();
  v_profile record;
  v_caps    jsonb;
begin
  if v_uid is null then return null; end if;

  select id, email, full_name, role, active into v_profile from profiles where id = v_uid;
  if v_profile.id is null or v_profile.active is false then return null; end if;

  select jsonb_object_agg(c.key, has_capability(v_uid, c.key))
    into v_caps
    from capabilities c;

  return jsonb_build_object(
    'profile', jsonb_build_object(
      'id', v_profile.id,
      'email', v_profile.email,
      'full_name', v_profile.full_name,
      'role', v_profile.role,
      'active', v_profile.active
    ),
    'can', coalesce(v_caps, '{}'::jsonb)
  );
end;
$$;

grant execute on function current_session() to authenticated;
