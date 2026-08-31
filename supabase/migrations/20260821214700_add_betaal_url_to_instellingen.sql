/*
# Add betaal_url to app_instellingen

1. Changes
- Add `betaal_url` (text, nullable) column to `app_instellingen`.
- This replaces the per-week betaal_links approach with a single global betaalverzoek link.
- The link is shown to players only on Saturday/Sunday for the current boeteweek.
2. Security
- No new tables. Existing RLS policies on app_instellingen already cover the new column
  (SELECT for all authenticated, INSERT/UPDATE for beheerder/hoofdbeheerder).
*/

ALTER TABLE app_instellingen
  ADD COLUMN IF NOT EXISTS betaal_url text;
