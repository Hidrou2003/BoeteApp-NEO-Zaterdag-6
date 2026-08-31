/*
# Add statistics tables and statistiekenbeheerder role

1. New Tables
- `wedstrijden` — represents a match with date and opponent
  - id (uuid PK)
  - datum (date, not null) — match date
  - tegenstander (text, not null) — opponent name
  - locatie (text, nullable) — home/away/neutral
  - created_at (timestamptz)
  - gemaakt_door (uuid, nullable) — profile who created it
- `wedstrijd_speler_stats` — per-player statistics for a match
  - id (uuid PK)
  - wedstrijd_id (uuid FK -> wedstrijden)
  - speler_id (uuid FK -> spelers)
  - goals (int, default 0)
  - assists (int, default 0)
  - gele_kaarten (int, default 0)
  - rode_kaarten (int, default 0)
  - eigen_goals (int, default 0)
  - created_at (timestamptz)
  - Unique constraint on (wedstrijd_id, speler_id)

2. Modified Tables
- `profiles` — add 'statistiekenbeheerder' to the rol check constraint

3. Security
- RLS enabled on both new tables
- All authenticated users can SELECT (kijker can see stats)
- Only statistiekenbeheerder and hoofdbeheerder can INSERT/UPDATE/DELETE
*/

-- Add statistiekenbeheerder to profiles rol check constraint
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_rol_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_rol_check
  CHECK (rol IN ('hoofdbeheerder', 'beheerder', 'kijker', 'statistiekenbeheerder'));

-- Create wedstrijden table
CREATE TABLE IF NOT EXISTS wedstrijden (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  datum date NOT NULL,
  tegenstander text NOT NULL,
  locatie text,
  gemaakt_door uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE wedstrijden ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read wedstrijden
DROP POLICY IF EXISTS "select_wedstrijden" ON wedstrijden;
CREATE POLICY "select_wedstrijden" ON wedstrijden FOR SELECT
  TO authenticated USING (true);

-- Only statistiekenbeheerder and hoofdbeheerder can insert
DROP POLICY IF EXISTS "insert_wedstrijden" ON wedstrijden;
CREATE POLICY "insert_wedstrijden" ON wedstrijden FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.rol IN ('statistiekenbeheerder', 'hoofdbeheerder'))
  );

-- Only statistiekenbeheerder and hoofdbeheerder can update
DROP POLICY IF EXISTS "update_wedstrijden" ON wedstrijden;
CREATE POLICY "update_wedstrijden" ON wedstrijden FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.rol IN ('statistiekenbeheerder', 'hoofdbeheerder'))
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.rol IN ('statistiekenbeheerder', 'hoofdbeheerder'))
  );

-- Only statistiekenbeheerder and hoofdbeheerder can delete
DROP POLICY IF EXISTS "delete_wedstrijden" ON wedstrijden;
CREATE POLICY "delete_wedstrijden" ON wedstrijden FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.rol IN ('statistiekenbeheerder', 'hoofdbeheerder'))
  );

-- Create wedstrijd_speler_stats table
CREATE TABLE IF NOT EXISTS wedstrijd_speler_stats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wedstrijd_id uuid NOT NULL REFERENCES wedstrijden(id) ON DELETE CASCADE,
  speler_id uuid NOT NULL REFERENCES spelers(id) ON DELETE CASCADE,
  goals int NOT NULL DEFAULT 0,
  assists int NOT NULL DEFAULT 0,
  gele_kaarten int NOT NULL DEFAULT 0,
  rode_kaarten int NOT NULL DEFAULT 0,
  eigen_goals int NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  UNIQUE(wedstrijd_id, speler_id)
);

ALTER TABLE wedstrijd_speler_stats ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read stats
DROP POLICY IF EXISTS "select_wedstrijd_stats" ON wedstrijd_speler_stats;
CREATE POLICY "select_wedstrijd_stats" ON wedstrijd_speler_stats FOR SELECT
  TO authenticated USING (true);

-- Only statistiekenbeheerder and hoofdbeheerder can insert
DROP POLICY IF EXISTS "insert_wedstrijd_stats" ON wedstrijd_speler_stats;
CREATE POLICY "insert_wedstrijd_stats" ON wedstrijd_speler_stats FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.rol IN ('statistiekenbeheerder', 'hoofdbeheerder'))
  );

-- Only statistiekenbeheerder and hoofdbeheerder can update
DROP POLICY IF EXISTS "update_wedstrijd_stats" ON wedstrijd_speler_stats;
CREATE POLICY "update_wedstrijd_stats" ON wedstrijd_speler_stats FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.rol IN ('statistiekenbeheerder', 'hoofdbeheerder'))
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.rol IN ('statistiekenbeheerder', 'hoofdbeheerder'))
  );

-- Only statistiekenbeheerder and hoofdbeheerder can delete
DROP POLICY IF EXISTS "delete_wedstrijd_stats" ON wedstrijd_speler_stats;
CREATE POLICY "delete_wedstrijd_stats" ON wedstrijd_speler_stats FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.rol IN ('statistiekenbeheerder', 'hoofdbeheerder'))
  );

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_wedstrijd_speler_stats_wedstrijd_id ON wedstrijd_speler_stats(wedstrijd_id);
CREATE INDEX IF NOT EXISTS idx_wedstrijd_speler_stats_speler_id ON wedstrijd_speler_stats(speler_id);
