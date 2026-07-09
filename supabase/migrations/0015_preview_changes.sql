-- =============================================================================
-- Preview detail: the dry-run (and view_cost confirm) results now include the
-- per-product old -> new list so the review dialog can show WHAT changes, not
-- just how many. Prices are client-facing, so this leaks no cost.
-- Signature is unchanged, so create-or-replace is enough.
-- =============================================================================

create or replace function mutate_prices(
  p_scope             edit_scope,
  p_operation         edit_operation,
  p_value             numeric,
  p_list_id           uuid,
  p_target_id         uuid default null,
  p_target_category   text default null,
  p_target_ids        uuid[] default null,
  p_confirm_below_floor boolean default false,
  p_dry_run           boolean default false
)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid(); v_can_cost boolean; v_batch uuid := gen_random_uuid();
  v_applied int := 0; v_blocked int := 0; v_changed int := 0; v_affected int := 0;
  v_breaches jsonb := '[]'::jsonb; v_breach_cnt int := 0; v_changes jsonb := '[]'::jsonb;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;

  if p_scope = 'single' then
    if not has_capability(v_uid, 'edit_price') then raise exception 'Missing capability: edit_price'; end if;
  else
    if not has_capability(v_uid, 'bulk_edit') then raise exception 'Missing capability: bulk_edit'; end if;
  end if;

  if exists (select 1 from price_lists where id = p_list_id and (locked or is_original)) then
    raise exception 'LIST_LOCKED';
  end if;

  v_can_cost := has_capability(v_uid, 'view_cost');

  create temp table _targets on commit drop as
  select mp.id, mp.price as old_price, mp.currency,
    greatest(0, round(
      case p_operation
        when 'percentage' then mp.price * (1 + p_value / 100.0)
        when 'flat'       then mp.price + p_value
        when 'set'        then p_value
      end, 2))::numeric(12,2) as new_price
  from my_products mp
  where mp.active and mp.list_id = p_list_id and case p_scope
    when 'single'    then mp.id = p_target_id
    when 'category'  then mp.category is not distinct from p_target_category
    when 'selection' then mp.id = any(p_target_ids)
    when 'list'      then true
    else false end;

  select count(*) into v_affected from _targets;
  delete from _targets where new_price = old_price;
  select count(*) into v_changed from _targets;

  alter table _targets add column breaches boolean default false;
  alter table _targets add column floor numeric;
  update _targets t set breaches = (t.new_price <= pc.cost), floor = pc.cost
    from product_costs pc where pc.product_id = t.id;
  select count(*) into v_breach_cnt from _targets where breaches;

  if v_can_cost and v_breach_cnt > 0 then
    select coalesce(jsonb_agg(jsonb_build_object('product_id',t.id,'old_price',t.old_price,'new_price',t.new_price,'floor',t.floor)),'[]'::jsonb)
      into v_breaches from _targets t where t.breaches;
  end if;

  -- Non-view_cost: below-floor rows won't be applied, so drop them from scope.
  if not v_can_cost then
    v_blocked := v_breach_cnt; delete from _targets where breaches;
  elsif v_breach_cnt > 0 and not p_confirm_below_floor then
    -- fall through: we still want the changes list on the needs_confirm result
    null;
  end if;

  -- The per-product change list (capped) for the review dialog.
  select coalesce(jsonb_agg(row_to_json(s)), '[]'::jsonb) into v_changes
  from (
    select mp.sku, mp.product_name as name, mp.category, t.old_price as old, t.new_price as new,
           coalesce(t.breaches,false) as breaches
    from _targets t join my_products mp on mp.id = t.id
    order by mp.category, mp.product_name
    limit 500
  ) s;

  if v_can_cost and v_breach_cnt > 0 and not p_confirm_below_floor then
    return jsonb_build_object('status','needs_confirm','affected',v_affected,'changed',v_changed,
      'breach_count',v_breach_cnt,'breaches',v_breaches,'changes',v_changes,'can_view_cost',v_can_cost);
  end if;

  if p_dry_run then
    select count(*) into v_applied from _targets;
    return jsonb_build_object('status','preview','affected',v_affected,'changed',v_changed,
      'would_apply',v_applied,'blocked',v_blocked,'breach_count',v_breach_cnt,
      'breaches',v_breaches,'changes',v_changes,'can_view_cost',v_can_cost);
  end if;

  insert into price_edits (product_id, old_price, new_price, operation, scope, batch_id, actor)
  select id, old_price, new_price, p_operation, p_scope, v_batch, v_uid from _targets;
  update my_products mp set price = t.new_price from _targets t where mp.id = t.id;
  get diagnostics v_applied = row_count;

  return jsonb_build_object('status','applied','affected',v_affected,'applied',v_applied,
    'blocked',v_blocked,'batch_id',v_batch,'can_view_cost',v_can_cost);
end;
$$;
