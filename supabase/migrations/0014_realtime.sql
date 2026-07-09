-- =============================================================================
-- Group D: enable Supabase Realtime on the tables whose changes should nudge
-- other open tabs/users to refresh. RLS still governs what each subscriber can
-- actually see. Idempotent — safe to re-run.
-- =============================================================================

do $$
declare
  t text;
  tables text[] := array[
    'my_products', 'price_lists', 'price_edits', 'flags',
    'product_change_log', 'product_matches', 'product_costs',
    'competitor_items', 'competitor_lists', 'app_settings'
  ];
begin
  -- Ensure the publication Supabase Realtime listens on exists.
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;

  foreach t in array tables loop
    if to_regclass('public.' || t) is not null
       and not exists (
         select 1 from pg_publication_tables
         where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
       )
    then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
