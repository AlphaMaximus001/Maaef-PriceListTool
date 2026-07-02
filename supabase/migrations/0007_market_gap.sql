-- =============================================================================
-- Market-gap view — "they sell, you don't". Competitor items with no confirmed
-- match to any Maaef product (e.g. the 1,300+ competitor-only rows in the
-- unified inventory). Whitespace / expansion signal. No cost anywhere.
-- =============================================================================

create or replace view v_market_gap as
select
  ci.id            as competitor_item_id,
  ci.product_name  as product_name,
  ci.category      as category,
  ci.price         as competitor_price,
  ci.currency      as currency,
  c.name           as competitor_name,
  cl.name          as competitor_list_name
from competitor_items ci
join competitor_lists cl on cl.id = ci.list_id
join competitors c       on c.id = cl.competitor_id
where not exists (
  select 1 from product_matches m
  where m.competitor_item_id = ci.id
    and m.confirmed = true
    and m.rejected = false
);

grant select on v_market_gap to authenticated;
