-- =============================================================================
-- Superadmin role — part 1 of 2: introduce the enum value.
--
-- Postgres will not let a new enum value be USED in the same transaction that
-- adds it, and each migration file runs in its own transaction. So this file
-- does nothing but widen the type; 0027 grants the permissions and installs
-- the protection rules.
-- =============================================================================

alter type app_role add value if not exists 'superadmin';
