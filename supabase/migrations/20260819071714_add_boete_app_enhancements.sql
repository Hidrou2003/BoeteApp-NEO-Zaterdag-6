/*
# Boete App Enhancements

## Summary
Adds support for: dubbele maand, activity creator/editor tracking, speler-to-user linking,
per-speler absence threshold, overige (free-form) fines, and auto-fine for no-fine weeks.

## New Columns

### activiteiten
- is_dubbele_maand (boolean, default false): when true, ALL fines on this activity are doubled,
  on top of any is_dubbel doubling. Verdubbelbare fines that are already x2 become x4.
- gemaakt_door (uuid, references profiles): the user who created this activity.
- gewijzigd_door (uuid, references profiles): the user who last modified this activity.

### spelers
- profile_id (uuid, references profiles, nullable): links a speler to an app user.
  When set, the app shows the speler's naam instead of the user's username.
- max_ongeoorloord (integer, default 4): per-speler threshold for the absence fine increase.
  When a speler's ongeoorloord count exceeds this, the opslag goes from EUR 2 to EUR 4.

## New Tables

### overige_boetes
Free-form fines not tied to a specific activity's boete_items.
- id, speler_id, activiteit_id (nullable), omschrijving, bedrag, datum, created_at
- Used for fines like "didn't pay last week" that carry over to the next week.

## Modified Logic
- Ungeoorloord afwezig opslag changes from EUR 5/10 to EUR 2/4 (200/400 cents).
- The threshold for the increased opslag is now per-speler (max_ongeoorloord, default 4).
- The global threshold of 6 is replaced by the per-speler value.

## Security
- RLS enabled on overige_boetes.
- All authenticated users can read overige_boetes.
- Only beheerder/hoofdbeheerder can insert/update/delete overige_boetes.
- All existing RLS policies remain unchanged.
*/

-- Add columns to activiteiten
DO $$ BEGIN
  ALTER TABLE activiteiten ADD COLUMN is_dubbele_maand boolean NOT NULL DEFAULT false;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE activiteiten ADD COLUMN gemaakt_door uuid REFERENCES profiles(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE activiteiten ADD COLUMN gewijzigd_door uuid REFERENCES profiles(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

-- Add columns to spelers
DO $$ BEGIN
  ALTER TABLE spelers ADD COLUMN profile_id uuid REFERENCES profiles(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE spelers ADD COLUMN max_ongeoorloord integer NOT NULL DEFAULT 4;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

-- Create overige_boetes table
CREATE TABLE IF NOT EXISTS overige_boetes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  speler_id uuid NOT NULL REFERENCES spelers(id) ON DELETE CASCADE,
  activiteit_id uuid REFERENCES activiteiten(id) ON DELETE SET NULL,
  omschrijving text NOT NULL DEFAULT 'Overige boete',
  bedrag integer NOT NULL DEFAULT 0,
  datum date NOT NULL DEFAULT CURRENT_DATE,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE overige_boetes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "overige_boetes_select" ON overige_boetes;
CREATE POLICY "overige_boetes_select" ON overige_boetes FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "overige_boetes_insert" ON overige_boetes;
CREATE POLICY "overige_boetes_insert" ON overige_boetes FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.rol IN ('hoofdbeheerder', 'beheerder')));

DROP POLICY IF EXISTS "overige_boetes_update" ON overige_boetes;
CREATE POLICY "overige_boetes_update" ON overige_boetes FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.rol IN ('hoofdbeheerder', 'beheerder')))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.rol IN ('hoofdbeheerder', 'beheerder')));

DROP POLICY IF EXISTS "overige_boetes_delete" ON overige_boetes;
CREATE POLICY "overige_boetes_delete" ON overige_boetes FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.rol IN ('hoofdbeheerder', 'beheerder')));

CREATE INDEX IF NOT EXISTS idx_overige_boetes_speler ON overige_boetes(speler_id);
CREATE INDEX IF NOT EXISTS idx_overige_boetes_datum ON overige_boetes(datum DESC);

-- Allow beheerders to update gemaakt_door/gewijzigd_door on activiteiten (existing update policy already covers this)
-- Allow beheerders to update profile_id/max_ongeoorloord on spelers (existing update policy already covers this)
