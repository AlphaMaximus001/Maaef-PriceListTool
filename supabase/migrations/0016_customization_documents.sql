-- =============================================================================
-- 7-section frontend foundations:
--   §5 SKU Customization — a custom DISPLAY NAME/alias per product (the SKU code
--       stays the stable identifier), plus creating brand-new items on the
--       current WORKING version (never the locked original).
--   §7 Document Management — an operational-docs table + private storage bucket
--       (GST certificates, licenses, etc.) with upload/download.
-- =============================================================================

-- ── §5a  Custom display alias ────────────────────────────────────────────────
-- display_name is a human-facing label shown IN PLACE OF the raw SKU code where
-- helpful. The sku column remains the immutable identifier (unique per list).
alter table my_products add column if not exists display_name text;

-- update_product_fields learns display_name (audited like every other field).
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

  if p_patch ? 'display_name' and (p_patch->>'display_name') is distinct from v_old.display_name then
    update my_products set display_name = nullif(p_patch->>'display_name','') where id = p_product_id;
    insert into product_change_log (product_id, list_id, field, old_value, new_value, actor)
    values (p_product_id, v_list, 'display_name', to_jsonb(v_old.display_name), to_jsonb(nullif(p_patch->>'display_name','')), v_uid);
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

-- ── §5b  Create a brand-new item on a WORKING version ────────────────────────
-- Refuses locked/original lists (the caller forks first, exactly like every
-- other edit). Logs the creation so it shows in the audit trail / action logs.
create or replace function create_product(
  p_list_id      uuid,
  p_sku          text,
  p_name         text,
  p_category     text,
  p_price        numeric,
  p_display_name text default null,
  p_cost         numeric default null
)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_locked boolean;
  v_new uuid;
begin
  if not has_capability(v_uid,'edit_specs') then raise exception 'Missing capability: edit_specs'; end if;
  if coalesce(trim(p_sku),'')  = '' then raise exception 'A SKU code is required'; end if;
  if coalesce(trim(p_name),'') = '' then raise exception 'A product name is required'; end if;

  select (locked or is_original) into v_locked from price_lists where id = p_list_id;
  if v_locked is null then raise exception 'List not found'; end if;
  if v_locked then raise exception 'LIST_LOCKED'; end if;

  if exists (select 1 from my_products where list_id = p_list_id and sku = trim(p_sku)) then
    raise exception 'SKU % already exists in this list', trim(p_sku);
  end if;

  insert into my_products (list_id, sku, product_name, display_name, category, price, currency, active)
    values (p_list_id, trim(p_sku), trim(p_name), nullif(trim(coalesce(p_display_name,'')),''),
            nullif(trim(coalesce(p_category,'')),''), coalesce(p_price,0), 'INR', true)
    returning id into v_new;

  -- Optional private cost floor (RLS-locked table; only view_cost users read it).
  if p_cost is not null then
    insert into product_costs (product_id, cost, currency, updated_by, updated_at)
      values (v_new, p_cost, 'INR', v_uid, now());
  end if;

  insert into product_change_log (product_id, list_id, field, old_value, new_value, actor)
    values (v_new, p_list_id, 'created', null,
            jsonb_build_object('sku', trim(p_sku), 'name', trim(p_name), 'price', coalesce(p_price,0)), v_uid);

  return v_new;
end;
$$;
grant execute on function create_product(uuid, text, text, text, numeric, text, numeric) to authenticated;

-- ── §5c  Version copies carry the display alias forward ──────────────────────
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

  return v_new;
end;
$$;
grant execute on function create_list_version(uuid, text) to authenticated;

-- =============================================================================
-- §7  Document Management
-- =============================================================================

-- New capability: who may upload/replace/delete operational documents.
insert into capabilities (key, label, description) values
  ('manage_documents', 'Manage documents',
   'Upload, replace, and delete operational documents (GST certificates, licenses, etc.). Everyone signed in can view and download them.')
on conflict (key) do update set label = excluded.label, description = excluded.description;

insert into role_defaults (role, capability_key, granted) values
  ('admin','manage_documents',true), ('editor','manage_documents',true), ('viewer','manage_documents',false)
on conflict (role, capability_key) do update set granted = excluded.granted;

create table if not exists documents (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  category    text,                       -- e.g. 'GST', 'License', 'Certificate'
  file_path   text not null,              -- path inside the 'documents' storage bucket
  mime_type   text,
  size_bytes  bigint,
  uploaded_by uuid references profiles (id),
  uploaded_at timestamptz not null default now()
);
create index if not exists idx_documents_category on documents (category, uploaded_at desc);

alter table documents enable row level security;
-- Any signed-in teammate can see the catalogue and download.
drop policy if exists documents_select on documents;
create policy documents_select on documents for select to authenticated using (true);
-- Only holders of manage_documents can add/replace/remove entries.
drop policy if exists documents_write on documents;
create policy documents_write on documents for all to authenticated
  using (has_capability(auth.uid(),'manage_documents'))
  with check (has_capability(auth.uid(),'manage_documents'));
grant select, insert, update, delete on documents to authenticated;

-- Private bucket; the catalogue table is the index into it.
insert into storage.buckets (id, name, public) values ('documents','documents', false)
  on conflict (id) do nothing;

drop policy if exists "documents read" on storage.objects;
create policy "documents read" on storage.objects for select to authenticated
  using (bucket_id = 'documents');
drop policy if exists "documents write" on storage.objects;
create policy "documents write" on storage.objects for all to authenticated
  using (bucket_id = 'documents' and has_capability(auth.uid(),'manage_documents'))
  with check (bucket_id = 'documents' and has_capability(auth.uid(),'manage_documents'));
