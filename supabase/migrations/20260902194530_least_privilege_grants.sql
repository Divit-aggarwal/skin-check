-- information_schema.role_table_grants revealed anon/authenticated hold full
-- ALL-privilege grants (INSERT/SELECT/UPDATE/DELETE/TRUNCATE/REFERENCES/
-- TRIGGER) on every public table, via this project's default privileges for
-- the migration-applying role. RLS (deny-by-default once enabled with no
-- matching policy) already prevents anon/authenticated from doing anything
-- on the server-only tables today, so nothing here was actually exploitable —
-- but a stray future permissive policy would immediately be live on an
-- over-broad grant. Revoke everything and re-grant only the narrow surface
-- the policies in the prior two migrations actually rely on.

revoke all on all tables in schema public from anon;
revoke all on all tables in schema public from authenticated;

grant select on profiles to authenticated;
grant update (display_name) on profiles to authenticated;

grant select on scans to authenticated;
grant select on scan_images to authenticated;
grant select on scan_scores to authenticated;
grant select on scan_regions to authenticated;
grant select on scan_model_runs to authenticated;

grant select, insert on consent_events to authenticated;

-- sessions, recommendations, shopify_orders, return_reminders, annotations,
-- chat_messages, training_eligible: intentionally left with zero grants to
-- anon/authenticated — server-only, service_role access exclusively.

-- Keep this the default for any table created later by this same role,
-- rather than relying on every future migration to remember to revoke.
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on tables from authenticated;
