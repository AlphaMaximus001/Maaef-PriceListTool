-- =============================================================================
-- Maaef Competitive Pricing Dashboard — database schema
-- Authored from the Build Brief v1.0 (§5 data model, §4 invariants).
--
-- This file IS the source of truth referenced in the brief as
-- `maaef_pricing_schema.sql`. Extend it only when a feature requires it.
--
-- Invariants enforced here:
--   (1) Cost is private & isolated  -> product_costs + RLS gated on view_cost
--   (2) Matching is never silent     -> product_matches.confirmed defaults false
--   (3) Competitor data is read-only -> no UPDATE/DELETE policies on competitor_*
--   (4) Every price change is logged -> price_edits audit table
--   (5) Capabilities via resolver    -> has_capability(uid, cap)
--   (6) Undercut guard (enforced app-side; cost stays RLS-locked here)
--   (7) Standardized templates only  -> enforced at intake (app), not schema
-- =============================================================================

create extension if not exists "pgcrypto";

-- -----------------------------------------------------------------------------
-- ENUMS
-- -----------------------------------------------------------------------------
do $$ begin
  create type app_role as enum ('admin', 'editor', 'viewer');
exception when duplicate_object then null; end $$;

do $$ begin
  create type edit_operation as enum ('percentage', 'flat', 'set');
exception when duplicate_object then null; end $$;

do $$ begin
  create type edit_scope as enum ('single', 'category', 'list', 'configurator');
exception when duplicate_object then null; end $$;

do $$ begin
  create type match_method as enum ('spec_key', 'fuzzy', 'manual');
exception when duplicate_object then null; end $$;

-- =============================================================================
-- IDENTITY + PERMISSIONS
-- =============================================================================

-- profiles: one row per auth user. Mirrors auth.users with app-level fields.
create table if not exists profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       text not null,
  full_name   text,
  role        app_role not null default 'viewer',
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- capabilities: the catalogue of gated actions. key is referenced everywhere.
create table if not exists capabilities (
  key         text primary key,
  label       text not null,
  description text not null
);

-- role_defaults: baseline grant per (role, capability).
create table if not exists role_defaults (
  role            app_role not null,
  capability_key  text not null references capabilities (key) on delete cascade,
  granted         boolean not null default false,
  primary key (role, capability_key)
);

-- capability_grants: per-person override. granted=true|false BEATS role default.
create table if not exists capability_grants (
  user_id         uuid not null references profiles (id) on delete cascade,
  capability_key  text not null references capabilities (key) on delete cascade,
  granted         boolean not null,
  granted_by      uuid references profiles (id),
  created_at      timestamptz not null default now(),
  primary key (user_id, capability_key)
);

-- -----------------------------------------------------------------------------
-- has_capability(uid, cap): THE single source of truth for access (invariant 5).
-- Resolution order: per-person override -> role default -> deny.
-- SECURITY DEFINER so RLS policies can call it without recursive policy checks.
-- -----------------------------------------------------------------------------
create or replace function has_capability(uid uuid, cap text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_override boolean;
  v_default  boolean;
  v_role     app_role;
  v_active   boolean;
begin
  if uid is null then
    return false;
  end if;

  select role, active into v_role, v_active from profiles where id = uid;

  -- Deactivated or unknown users hold no capabilities.
  if v_role is null or v_active is false then
    return false;
  end if;

  -- 1) per-person override wins outright (can grant OR revoke).
  select granted into v_override
  from capability_grants
  where user_id = uid and capability_key = cap;

  if found then
    return v_override;
  end if;

  -- 2) fall back to role default.
  select granted into v_default
  from role_defaults
  where role = v_role and capability_key = cap;

  return coalesce(v_default, false);
end;
$$;

-- Convenience wrapper bound to the current request's user.
create or replace function has_capability(cap text)
returns boolean
language sql
stable
as $$
  select has_capability(auth.uid(), cap);
$$;

-- is_admin(): used only to gate the admin/permission surface itself.
create or replace function is_admin(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from profiles
    where id = uid and role = 'admin' and active = true
  );
$$;

-- =============================================================================
-- MY LIST (editable) + PRIVATE COST FLOOR
-- =============================================================================

-- my_products: Maaef's own client-facing list. The ONLY editable list.
-- NOTE: cost never lives here (invariant 1).
create table if not exists my_products (
  id           uuid primary key default gen_random_uuid(),
  sku          text not null unique,
  product_name text not null,
  category     text,
  specs        jsonb not null default '{}'::jsonb,
  spec_key     text,                          -- normalized key for matching
  price        numeric(12,2) not null default 0,
  currency     text not null default 'INR',
  config       jsonb not null default '{}'::jsonb,  -- selected add-ons (F5)
  active       boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists idx_my_products_category on my_products (category);
create index if not exists idx_my_products_spec_key on my_products (spec_key);

-- product_costs: PRIVATE floor. Separate table, RLS-locked to view_cost.
-- One-to-one with my_products. A non-view_cost user can never read this.
create table if not exists product_costs (
  product_id  uuid primary key references my_products (id) on delete cascade,
  cost        numeric(12,2) not null,
  currency    text not null default 'INR',
  updated_by  uuid references profiles (id),
  updated_at  timestamptz not null default now()
);

-- spec_addons: fixed customization deltas for the configurator (F5).
-- Flat deltas only — NOT derived from cost (do-not-build §10).
create table if not exists spec_addons (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  applies_to  text,                           -- category this add-on applies to (null = all)
  price_delta numeric(12,2) not null,
  currency    text not null default 'INR',
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);
create index if not exists idx_spec_addons_applies_to on spec_addons (applies_to);

-- =============================================================================
-- COMPETITOR REFERENCE DATA (read-only after upload — invariant 3)
-- =============================================================================

create table if not exists competitors (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  created_at  timestamptz not null default now()
);

create table if not exists competitor_lists (
  id            uuid primary key default gen_random_uuid(),
  competitor_id uuid not null references competitors (id) on delete cascade,
  name          text not null,
  source_file   text,                         -- storage path to archived original
  uploaded_by   uuid references profiles (id),
  uploaded_at   timestamptz not null default now(),
  row_count     integer not null default 0
);
create index if not exists idx_competitor_lists_competitor on competitor_lists (competitor_id);

create table if not exists competitor_items (
  id           uuid primary key default gen_random_uuid(),
  list_id      uuid not null references competitor_lists (id) on delete cascade,
  sku          text,
  product_name text not null,
  category     text,
  specs        jsonb not null default '{}'::jsonb,
  spec_key     text,
  price        numeric(12,2) not null default 0,
  currency     text not null default 'INR',
  created_at   timestamptz not null default now()
);
create index if not exists idx_competitor_items_list on competitor_items (list_id);
create index if not exists idx_competitor_items_spec_key on competitor_items (spec_key);
create index if not exists idx_competitor_items_category on competitor_items (category);

-- =============================================================================
-- MATCHES (mine <-> theirs) — never silent (invariant 2)
-- =============================================================================

create table if not exists product_matches (
  id                 uuid primary key default gen_random_uuid(),
  my_product_id      uuid not null references my_products (id) on delete cascade,
  competitor_item_id uuid not null references competitor_items (id) on delete cascade,
  confidence         numeric(5,4) not null default 0,   -- 0..1
  method             match_method not null default 'fuzzy',
  confirmed          boolean not null default false,     -- human gate
  confirmed_by       uuid references profiles (id),
  confirmed_at       timestamptz,
  rejected           boolean not null default false,
  created_at         timestamptz not null default now(),
  unique (my_product_id, competitor_item_id)
);
create index if not exists idx_matches_my_product on product_matches (my_product_id);
create index if not exists idx_matches_confirmed on product_matches (confirmed) where confirmed = true;

-- =============================================================================
-- AUDIT TRAIL (invariant 4) — every price change is logged & reversible
-- =============================================================================

create table if not exists price_edits (
  id          uuid primary key default gen_random_uuid(),
  product_id  uuid not null references my_products (id) on delete cascade,
  old_price   numeric(12,2) not null,
  new_price   numeric(12,2) not null,
  operation   edit_operation not null,
  scope       edit_scope not null,
  batch_id    uuid,                            -- groups a single bulk/category apply
  actor       uuid references profiles (id),
  note        text,
  reverted    boolean not null default false,
  created_at  timestamptz not null default now()
);
create index if not exists idx_price_edits_product on price_edits (product_id);
create index if not exists idx_price_edits_batch on price_edits (batch_id);
create index if not exists idx_price_edits_created on price_edits (created_at desc);

-- =============================================================================
-- VIEWS that power the two core screens (F3)
-- Only CONFIRMED matches feed v_overlap (invariant 2).
-- Neither view exposes cost (invariant 1).
-- =============================================================================

-- v_overlap: one row per (my product, confirmed competitor item).
create or replace view v_overlap as
select
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
  (mp.price - ci.price)                         as gap,
  (mp.price <= ci.price)                         as i_am_cheaper
from product_matches m
join my_products mp        on mp.id = m.my_product_id
join competitor_items ci   on ci.id = m.competitor_item_id
join competitor_lists cl   on cl.id = ci.list_id
join competitors c         on c.id = cl.competitor_id
where m.confirmed = true and m.rejected = false;

-- v_unique: Maaef products with NO confirmed competitor match (pricing power).
create or replace view v_unique as
select
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
    where m.my_product_id = mp.id
      and m.confirmed = true
      and m.rejected = false
  );

-- =============================================================================
-- updated_at triggers
-- =============================================================================
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end; $$;

drop trigger if exists trg_profiles_updated on profiles;
create trigger trg_profiles_updated before update on profiles
  for each row execute function set_updated_at();

drop trigger if exists trg_my_products_updated on my_products;
create trigger trg_my_products_updated before update on my_products
  for each row execute function set_updated_at();

-- =============================================================================
-- New-user hook: create a profile row whenever an auth user is created.
-- =============================================================================
create or replace function handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.email),
    'viewer'
  )
  on conflict (id) do nothing;
  return new;
end; $$;

drop trigger if exists trg_on_auth_user_created on auth.users;
create trigger trg_on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();
