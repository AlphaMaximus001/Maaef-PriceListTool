-- =============================================================================
-- Restore safety net. The audit trail (price_edits) already records every
-- change; these functions make it actionable:
--   * restore_list(list, before): roll every product in the list back to its
--     price as of just before `before` — i.e. "restore to before this change".
--   * reset via restore_list(list, '-infinity') = back to creation state
--     (for a version, that's the original's prices).
--   * archive: soft-delete a bad version. Originals can never be archived.
-- The original is untouched by all of this — it's locked and never edited.
-- =============================================================================

alter table price_lists add column if not exists archived boolean not null default false;

-- Restores are edits too: extend the audit scope enum.
alter type edit_scope add value if not exists 'restore';

create or replace function restore_list(p_list_id uuid, p_before timestamptz)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_uid   uuid := auth.uid();
  v_batch uuid := gen_random_uuid();
  v_count int := 0;
begin
  if not has_capability(v_uid, 'bulk_edit') then
    raise exception 'Missing capability: bulk_edit';
  end if;
  if exists (select 1 from price_lists where id = p_list_id and (locked or is_original)) then
    raise exception 'LIST_LOCKED';
  end if;

  -- For each product in the list, the earliest LIVE (non-reverted) edit at or
  -- after the restore point holds the price the product had back then.
  create temp table _rollback on commit drop as
  select distinct on (pe.product_id)
         pe.product_id, pe.old_price as restore_price, mp.price as current_price
  from price_edits pe
  join my_products mp on mp.id = pe.product_id
  where mp.list_id = p_list_id
    and pe.created_at >= p_before
    and not pe.reverted
  order by pe.product_id, pe.created_at asc;

  delete from _rollback where restore_price = current_price;

  -- Log the restore itself (invariant 4: every change is logged & reversible —
  -- so a restore can also be undone from history).
  insert into price_edits (product_id, old_price, new_price, operation, scope, batch_id, actor, note)
  select product_id, current_price, restore_price, 'set', 'restore', v_batch, v_uid,
         'Restored to state before ' || to_char(p_before at time zone 'utc', 'YYYY-MM-DD HH24:MI')
  from _rollback;

  update my_products mp
     set price = r.restore_price
    from _rollback r
   where mp.id = r.product_id;
  get diagnostics v_count = row_count;

  -- The rolled-back edits are now superseded; mark them reverted so per-edit
  -- undo doesn't double-apply on top of the restore.
  update price_edits pe
     set reverted = true
    from my_products mp
   where mp.id = pe.product_id
     and mp.list_id = p_list_id
     and pe.created_at >= p_before
     and pe.batch_id is distinct from v_batch
     and not pe.reverted;

  return jsonb_build_object('status','restored','count',v_count,'batch_id',v_batch);
end;
$$;

grant execute on function restore_list(uuid, timestamptz) to authenticated;

-- -----------------------------------------------------------------------------
-- Archive (soft-delete) a version. Never an original; never destructive —
-- the rows stay, the list just disappears from pickers and pages.
-- -----------------------------------------------------------------------------
create or replace function archive_list(p_list_id uuid)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare v_uid uuid := auth.uid();
begin
  if not has_capability(v_uid, 'edit_price') then
    raise exception 'Missing capability: edit_price';
  end if;
  if exists (select 1 from price_lists where id = p_list_id and is_original) then
    raise exception 'Cannot archive an original list';
  end if;
  update price_lists set archived = true where id = p_list_id and not is_original;
  if not found then raise exception 'List not found'; end if;
  return jsonb_build_object('status','archived');
end;
$$;

grant execute on function archive_list(uuid) to authenticated;
