-- =============================================================================
-- Flag resolution note. When someone resolves a flag they can record the answer
-- (what was done / the decision), which is kept permanently in the flag history.
-- =============================================================================

alter table flags add column if not exists resolution text;
