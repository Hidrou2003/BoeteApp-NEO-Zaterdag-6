-- Add creator/editor tracking columns to activiteiten
DO $$ BEGIN
  ALTER TABLE activiteiten ADD COLUMN is_dubbele_maand boolean NOT NULL DEFAULT false;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE activiteiten ADD COLUMN gemaakt_door uuid REFERENCES profiles(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE activiteiten ADD COLUMN gewijzigd_door uuid REFERENCES profiles(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

-- Add speler-to-user linking and absence threshold
DO $$ BEGIN
  ALTER TABLE spelers ADD COLUMN profile_id uuid REFERENCES profiles(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE spelers ADD COLUMN max_ongeoorloord integer NOT NULL DEFAULT 4;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

-- Create overige_boetes table if missing
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