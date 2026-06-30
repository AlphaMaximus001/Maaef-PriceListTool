-- =============================================================================
-- Phase 5 — configurator. Saving a configuration is a single price edit, so it
-- runs through the same audit trail (invariant 4) and undercut guard
-- (invariant 6 / invariant 1) as any other edit.
-- =============================================================================

-- Let bulk_edit holders manage the spec add-on catalogue (resolver, not raw
-- role — invariant 5), instead of the admin-only baseline from 0002.
drop policy if exists spec_addons_admin on spec_addons;
create policy spec_addons_manage on spec_addons
  for all to authenticated
  using (has_capability(auth.uid(), 'bulk_edit'))
  with check (has_capability(auth.uid(), 'bulk_edit'));

-- save_configuration: persist selected add-ons (config) AND the recomputed
-- price together. Add-ons are flat deltas applied by the app; this function
-- only stores the result and guards the floor.
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
  v_uid       uuid := auth.uid();
  v_old_price numeric;
  v_cost      numeric;
  v_can_cost  boolean;
  v_breach    boolean;
  v_batch     uuid := gen_random_uuid();
begin
  if not has_capability(v_uid, 'edit_price') then
    raise exception 'Missing capability: edit_price';
  end if;

  select price into v_old_price from my_products where id = p_product_id and active;
  if not found then raise exception 'Product not found'; end if;

  p_new_price := greatest(0, round(p_new_price, 2));
  v_can_cost := has_capability(v_uid, 'view_cost');

  select cost into v_cost from product_costs where product_id = p_product_id;
  v_breach := v_cost is not null and p_new_price <= v_cost;

  if v_breach then
    if not v_can_cost then
      -- Block silently; never reveal the floor (invariant 1/6).
      return jsonb_build_object('status', 'blocked');
    elsif not p_confirm then
      return jsonb_build_object(
        'status', 'needs_confirm',
        'new_price', p_new_price,
        'floor', v_cost
      );
    end if;
  end if;

  -- Always persist the chosen configuration.
  update my_products set config = coalesce(p_config, '{}'::jsonb) where id = p_product_id;

  -- Only log + change price when the price actually moves.
  if p_new_price <> v_old_price then
    insert into price_edits (product_id, old_price, new_price, operation, scope, batch_id, actor, note)
    values (p_product_id, v_old_price, p_new_price, 'set', 'configurator', v_batch, v_uid, 'Configurator save');
    update my_products set price = p_new_price where id = p_product_id;
  end if;

  return jsonb_build_object('status', 'applied', 'new_price', p_new_price);
end;
$$;

grant execute on function save_configuration(uuid, jsonb, numeric, boolean) to authenticated;
