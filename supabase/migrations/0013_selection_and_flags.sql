-- =============================================================================
-- Group B DB: a "selection" edit scope (apply to a hand-picked set of SKUs),
-- and per-SKU flags (multiple flags per item, resolvable by creator/admin).
-- =============================================================================

-- New scope for editing an arbitrary set of products.
alter type edit_scope add value if not exists 'selection';

-- ── flags: multiple per item; carry to new versions until resolved ───────────
create table if not exists flags (
  id          uuid primary key default gen_random_uuid(),
  product_id  uuid not null references my_products (id) on delete cascade,
  list_id     uuid references price_lists (id) on delete cascade,
  reason      text not null,
  created_by  uuid references profiles (id),
  created_at  timestamptz not null default now(),
  resolved    boolean not null default false,
  resolved_by uuid references profiles (id),
  resolved_at timestamptz
);
create index if not exists idx_flags_product on flags (product_id);
create index if not exists idx_flags_open on flags (product_id) where resolved = false;

alter table flags enable row level security;

-- Any signed-in user can see flags and raise a flag (as themselves).
drop policy if exists flags_select on flags;
create policy flags_select on flags for select to authenticated using (true);
drop policy if exists flags_insert on flags;
create policy flags_insert on flags for insert to authenticated
  with check (created_by = auth.uid());
-- Only the flag's creator or an admin may resolve/update it.
drop policy if exists flags_update on flags;
create policy flags_update on flags for update to authenticated
  using (created_by = auth.uid() or is_admin(auth.uid()))
  with check (created_by = auth.uid() or is_admin(auth.uid()));
grant select, insert, update on flags to authenticated;

-- =============================================================================
-- mutate_prices: add a 'selection' scope driven by an array of product ids.
-- =============================================================================
drop function if exists mutate_prices(edit_scope, edit_operation, numeric, uuid, uuid, text, boolean, boolean);

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
  v_breaches jsonb := '[]'::jsonb; v_breach_cnt int := 0;
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

  if not v_can_cost then
    v_blocked := v_breach_cnt; delete from _targets where breaches;
  elsif v_breach_cnt > 0 and not p_confirm_below_floor then
    return jsonb_build_object('status','needs_confirm','affected',v_affected,'changed',v_changed,
      'breach_count',v_breach_cnt,'breaches',v_breaches,'can_view_cost',v_can_cost);
  end if;

  if p_dry_run then
    select count(*) into v_applied from _targets;
    return jsonb_build_object('status','preview','affected',v_affected,'changed',v_changed,
      'would_apply',v_applied,'blocked',v_blocked,'breach_count',v_breach_cnt,'breaches',v_breaches,'can_view_cost',v_can_cost);
  end if;

  insert into price_edits (product_id, old_price, new_price, operation, scope, batch_id, actor)
  select id, old_price, new_price, p_operation, p_scope, v_batch, v_uid from _targets;
  update my_products mp set price = t.new_price from _targets t where mp.id = t.id;
  get diagnostics v_applied = row_count;

  return jsonb_build_object('status','applied','affected',v_affected,'applied',v_applied,
    'blocked',v_blocked,'batch_id',v_batch,'can_view_cost',v_can_cost);
end;
$$;
grant execute on function mutate_prices(edit_scope, edit_operation, numeric, uuid, uuid, text, uuid[], boolean, boolean) to authenticated;

-- =============================================================================
-- create_list_version: also carry over UNRESOLVED flags into the copy.
-- =============================================================================
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

  insert into my_products (id, list_id, sku, product_name, category, specs, spec_key, price, currency, config, active)
    select m.new_id, v_new, mp.sku, mp.product_name, mp.category, mp.specs, mp.spec_key,
           mp.price, mp.currency, mp.config, mp.active
    from my_products mp join _map m on m.old_id = mp.id where mp.list_id = p_source;

  insert into product_costs (product_id, cost, currency, margin_type, margin_value, updated_by, updated_at)
    select m.new_id, pc.cost, pc.currency, pc.margin_type, pc.margin_value, v_uid, now()
    from product_costs pc join _map m on m.old_id = pc.product_id;

  insert into product_matches (my_product_id, competitor_item_id, confidence, method, confirmed, confirmed_by, confirmed_at, rejected)
    select m.new_id, pm.competitor_item_id, pm.confidence, pm.method, pm.confirmed, pm.confirmed_by, pm.confirmed_at, pm.rejected
    from product_matches pm join _map m on m.old_id = pm.my_product_id;

  -- Unresolved flags follow their product into the new version.
  insert into flags (product_id, list_id, reason, created_by, created_at)
    select m.new_id, v_new, f.reason, f.created_by, f.created_at
    from flags f join _map m on m.old_id = f.product_id
    where f.resolved = false;

  return v_new;
end;
$$;
grant execute on function create_list_version(uuid, text) to authenticated;
