-- =============================================================================
-- Group A foundations: pricing intelligence (MUSP / MP), admin-editable cost &
-- margin, a general field-level audit log, and employee profile fields
-- (phone + signature) for the PDF footer.
-- =============================================================================

-- ── New capabilities ─────────────────────────────────────────────────────────
insert into capabilities (key, label, description) values
  ('view_margin', 'View MP & MUSP',
   'See the MP (production cost + margin) and MUSP (highest competitor price − ₹1) columns. View-only.'),
  ('edit_specs', 'Edit product details',
   'Edit a product''s name, category, spec attributes, cost floor, and margin from the SKU detail panel.')
on conflict (key) do update set label = excluded.label, description = excluded.description;

-- Admin-only by default (per requirement "only admin can see as well as change").
insert into role_defaults (role, capability_key, granted) values
  ('admin','view_margin',true), ('editor','view_margin',false), ('viewer','view_margin',false),
  ('admin','edit_specs', true), ('editor','edit_specs', false), ('viewer','edit_specs', false)
on conflict (role, capability_key) do update set granted = excluded.granted;

-- ── Global default margin (app_settings) ─────────────────────────────────────
create table if not exists app_settings (
  key        text primary key,
  value      jsonb not null,
  updated_by uuid references profiles (id),
  updated_at timestamptz not null default now()
);
insert into app_settings (key, value) values
  ('default_margin', '{"type":"percent","value":0}'::jsonb)
on conflict (key) do nothing;

alter table app_settings enable row level security;
drop policy if exists app_settings_select on app_settings;
create policy app_settings_select on app_settings for select to authenticated using (true);
drop policy if exists app_settings_write on app_settings;
create policy app_settings_write on app_settings for all to authenticated
  using (has_capability(auth.uid(),'edit_specs')) with check (has_capability(auth.uid(),'edit_specs'));
grant select, insert, update on app_settings to authenticated;

-- ── Per-product margin override (lives with the private cost) ────────────────
alter table product_costs add column if not exists margin_type  text
  check (margin_type in ('percent','flat'));
alter table product_costs add column if not exists margin_value numeric(12,2);

-- ── Profile fields for the PDF footer ────────────────────────────────────────
alter table profiles add column if not exists phone          text;
alter table profiles add column if not exists signature_path text;

-- Private signatures bucket; a user manages only their own file (path = <uid>/...).
insert into storage.buckets (id, name, public) values ('signatures','signatures', false)
  on conflict (id) do nothing;
drop policy if exists "signatures read own" on storage.objects;
create policy "signatures read own" on storage.objects for select to authenticated
  using (bucket_id = 'signatures' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "signatures write own" on storage.objects;
create policy "signatures write own" on storage.objects for all to authenticated
  using (bucket_id = 'signatures' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'signatures' and (storage.foldername(name))[1] = auth.uid()::text);

-- ── General field-level audit log (name/category/specs/cost/margin) ──────────
-- Price changes stay in price_edits (they drive the restore engine); this table
-- captures every OTHER field change with who/when/what.
create table if not exists product_change_log (
  id         uuid primary key default gen_random_uuid(),
  product_id uuid not null references my_products (id) on delete cascade,
  list_id    uuid references price_lists (id) on delete cascade,
  field      text not null,
  old_value  jsonb,
  new_value  jsonb,
  actor      uuid references profiles (id),
  created_at timestamptz not null default now()
);
create index if not exists idx_change_log_product on product_change_log (product_id);
create index if not exists idx_change_log_list on product_change_log (list_id, created_at desc);

alter table product_change_log enable row level security;
drop policy if exists change_log_select on product_change_log;
create policy change_log_select on product_change_log for select to authenticated using (true);
drop policy if exists change_log_insert on product_change_log;
create policy change_log_insert on product_change_log for insert to authenticated
  with check (has_capability(auth.uid(),'edit_specs'));
grant select, insert on product_change_log to authenticated;

-- ── pricing_intel(list): MUSP + MP per product, gated by view_margin ─────────
-- SECURITY DEFINER so it can read the RLS-locked cost to compute MP, but it only
-- ever returns MUSP and MP — never the raw cost or margin numbers.
create or replace function pricing_intel(p_list_id uuid)
returns table(product_id uuid, musp numeric, mp numeric)
language plpgsql stable security definer set search_path = public
as $$
declare
  v_uid    uuid := auth.uid();
  v_dtype  text;
  v_dval   numeric;
begin
  if not has_capability(v_uid, 'view_margin') then
    raise exception 'Missing capability: view_margin';
  end if;

  select value->>'type', (value->>'value')::numeric into v_dtype, v_dval
  from app_settings where key = 'default_margin';

  return query
  select
    mp.id,
    -- MUSP: highest CONFIRMED competitor price minus ₹1; NULL if no competitor.
    (
      select max(ci.price) - 1
      from product_matches m
      join competitor_items ci on ci.id = m.competitor_item_id
      where m.my_product_id = mp.id and m.confirmed = true and m.rejected = false
    ) as musp,
    -- MP: cost + margin (per-product override, else the global default).
    (
      case when pc.cost is null then null
      else pc.cost + case coalesce(pc.margin_type, v_dtype)
        when 'percent' then pc.cost * coalesce(
             case when pc.margin_type is not null then pc.margin_value else v_dval end, 0) / 100.0
        when 'flat'    then coalesce(
             case when pc.margin_type is not null then pc.margin_value else v_dval end, 0)
        else 0 end
      end
    )::numeric(12,2) as mp
  from my_products mp
  left join product_costs pc on pc.product_id = mp.id
  where mp.list_id = p_list_id and mp.active;
end;
$$;
grant execute on function pricing_intel(uuid) to authenticated;

-- ── set_cost_margin: admin edits a product's cost floor + margin (audited) ───
create or replace function set_cost_margin(
  p_product_id  uuid,
  p_cost        numeric,
  p_margin_type text,
  p_margin_value numeric
)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_list uuid; v_locked boolean;
  v_old_cost numeric; v_old_mt text; v_old_mv numeric;
begin
  if not has_capability(v_uid,'edit_specs') then raise exception 'Missing capability: edit_specs'; end if;
  if p_margin_type is not null and p_margin_type not in ('percent','flat') then
    raise exception 'Invalid margin type';
  end if;

  select mp.list_id into v_list from my_products mp where mp.id = p_product_id;
  if v_list is null then raise exception 'Product not found'; end if;
  select (locked or is_original) into v_locked from price_lists where id = v_list;
  if v_locked then raise exception 'LIST_LOCKED'; end if;

  select cost, margin_type, margin_value into v_old_cost, v_old_mt, v_old_mv
  from product_costs where product_id = p_product_id;

  insert into product_costs (product_id, cost, currency, margin_type, margin_value, updated_by, updated_at)
  values (p_product_id, coalesce(p_cost, v_old_cost, 0), 'INR', p_margin_type, p_margin_value, v_uid, now())
  on conflict (product_id) do update
    set cost = coalesce(p_cost, product_costs.cost),
        margin_type = p_margin_type,
        margin_value = p_margin_value,
        updated_by = v_uid, updated_at = now();

  if p_cost is not null and p_cost is distinct from v_old_cost then
    insert into product_change_log (product_id, list_id, field, old_value, new_value, actor)
    values (p_product_id, v_list, 'cost', to_jsonb(v_old_cost), to_jsonb(p_cost), v_uid);
  end if;
  if p_margin_type is distinct from v_old_mt or p_margin_value is distinct from v_old_mv then
    insert into product_change_log (product_id, list_id, field, old_value, new_value, actor)
    values (p_product_id, v_list, 'margin',
            jsonb_build_object('type',v_old_mt,'value',v_old_mv),
            jsonb_build_object('type',p_margin_type,'value',p_margin_value), v_uid);
  end if;

  return jsonb_build_object('status','ok');
end;
$$;
grant execute on function set_cost_margin(uuid, numeric, text, numeric) to authenticated;

-- ── update_product_fields: admin edits name/category/specs (audited) ─────────
create or replace function update_product_fields(p_product_id uuid, p_patch jsonb)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_list uuid; v_locked boolean;
  v_old my_products%rowtype;
begin
  if not has_capability(v_uid,'edit_specs') then raise exception 'Missing capability: edit_specs'; end if;

  select * into v_old from my_products where id = p_product_id;
  if v_old.id is null then raise exception 'Product not found'; end if;
  v_list := v_old.list_id;
  select (locked or is_original) into v_locked from price_lists where id = v_list;
  if v_locked then raise exception 'LIST_LOCKED'; end if;

  if p_patch ? 'product_name' and (p_patch->>'product_name') is distinct from v_old.product_name then
    update my_products set product_name = p_patch->>'product_name' where id = p_product_id;
    insert into product_change_log (product_id, list_id, field, old_value, new_value, actor)
    values (p_product_id, v_list, 'product_name', to_jsonb(v_old.product_name), to_jsonb(p_patch->>'product_name'), v_uid);
  end if;

  if p_patch ? 'category' and (p_patch->>'category') is distinct from v_old.category then
    update my_products set category = p_patch->>'category' where id = p_product_id;
    insert into product_change_log (product_id, list_id, field, old_value, new_value, actor)
    values (p_product_id, v_list, 'category', to_jsonb(v_old.category), to_jsonb(p_patch->>'category'), v_uid);
  end if;

  if p_patch ? 'specs' and (p_patch->'specs') is distinct from v_old.specs then
    update my_products set specs = coalesce(p_patch->'specs','{}'::jsonb) where id = p_product_id;
    insert into product_change_log (product_id, list_id, field, old_value, new_value, actor)
    values (p_product_id, v_list, 'specs', v_old.specs, coalesce(p_patch->'specs','{}'::jsonb), v_uid);
  end if;

  return jsonb_build_object('status','ok');
end;
$$;
grant execute on function update_product_fields(uuid, jsonb) to authenticated;

-- ── create_list_version now also copies the margin override columns ──────────
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

  return v_new;
end;
$$;
grant execute on function create_list_version(uuid, text) to authenticated;
