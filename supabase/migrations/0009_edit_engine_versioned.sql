-- =============================================================================
-- Make the edit engine version-aware: edits target a specific list and a locked
-- / original list can never be written (the original stays pristine).
-- =============================================================================

-- Old signature (7 args) is replaced by an 8-arg one that carries the list.
drop function if exists mutate_prices(edit_scope, edit_operation, numeric, uuid, text, boolean, boolean);

create or replace function mutate_prices(
  p_scope             edit_scope,
  p_operation         edit_operation,
  p_value             numeric,
  p_list_id           uuid,
  p_target_id         uuid default null,
  p_target_category   text default null,
  p_confirm_below_floor boolean default false,
  p_dry_run           boolean default false
)
returns jsonb
language plpgsql security definer set search_path = public
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
  if v_uid is null then raise exception 'Not authenticated'; end if;

  if p_scope = 'single' then
    if not has_capability(v_uid, 'edit_price') then raise exception 'Missing capability: edit_price'; end if;
  else
    if not has_capability(v_uid, 'bulk_edit') then raise exception 'Missing capability: bulk_edit'; end if;
  end if;

  -- The original / any locked list is immutable.
  if exists (select 1 from price_lists where id = p_list_id and (locked or is_original)) then
    raise exception 'LIST_LOCKED';
  end if;

  v_can_cost := has_capability(v_uid, 'view_cost');

  create temp table _targets on commit drop as
  select
    mp.id, mp.price as old_price, mp.currency,
    greatest(0, round(
      case p_operation
        when 'percentage' then mp.price * (1 + p_value / 100.0)
        when 'flat'       then mp.price + p_value
        when 'set'        then p_value
      end, 2))::numeric(12,2) as new_price
  from my_products mp
  where mp.active and mp.list_id = p_list_id and case p_scope
    when 'single'   then mp.id = p_target_id
    when 'category' then mp.category is not distinct from p_target_category
    when 'list'     then true
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
    select coalesce(jsonb_agg(jsonb_build_object(
             'product_id', t.id, 'old_price', t.old_price,
             'new_price', t.new_price, 'floor', t.floor)), '[]'::jsonb)
      into v_breaches from _targets t where t.breaches;
  end if;

  if not v_can_cost then
    v_blocked := v_breach_cnt;
    delete from _targets where breaches;
  elsif v_breach_cnt > 0 and not p_confirm_below_floor then
    return jsonb_build_object('status','needs_confirm','affected',v_affected,'changed',v_changed,
      'breach_count',v_breach_cnt,'breaches',v_breaches,'can_view_cost',v_can_cost);
  end if;

  if p_dry_run then
    select count(*) into v_applied from _targets;
    return jsonb_build_object('status','preview','affected',v_affected,'changed',v_changed,
      'would_apply',v_applied,'blocked',v_blocked,'breach_count',v_breach_cnt,
      'breaches',v_breaches,'can_view_cost',v_can_cost);
  end if;

  insert into price_edits (product_id, old_price, new_price, operation, scope, batch_id, actor)
  select id, old_price, new_price, p_operation, p_scope, v_batch, v_uid from _targets;

  update my_products mp set price = t.new_price from _targets t where mp.id = t.id;
  get diagnostics v_applied = row_count;

  return jsonb_build_object('status','applied','affected',v_affected,'applied',v_applied,
    'blocked',v_blocked,'batch_id',v_batch,'can_view_cost',v_can_cost);
end;
$$;

grant execute on function mutate_prices(edit_scope, edit_operation, numeric, uuid, uuid, text, boolean, boolean) to authenticated;

-- -----------------------------------------------------------------------------
-- save_configuration: derive the product's list and refuse if it's locked.
-- -----------------------------------------------------------------------------
create or replace function save_configuration(
  p_product_id uuid,
  p_config     jsonb,
  p_new_price  numeric,
  p_confirm    boolean default false
)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_old_price numeric; v_cost numeric; v_can_cost boolean; v_breach boolean;
  v_list uuid; v_locked boolean; v_batch uuid := gen_random_uuid();
begin
  if not has_capability(v_uid, 'edit_price') then raise exception 'Missing capability: edit_price'; end if;

  select mp.price, mp.list_id into v_old_price, v_list from my_products mp where mp.id = p_product_id and mp.active;
  if not found then raise exception 'Product not found'; end if;

  select (locked or is_original) into v_locked from price_lists where id = v_list;
  if v_locked then raise exception 'LIST_LOCKED'; end if;

  p_new_price := greatest(0, round(p_new_price, 2));
  v_can_cost := has_capability(v_uid, 'view_cost');
  select cost into v_cost from product_costs where product_id = p_product_id;
  v_breach := v_cost is not null and p_new_price <= v_cost;

  if v_breach then
    if not v_can_cost then return jsonb_build_object('status','blocked');
    elsif not p_confirm then return jsonb_build_object('status','needs_confirm','new_price',p_new_price,'floor',v_cost);
    end if;
  end if;

  update my_products set config = coalesce(p_config, '{}'::jsonb) where id = p_product_id;

  if p_new_price <> v_old_price then
    insert into price_edits (product_id, old_price, new_price, operation, scope, batch_id, actor, note)
    values (p_product_id, v_old_price, p_new_price, 'set', 'configurator', v_batch, v_uid, 'Configurator save');
    update my_products set price = p_new_price where id = p_product_id;
  end if;

  return jsonb_build_object('status','applied','new_price',p_new_price);
end;
$$;
