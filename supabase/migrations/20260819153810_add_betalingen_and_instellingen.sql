/*
# Betalingen en App Instellingen

## Summary
Voegt twee nieuwe tabellen toe voor de Betaling-functie:
1. `betalingen` - per speler per boeteweek: betaalstatus en te-weinig-bedrag
2. `app_instellingen` - globale instellingen (singleton rij) waaronder de "0€ = 2€" regel

## New Tables

### app_instellingen
- id (int, primary key, altijd 1): singleton rij
- nul_euro_is_twee_euro (boolean, default false): als true, wordt een weektotaal van 0€ omgezet naar 2€
- created_at, updated_at

### betalingen
- id (uuid, primary key)
- speler_id (uuid, references spelers, cascade delete)
- week_key (text, bijv. "2026-W35"): de boeteweek waarop de betaling betrekking heeft
- betaal_status (text): 'betaald' | 'te_laat_betaald' | 'niet_betaald' | 'te_weinig_betaald' | null
- te_weinig_bedrag (integer, cents): alleen ingevuld bij status 'te_weinig_betaald'
- created_at, updated_at
- UNIQUE(speler_id, week_key)

## Logic (frontend)
- De boeteweek loopt van zaterdag t/m vrijdag (bestaande getBoeteweekKey functie)
- Op zaterdag en zondag wordt het weektotaal van de vorige week getoond
- De "0€ = 2€" regel wordt TOEGEPAST op het weektotaal VOORDAT carryover van niet/te-laat/te-weinig betaald wordt bijgeteld
- Carryover: te_laag_betaald → vorige week bedrag erbij; niet_betaald → vorige week bedrag x2 erbij; te_weinig_betaald → te_weinig_bedrag x2 erbij
- De carryover staat los van de 0€=2€ regel

## Security
- RLS enabled op beide tabellen
- app_instellingen: alle authenticated users kunnen lezen; alleen beheerder/hoofdbeheerder kan schrijven
- betalingen: alle authenticated users kunnen lezen; alleen beheerder/hoofdbeheerder kan schrijven
*/

-- APP INSTELLINGEN (singleton)
CREATE TABLE IF NOT EXISTS app_instellingen (
  id int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  nul_euro_is_twee_euro boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE app_instellingen ENABLE ROW LEVEL SECURITY;

INSERT INTO app_instellingen (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "app_instellingen_select" ON app_instellingen;
CREATE POLICY "app_instellingen_select" ON app_instellingen FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "app_instellingen_insert" ON app_instellingen;
CREATE POLICY "app_instellingen_insert" ON app_instellingen FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.rol IN ('hoofdbeheerder', 'beheerder')));

DROP POLICY IF EXISTS "app_instellingen_update" ON app_instellingen;
CREATE POLICY "app_instellingen_update" ON app_instellingen FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.rol IN ('hoofdbeheerder', 'beheerder')))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.rol IN ('hoofdbeheerder', 'beheerder')));

-- BETALINGEN
CREATE TABLE IF NOT EXISTS betalingen (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  speler_id uuid NOT NULL REFERENCES spelers(id) ON DELETE CASCADE,
  week_key text NOT NULL,
  betaal_status text CHECK (betaal_status IN ('betaald', 'te_laag_betaald', 'niet_betaald', 'te_weinig_betaald') OR betaal_status IS NULL),
  te_weinig_bedrag integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(speler_id, week_key)
);

ALTER TABLE betalingen ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "betalingen_select" ON betalingen;
CREATE POLICY "betalingen_select" ON betalingen FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "betalingen_insert" ON betalingen;
CREATE POLICY "betalingen_insert" ON betalingen FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.rol IN ('hoofdbeheerder', 'beheerder')));

DROP POLICY IF EXISTS "betalingen_update" ON betalingen;
CREATE POLICY "betalingen_update" ON betalingen FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.rol IN ('hoofdbeheerder', 'beheerder')))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.rol IN ('hoofdbeheerder', 'beheerder')));

DROP POLICY IF EXISTS "betalingen_delete" ON betalingen;
CREATE POLICY "betalingen_delete" ON betalingen FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.rol IN ('hoofdbeheerder', 'beheerder')));

CREATE INDEX IF NOT EXISTS idx_betalingen_speler_week ON betalingen(speler_id, week_key);
CREATE INDEX IF NOT EXISTS idx_betalingen_week ON betalingen(week_key);
