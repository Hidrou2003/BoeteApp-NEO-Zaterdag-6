/*
# Naam aliassen tabel

## Doel
De beheerder kan afwijkende banknamen of bijnamen permanent koppelen aan een speler.
De OCR-herkenning gebruikt deze aliassen om gelezen namen direct te matchen.

## Nieuwe tabellen
- `naam_aliases`
  - `id` uuid primary key
  - `speler_id` uuid FK naar spelers
  - `alias` text (de afwijkende naam zoals op de bankafschrift)
  - `created_at` timestamptz

## Beveiliging
- RLS aan.
- SELECT voor alle authenticated users.
- INSERT/UPDATE/DELETE alleen voor hoofdbeheerder.
*/

CREATE TABLE IF NOT EXISTS naam_aliases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  speler_id uuid NOT NULL REFERENCES spelers(id) ON DELETE CASCADE,
  alias text NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE naam_aliases ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "naam_aliases_select" ON naam_aliases;
CREATE POLICY "naam_aliases_select" ON naam_aliases FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "naam_aliases_insert" ON naam_aliases;
CREATE POLICY "naam_aliases_insert" ON naam_aliases FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.rol = 'hoofdbeheerder')
  );

DROP POLICY IF EXISTS "naam_aliases_update" ON naam_aliases;
CREATE POLICY "naam_aliases_update" ON naam_aliases FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.rol = 'hoofdbeheerder')
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.rol = 'hoofdbeheerder')
  );

DROP POLICY IF EXISTS "naam_aliases_delete" ON naam_aliases;
CREATE POLICY "naam_aliases_delete" ON naam_aliases FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.rol = 'hoofdbeheerder')
  );
