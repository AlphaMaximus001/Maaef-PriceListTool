-- =============================================================================
-- Seed: capability catalogue + role baselines (brief §6 / §3 glossary).
-- These are reference rows, not user data — safe to ship in a migration.
-- The Admin page (capability_grants) overrides these per-person at runtime.
-- =============================================================================

insert into capabilities (key, label, description) values
  ('view_cost',         'View cost floor',      'See the private cost floor and cost column. Gates the undercut guard reveal.'),
  ('edit_price',        'Edit prices',          'Edit a single SKU price and save configurator changes.'),
  ('bulk_edit',         'Bulk / category edit', 'Apply percentage / flat / set-to-value across a category or the whole list.'),
  ('upload_competitor', 'Upload competitor list','Upload and parse competitor .xlsx intake files.'),
  ('confirm_match',     'Confirm matches',      'Confirm or reject proposed product matches. The only way a match goes live.'),
  ('export_pdf',        'Export branded PDF',   'Download any list as the branded A5 Maaef PDF.'),
  ('manage_users',      'Manage users',         'Create/deactivate users, set roles, grant/retract capabilities.')
on conflict (key) do update
  set label = excluded.label, description = excluded.description;

-- Role baselines.
--   Admin  : everything.
--   Editor : edit + bulk + upload + confirm + export. NOT view_cost, NOT manage_users.
--   Viewer : read-only. No capabilities by default (grant export_pdf/view_cost per-person).
insert into role_defaults (role, capability_key, granted) values
  -- admin
  ('admin', 'view_cost',         true),
  ('admin', 'edit_price',        true),
  ('admin', 'bulk_edit',         true),
  ('admin', 'upload_competitor', true),
  ('admin', 'confirm_match',     true),
  ('admin', 'export_pdf',        true),
  ('admin', 'manage_users',      true),
  -- editor
  ('editor', 'view_cost',         false),
  ('editor', 'edit_price',        true),
  ('editor', 'bulk_edit',         true),
  ('editor', 'upload_competitor', true),
  ('editor', 'confirm_match',     true),
  ('editor', 'export_pdf',        true),
  ('editor', 'manage_users',      false),
  -- viewer
  ('viewer', 'view_cost',         false),
  ('viewer', 'edit_price',        false),
  ('viewer', 'bulk_edit',         false),
  ('viewer', 'upload_competitor', false),
  ('viewer', 'confirm_match',     false),
  ('viewer', 'export_pdf',        false),
  ('viewer', 'manage_users',      false)
on conflict (role, capability_key) do update set granted = excluded.granted;
