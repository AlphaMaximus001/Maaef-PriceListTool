-- =============================================================================
-- Versioned price lists. The imported list is a LOCKED baseline ("Original");
-- edits never touch it. To edit, you create a named working copy (a version)
-- and edits flow there. Competitor data + the physical product matches are
-- copied per version so each version has its own overlap picture.
-- =============================================================================

create table if not exists price_lists (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  is_original  boolean not null default false, -- imported baseline
  locked       boolean not null default false, -- immutable (originals are locked)
  created_from uuid references price_lists (id) on delete set null,
  created_by   uuid references profiles (id),
  created_at   timestamptz not null default now()
);

-- Every product row now belongs to exactly one list (version).
alter table my_products add column if not exists list_id uuid references price_lists (id) on delete cascade;

-- Backfill any pre-existing rows into a migrated "Original" list.
do $$
declare v_orig uuid;
begin
  if exists (select 1 from my_products where list_id is null) then
    insert into price_lists (name, is_original, locked)
      values ('Original (migrated)', true, true)
      returning id into v_orig;
    update my_products set list_id = v_orig where list_id is null;
  end if;
end $$;

alter table my_products alter column list_id set not null;
create index if not exists idx_my_products_list on my_products (list_id);

-- SKU is unique WITHIN a list now (the same SKU exists in every version).
alter table my_products drop constraint if exists my_products_sku_key;
create unique index if not exists my_products_list_sku_key on my_products (list_id, sku);

-- -----------------------------------------------------------------------------
-- Views expose the owning list so the pages can filter to the selected version.
-- -----------------------------------------------------------------------------
drop view if exists v_overlap;
create view v_overlap as
select
  mp.list_id         as list_id,
  mp.id              as my_product_id,
  mp.sku             as my_sku,
  mp.product_name    as my_product_name,
  mp.category        as category,
  mp.price           as my_price,
  mp.currency        as currency,
  c.name             as competitor_name,
  cl.name            as competitor_list_name,
  ci.id              as competitor_item_id,
  ci.product_name    as competitor_product_name,
  ci.price           as competitor_price,
  (mp.price - ci.price)  as gap,
  (mp.price <= ci.price)  as i_am_cheaper
from product_matches m
join my_products mp        on mp.id = m.my_product_id
join competitor_items ci   on ci.id = m.competitor_item_id
join competitor_lists cl   on cl.id = ci.list_id
join competitors c         on c.id = cl.competitor_id
where m.confirmed = true and m.rejected = false;

drop view if exists v_unique;
create view v_unique as
select
  mp.list_id      as list_id,
  mp.id           as my_product_id,
  mp.sku          as my_sku,
  mp.product_name as my_product_name,
  mp.category     as category,
  mp.price        as my_price,
  mp.currency     as currency
from my_products mp
where mp.active = true
  and not exists (
    select 1 from product_matches m
    where m.my_product_id = mp.id and m.confirmed = true and m.rejected = false
  );

grant select on v_overlap, v_unique to authenticated;

-- -----------------------------------------------------------------------------
-- RLS for price_lists: read by all authenticated; create/rename by edit holders;
-- locked/original lists can never be flipped editable via the app.
-- -----------------------------------------------------------------------------
alter table price_lists enable row level security;

drop policy if exists price_lists_select on price_lists;
create policy price_lists_select on price_lists for select to authenticated using (true);

drop policy if exists price_lists_insert on price_lists;
create policy price_lists_insert on price_lists
  for insert to authenticated
  with check (has_capability(auth.uid(), 'edit_price') or has_capability(auth.uid(), 'bulk_edit'));

drop policy if exists price_lists_update on price_lists;
create policy price_lists_update on price_lists
  for update to authenticated
  using ((has_capability(auth.uid(), 'edit_price') or has_capability(auth.uid(), 'bulk_edit')) and not is_original)
  with check (not is_original and not locked);

grant select, insert, update on price_lists to authenticated;

-- -----------------------------------------------------------------------------
-- create_list_version(source, name): full copy of a list into a new editable
-- version — products, costs, and matches — so the copy stands alone.
-- -----------------------------------------------------------------------------
create or replace function create_list_version(p_source uuid, p_name text)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_new uuid;
begin
  if not (has_capability(v_uid, 'edit_price') or has_capability(v_uid, 'bulk_edit')) then
    raise exception 'Missing capability to create a list version';
  end if;
  if coalesce(trim(p_name), '') = '' then
    raise exception 'A list name is required';
  end if;
  if not exists (select 1 from price_lists where id = p_source) then
    raise exception 'Source list not found';
  end if;

  insert into price_lists (name, is_original, locked, created_from, created_by)
    values (trim(p_name), false, false, p_source, v_uid)
    returning id into v_new;

  -- Map old product ids -> new ids so costs/matches can be re-pointed.
  create temp table _map on commit drop as
    select mp.id as old_id, gen_random_uuid() as new_id
    from my_products mp where mp.list_id = p_source;

  insert into my_products (id, list_id, sku, product_name, category, specs, spec_key, price, currency, config, active)
    select m.new_id, v_new, mp.sku, mp.product_name, mp.category, mp.specs, mp.spec_key,
           mp.price, mp.currency, mp.config, mp.active
    from my_products mp join _map m on m.old_id = mp.id
    where mp.list_id = p_source;

  insert into product_costs (product_id, cost, currency, updated_by, updated_at)
    select m.new_id, pc.cost, pc.currency, v_uid, now()
    from product_costs pc join _map m on m.old_id = pc.product_id;

  insert into product_matches (my_product_id, competitor_item_id, confidence, method, confirmed, confirmed_by, confirmed_at, rejected)
    select m.new_id, pm.competitor_item_id, pm.confidence, pm.method, pm.confirmed, pm.confirmed_by, pm.confirmed_at, pm.rejected
    from product_matches pm join _map m on m.old_id = pm.my_product_id;

  return v_new;
end;
$$;

grant execute on function create_list_version(uuid, text) to authenticated;
