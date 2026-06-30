-- =============================================================================
-- Phase 4 — edit engine. The price mutation runs entirely inside the DB so the
-- undercut guard (invariant 6) can read the cost floor WITHOUT the floor ever
-- leaving the database for a non-view_cost user.
--
--   * Single edits require edit_price; category/list require bulk_edit.
--   * Every applied change writes a price_edits row (invariant 4), grouped by
--     batch_id for category/list operations.
--   * Undercut guard:
--       - view_cost caller: below-floor changes need explicit confirmation
--         (p_confirm_below_floor = true). The preview returns the breaches WITH
--         the floor so the warning can show it.
--       - non-view_cost caller: below-floor changes are silently blocked and
--         never applied. The result reports a count only — never a cost number.
-- =============================================================================

create or replace function mutate_prices(
  p_scope             edit_scope,
  p_operation         edit_operation,
  p_value             numeric,
  p_target_id         uuid default null,
  p_target_category   text default null,
  p_confirm_below_floor boolean default false,
  p_dry_run           boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid        uuid := auth.uid();
  v_can_cost   boolean;
  v_batch      uuid := gen_random_uuid();
  v_applied    int := 0;
  v_blocked    int := 0;
  v_changed    int := 0;
  v_affected   int := 0;
  v_breaches   jsonb := '[]'::jsonb;
  v_breach_cnt int := 0;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  -- Capability gate by scope (invariant 5 — the resolver, not a raw role).
  if p_scope = 'single' then
    if not has_capability(v_uid, 'edit_price') then
      raise exception 'Missing capability: edit_price';
    end if;
  else
    if not has_capability(v_uid, 'bulk_edit') then
      raise exception 'Missing capability: bulk_edit';
    end if;
  end if;

  v_can_cost := has_capability(v_uid, 'view_cost');

  -- Resolve the target set and compute each new price (clamped at 0).
  create temp table _targets on commit drop as
  select
    mp.id,
    mp.price as old_price,
    mp.currency,
    greatest(0, round(
      case p_operation
        when 'percentage' then mp.price * (1 + p_value / 100.0)
        when 'flat'       then mp.price + p_value
        when 'set'        then p_value
      end, 2))::numeric(12,2) as new_price
  from my_products mp
  where mp.active and case p_scope
    when 'single'   then mp.id = p_target_id
    when 'category' then mp.category is not distinct from p_target_category
    when 'list'     then true
    else false end;

  select count(*) into v_affected from _targets;

  -- Only rows whose price actually changes are candidates.
  delete from _targets where new_price = old_price;
  select count(*) into v_changed from _targets;

  -- Flag floor breaches (new price at or below the product's cost).
  alter table _targets add column breaches boolean default false;
  alter table _targets add column floor numeric;
  update _targets t
    set breaches = (t.new_price <= pc.cost), floor = pc.cost
    from product_costs pc
    where pc.product_id = t.id;

  select count(*) into v_breach_cnt from _targets where breaches;

  -- Breach detail is only ever materialized for a view_cost caller.
  if v_can_cost and v_breach_cnt > 0 then
    select coalesce(jsonb_agg(jsonb_build_object(
             'product_id', t.id, 'old_price', t.old_price,
             'new_price', t.new_price, 'floor', t.floor)), '[]'::jsonb)
      into v_breaches
      from _targets t where t.breaches;
  end if;

  -- Decide what to do with breaching rows.
  if not v_can_cost then
    -- Silently block below-floor rows for non-view_cost callers.
    v_blocked := v_breach_cnt;
    delete from _targets where breaches;
  elsif v_breach_cnt > 0 and not p_confirm_below_floor then
    -- view_cost caller must explicitly confirm. Return the warning, change nothing.
    return jsonb_build_object(
      'status', 'needs_confirm',
      'affected', v_affected,
      'changed', v_changed,
      'breach_count', v_breach_cnt,
      'breaches', v_breaches,
      'can_view_cost', v_can_cost
    );
  end if;

  -- Dry run: report what WOULD happen, write nothing.
  if p_dry_run then
    select count(*) into v_applied from _targets;
    return jsonb_build_object(
      'status', 'preview',
      'affected', v_affected,
      'changed', v_changed,
      'would_apply', v_applied,
      'blocked', v_blocked,
      'breach_count', v_breach_cnt,
      'breaches', v_breaches,
      'can_view_cost', v_can_cost
    );
  end if;

  -- Apply: log to the audit trail, then update the live prices.
  insert into price_edits (product_id, old_price, new_price, operation, scope, batch_id, actor)
  select id, old_price, new_price, p_operation, p_scope, v_batch, v_uid from _targets;

  update my_products mp
    set price = t.new_price
    from _targets t
    where mp.id = t.id;

  get diagnostics v_applied = row_count;

  return jsonb_build_object(
    'status', 'applied',
    'affected', v_affected,
    'applied', v_applied,
    'blocked', v_blocked,
    'batch_id', v_batch,
    'can_view_cost', v_can_cost
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- Undo. Restores old_price and marks the edit reverted. Restoring a prior
-- (higher or equal) price can't breach the floor, so no guard is needed.
-- -----------------------------------------------------------------------------
create or replace function undo_price_edit(p_edit_id uuid)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare v_uid uuid := auth.uid(); v_edit price_edits%rowtype;
begin
  if not (has_capability(v_uid,'edit_price') or has_capability(v_uid,'bulk_edit')) then
    raise exception 'Missing capability to undo edits';
  end if;
  select * into v_edit from price_edits where id = p_edit_id;
  if not found then raise exception 'Edit not found'; end if;
  if v_edit.reverted then raise exception 'Already reverted'; end if;

  update my_products set price = v_edit.old_price where id = v_edit.product_id;
  update price_edits set reverted = true where id = p_edit_id;
  return jsonb_build_object('status','reverted','product_id',v_edit.product_id);
end;
$$;

create or replace function undo_price_batch(p_batch_id uuid)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare v_uid uuid := auth.uid(); v_count int := 0;
begin
  if not has_capability(v_uid,'bulk_edit') then
    raise exception 'Missing capability: bulk_edit';
  end if;
  -- Revert each not-yet-reverted edit in the batch back to its old price.
  update my_products mp
    set price = pe.old_price
    from price_edits pe
    where pe.batch_id = p_batch_id and not pe.reverted and pe.product_id = mp.id;
  update price_edits set reverted = true where batch_id = p_batch_id and not reverted;
  get diagnostics v_count = row_count;
  return jsonb_build_object('status','reverted','count',v_count);
end;
$$;

grant execute on function mutate_prices(edit_scope, edit_operation, numeric, uuid, text, boolean, boolean) to authenticated;
grant execute on function undo_price_edit(uuid) to authenticated;
grant execute on function undo_price_batch(uuid) to authenticated;
