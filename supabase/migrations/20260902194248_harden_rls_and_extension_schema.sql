-- Corrections found by the post-apply security/performance advisor run:
--
-- 1. moddatetime was installed into `public` (Supabase default when no
--    schema is specified) — extensions belong out of the API-exposed schema.
-- 2. handle_new_user() is SECURITY DEFINER and, being in `public`, was
--    reachable by anon/authenticated via PostgREST's /rpc endpoint. It must
--    only ever run as the auth.users insert trigger, never as a client call.
-- 3. Every "select own row" policy called auth.uid() directly, which Postgres
--    re-evaluates per row instead of once per query (auth_rls_initplan).
--    Wrapping it in a scalar subquery lets the planner treat it as a stable
--    initplan value.

alter extension moddatetime set schema extensions;

revoke execute on function public.handle_new_user() from public, anon, authenticated;

drop policy "profiles_select_own" on profiles;
create policy "profiles_select_own" on profiles
  for select to authenticated
  using (id = (select auth.uid()));

drop policy "profiles_update_own" on profiles;
create policy "profiles_update_own" on profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

drop policy "scans_select_own" on scans;
create policy "scans_select_own" on scans
  for select to authenticated
  using (user_id = (select auth.uid()));

drop policy "scan_images_select_own" on scan_images;
create policy "scan_images_select_own" on scan_images
  for select to authenticated
  using (exists (
    select 1 from scans s where s.id = scan_images.scan_id and s.user_id = (select auth.uid())
  ));

drop policy "scan_scores_select_own" on scan_scores;
create policy "scan_scores_select_own" on scan_scores
  for select to authenticated
  using (exists (
    select 1 from scans s where s.id = scan_scores.scan_id and s.user_id = (select auth.uid())
  ));

drop policy "scan_regions_select_own" on scan_regions;
create policy "scan_regions_select_own" on scan_regions
  for select to authenticated
  using (exists (
    select 1 from scans s where s.id = scan_regions.scan_id and s.user_id = (select auth.uid())
  ));

drop policy "scan_model_runs_select_own" on scan_model_runs;
create policy "scan_model_runs_select_own" on scan_model_runs
  for select to authenticated
  using (exists (
    select 1 from scans s where s.id = scan_model_runs.scan_id and s.user_id = (select auth.uid())
  ));

drop policy "consent_events_select_own" on consent_events;
create policy "consent_events_select_own" on consent_events
  for select to authenticated
  using (profile_id = (select auth.uid()));

drop policy "consent_events_insert_own" on consent_events;
create policy "consent_events_insert_own" on consent_events
  for insert to authenticated
  with check (profile_id = (select auth.uid()));

drop policy "skin_scans_read_own_prefix" on storage.objects;
create policy "skin_scans_read_own_prefix" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'skin-scans'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
