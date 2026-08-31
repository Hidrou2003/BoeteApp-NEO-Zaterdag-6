/*
# Betaal links en bank screenshots

## Doel
1. Per boete-week kan de hoofdbeheerder een betaallink (URL) opslaan die in het "Boete week" tabblad zichtbaar is op zaterdag en zondag van die week.
2. Per boete-week kan de hoofdbeheerder screenshots van bankbetalingen uploaden. De app leest namen en bedragen uit de afbeelding via OCR en toont een lijst per week.

## Nieuwe tabellen
- `betaal_links`
  - `id` uuid primary key
  - `week_key` text (bijv. "2026-W35"), uniek
  - `url` text (de betaallink)
  - `created_at` timestamptz
  - `updated_at` timestamptz
- `bank_screenshots`
  - `id` uuid primary key
  - `week_key` text
  - `storage_path` text (pad in Supabase Storage)
  - `ocr_result` jsonb (gelezen namen + bedragen)
  - `created_at` timestamptz

## Beveiliging
- RLS aan op beide tabellen.
- SELECT voor alle authenticated users (iedereen mag betaallinks en screenshots zien).
- INSERT/UPDATE/DELETE alleen voor hoofdbeheerder.
*/

CREATE TABLE IF NOT EXISTS betaal_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  week_key text UNIQUE NOT NULL,
  url text NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE betaal_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "betaal_links_select" ON betaal_links;
CREATE POLICY "betaal_links_select" ON betaal_links FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "betaal_links_insert" ON betaal_links;
CREATE POLICY "betaal_links_insert" ON betaal_links FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.rol = 'hoofdbeheerder')
  );

DROP POLICY IF EXISTS "betaal_links_update" ON betaal_links;
CREATE POLICY "betaal_links_update" ON betaal_links FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.rol = 'hoofdbeheerder')
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.rol = 'hoofdbeheerder')
  );

DROP POLICY IF EXISTS "betaal_links_delete" ON betaal_links;
CREATE POLICY "betaal_links_delete" ON betaal_links FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.rol = 'hoofdbeheerder')
  );

CREATE TABLE IF NOT EXISTS bank_screenshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  week_key text NOT NULL,
  storage_path text NOT NULL,
  ocr_result jsonb,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE bank_screenshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "bank_screenshots_select" ON bank_screenshots;
CREATE POLICY "bank_screenshots_select" ON bank_screenshots FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "bank_screenshots_insert" ON bank_screenshots;
CREATE POLICY "bank_screenshots_insert" ON bank_screenshots FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.rol = 'hoofdbeheerder')
  );

DROP POLICY IF EXISTS "bank_screenshots_update" ON bank_screenshots;
CREATE POLICY "bank_screenshots_update" ON bank_screenshots FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.rol = 'hoofdbeheerder')
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.rol = 'hoofdbeheerder')
  );

DROP POLICY IF EXISTS "bank_screenshots_delete" ON bank_screenshots;
CREATE POLICY "bank_screenshots_delete" ON bank_screenshots FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.rol = 'hoofdbeheerder')
  );

-- Storage bucket for bank screenshots
INSERT INTO storage.buckets (id, name, public)
VALUES ('bank-screenshots', 'bank-screenshots', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policies: read for all authenticated, write only for hoofdbeheerder
DROP POLICY IF EXISTS "bank_screenshots_storage_read" ON storage.objects;
CREATE POLICY "bank_screenshots_storage_read" ON storage.objects FOR SELECT
  TO authenticated USING (bucket_id = 'bank-screenshots');

DROP POLICY IF EXISTS "bank_screenshots_storage_insert" ON storage.objects;
CREATE POLICY "bank_screenshots_storage_insert" ON storage.objects FOR INSERT
  TO authenticated WITH CHECK (
    bucket_id = 'bank-screenshots' AND
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.rol = 'hoofdbeheerder')
  );

DROP POLICY IF EXISTS "bank_screenshots_storage_update" ON storage.objects;
CREATE POLICY "bank_screenshots_storage_update" ON storage.objects FOR UPDATE
  TO authenticated USING (
    bucket_id = 'bank-screenshots' AND
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.rol = 'hoofdbeheerder')
  ) WITH CHECK (
    bucket_id = 'bank-screenshots' AND
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.rol = 'hoofdbeheerder')
  );

DROP POLICY IF EXISTS "bank_screenshots_storage_delete" ON storage.objects;
CREATE POLICY "bank_screenshots_storage_delete" ON storage.objects FOR DELETE
  TO authenticated USING (
    bucket_id = 'bank-screenshots' AND
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.rol = 'hoofdbeheerder')
  );
