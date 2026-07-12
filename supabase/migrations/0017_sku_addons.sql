-- =============================================================================
-- Per-SKU add-ons. Until now a spec add-on was scoped to a category (applies_to)
-- or global (null). This adds product_id so an add-on can belong to ONE specific
-- product, created and managed right on that SKU's configurator page. Legacy
-- category/global add-ons keep working (product_id null).
-- =============================================================================

alter table spec_addons add column if not exists product_id uuid
  references my_products (id) on delete cascade;
create index if not exists idx_spec_addons_product on spec_addons (product_id);

-- A version copy should carry a product's own add-ons onto the copied rows, the
-- same way costs, matches, and unresolved flags already follow the product.
create or replace function create_list_version(p_source uuid, p_name text)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare v_uid uuid := auth.uid(); v_new uuid;
begin
  if not (has_capability(v_uid, 'edit_price') or has_capability(v_uid, 'bulk_edit')) then
    raise exception 'Missing capability to create a list version';
  end if;
  if coalesce(trim(p_name), '') = '' then raise exception 'A list name is required'; end if;
  if not exists (select 1 from price_lists where id = p_source) then raise exception 'Source list not found'; end if;

  insert into price_lists (name, is_original, locked, created_from, created_by)
    values (trim(p_name), false, false, p_source, v_uid) returning id into v_new;

  create temp table _map on commit drop as
    select mp.id as old_id, gen_random_uuid() as new_id from my_products mp where mp.list_id = p_source;

  insert into my_products (id, list_id, sku, product_name, display_name, category, specs, spec_key, price, currency, config, active)
    select m.new_id, v_new, mp.sku, mp.product_name, mp.display_name, mp.category, mp.specs, mp.spec_key,
           mp.price, mp.currency, mp.config, mp.active
    from my_products mp join _map m on m.old_id = mp.id where mp.list_id = p_source;

  insert into product_costs (product_id, cost, currency, margin_type, margin_value, updated_by, updated_at)
    select m.new_id, pc.cost, pc.currency, pc.margin_type, pc.margin_value, v_uid, now()
    from product_costs pc join _map m on m.old_id = pc.product_id;

  insert into product_matches (my_product_id, competitor_item_id, confidence, method, confirmed, confirmed_by, confirmed_at, rejected)
    select m.new_id, pm.competitor_item_id, pm.confidence, pm.method, pm.confirmed, pm.confirmed_by, pm.confirmed_at, pm.rejected
    from product_matches pm join _map m on m.old_id = pm.my_product_id;

  insert into flags (product_id, list_id, reason, created_by, created_at)
    select m.new_id, v_new, f.reason, f.created_by, f.created_at
    from flags f join _map m on m.old_id = f.product_id
    where f.resolved = false;

  -- Per-SKU add-ons follow their product into the copy.
  insert into spec_addons (name, applies_to, price_delta, currency, active, product_id)
    select sa.name, sa.applies_to, sa.price_delta, sa.currency, sa.active, m.new_id
    from spec_addons sa join _map m on m.old_id = sa.product_id
    where sa.product_id is not null and sa.active;

  return v_new;
end;
$$;
grant execute on function create_list_version(uuid, text) to authenticated;
