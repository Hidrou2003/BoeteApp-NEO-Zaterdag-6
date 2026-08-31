/*
# Boete App - Complete Schema

## Summary
Creates the full schema for the NEO Zaterdag 6 Boete App.

## New Tables

### profiles
Extends auth.users with role information.
- id: references auth.users
- email: user email
- naam: display name
- rol: 'hoofdbeheerder' | 'beheerder' | 'kijker' (default: kijker)
- created_at

### spelers
Team players (not the same as app users).
- id, naam, created_at

### boetecategorieen
Fine categories with amounts and doubling flag.
- id, naam, bedrag (cents), verdubbelbaar (bool), actief
- created_at

### activiteiten
Training/match sessions.
- id, naam, datum, is_dubbel (double fines toggle), afgerond (finalized)
- created_at

### activiteit_spelers
Per-player record for each activity (attendance + fines).
- id, activiteit_id, speler_id
- aanwezigheid: 'aanwezig' | 'geoorloofd_afwezig' | 'ongeoorloofd_afwezig'
- eigen_boetes_totaal (cents, raw fines given directly)
- gemiddeld_bedrag (cents, computed average from present players)
- opslag_bedrag (cents, 5 or 10 euros based on absence history)
- totaal_bedrag (cents, final total)
- created_at

### boete_items
Individual fine line-items per player per activity.
- id, activiteit_speler_id, categorie_id, aantal, bedrag_per_stuk (cents), subtotaal

## Security
- RLS enabled on all tables
- hoofdbeheerder: full access to everything
- beheerder: can insert activiteiten, insert/update/delete activiteit_spelers + boete_items, read everything
- kijker (authenticated): read-only on all tables
*/

-- PROFILES
CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  naam text NOT NULL DEFAULT '',
  rol text NOT NULL DEFAULT 'kijker' CHECK (rol IN ('hoofdbeheerder', 'beheerder', 'kijker')),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles_select" ON profiles;
CREATE POLICY "profiles_select" ON profiles FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "profiles_insert" ON profiles;
CREATE POLICY "profiles_insert" ON profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "profiles_update_own" ON profiles;
CREATE POLICY "profiles_update_own" ON profiles FOR UPDATE TO authenticated
  USING (auth.uid() = id OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.rol = 'hoofdbeheerder'))
  WITH CHECK (auth.uid() = id OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.rol = 'hoofdbeheerder'));

DROP POLICY IF EXISTS "profiles_delete" ON profiles;
CREATE POLICY "profiles_delete" ON profiles FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.rol = 'hoofdbeheerder'));

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, naam, rol)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'naam', split_part(NEW.email, '@', 1)),
    'kijker'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- SPELERS
CREATE TABLE IF NOT EXISTS spelers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  naam text NOT NULL,
  actief boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE spelers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "spelers_select" ON spelers;
CREATE POLICY "spelers_select" ON spelers FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "spelers_insert" ON spelers;
CREATE POLICY "spelers_insert" ON spelers FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.rol = 'hoofdbeheerder'));

DROP POLICY IF EXISTS "spelers_update" ON spelers;
CREATE POLICY "spelers_update" ON spelers FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.rol = 'hoofdbeheerder'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.rol = 'hoofdbeheerder'));

DROP POLICY IF EXISTS "spelers_delete" ON spelers;
CREATE POLICY "spelers_delete" ON spelers FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.rol = 'hoofdbeheerder'));

-- BOETECATEGORIEEN
CREATE TABLE IF NOT EXISTS boetecategorieen (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  naam text NOT NULL,
  bedrag integer NOT NULL DEFAULT 0,
  verdubbelbaar boolean NOT NULL DEFAULT false,
  actief boolean NOT NULL DEFAULT true,
  volgorde integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE boetecategorieen ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "boetecategorieen_select" ON boetecategorieen;
CREATE POLICY "boetecategorieen_select" ON boetecategorieen FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "boetecategorieen_insert" ON boetecategorieen;
CREATE POLICY "boetecategorieen_insert" ON boetecategorieen FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.rol = 'hoofdbeheerder'));

DROP POLICY IF EXISTS "boetecategorieen_update" ON boetecategorieen;
CREATE POLICY "boetecategorieen_update" ON boetecategorieen FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.rol = 'hoofdbeheerder'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.rol = 'hoofdbeheerder'));

DROP POLICY IF EXISTS "boetecategorieen_delete" ON boetecategorieen;
CREATE POLICY "boetecategorieen_delete" ON boetecategorieen FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.rol = 'hoofdbeheerder'));

-- ACTIVITEITEN
CREATE TABLE IF NOT EXISTS activiteiten (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  naam text NOT NULL,
  datum date NOT NULL DEFAULT CURRENT_DATE,
  is_dubbel boolean NOT NULL DEFAULT false,
  afgerond boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE activiteiten ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "activiteiten_select" ON activiteiten;
CREATE POLICY "activiteiten_select" ON activiteiten FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "activiteiten_insert" ON activiteiten;
CREATE POLICY "activiteiten_insert" ON activiteiten FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.rol IN ('hoofdbeheerder', 'beheerder')));

DROP POLICY IF EXISTS "activiteiten_update" ON activiteiten;
CREATE POLICY "activiteiten_update" ON activiteiten FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.rol IN ('hoofdbeheerder', 'beheerder')))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.rol IN ('hoofdbeheerder', 'beheerder')));

DROP POLICY IF EXISTS "activiteiten_delete" ON activiteiten;
CREATE POLICY "activiteiten_delete" ON activiteiten FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.rol IN ('hoofdbeheerder', 'beheerder')));

-- ACTIVITEIT_SPELERS
CREATE TABLE IF NOT EXISTS activiteit_spelers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  activiteit_id uuid NOT NULL REFERENCES activiteiten(id) ON DELETE CASCADE,
  speler_id uuid NOT NULL REFERENCES spelers(id) ON DELETE CASCADE,
  aanwezigheid text CHECK (aanwezigheid IN ('aanwezig', 'geoorloofd_afwezig', 'ongeoorloofd_afwezig')),
  eigen_boetes_totaal integer NOT NULL DEFAULT 0,
  gemiddeld_bedrag integer NOT NULL DEFAULT 0,
  opslag_bedrag integer NOT NULL DEFAULT 0,
  totaal_bedrag integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  UNIQUE(activiteit_id, speler_id)
);

ALTER TABLE activiteit_spelers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "activiteit_spelers_select" ON activiteit_spelers;
CREATE POLICY "activiteit_spelers_select" ON activiteit_spelers FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "activiteit_spelers_insert" ON activiteit_spelers;
CREATE POLICY "activiteit_spelers_insert" ON activiteit_spelers FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.rol IN ('hoofdbeheerder', 'beheerder')));

DROP POLICY IF EXISTS "activiteit_spelers_update" ON activiteit_spelers;
CREATE POLICY "activiteit_spelers_update" ON activiteit_spelers FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.rol IN ('hoofdbeheerder', 'beheerder')))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.rol IN ('hoofdbeheerder', 'beheerder')));

DROP POLICY IF EXISTS "activiteit_spelers_delete" ON activiteit_spelers;
CREATE POLICY "activiteit_spelers_delete" ON activiteit_spelers FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.rol IN ('hoofdbeheerder', 'beheerder')));

-- BOETE_ITEMS
CREATE TABLE IF NOT EXISTS boete_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  activiteit_speler_id uuid NOT NULL REFERENCES activiteit_spelers(id) ON DELETE CASCADE,
  categorie_id uuid NOT NULL REFERENCES boetecategorieen(id) ON DELETE CASCADE,
  aantal integer NOT NULL DEFAULT 1,
  bedrag_per_stuk integer NOT NULL DEFAULT 0,
  subtotaal integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE boete_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "boete_items_select" ON boete_items;
CREATE POLICY "boete_items_select" ON boete_items FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "boete_items_insert" ON boete_items;
CREATE POLICY "boete_items_insert" ON boete_items FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.rol IN ('hoofdbeheerder', 'beheerder')));

DROP POLICY IF EXISTS "boete_items_update" ON boete_items;
CREATE POLICY "boete_items_update" ON boete_items FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.rol IN ('hoofdbeheerder', 'beheerder')))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.rol IN ('hoofdbeheerder', 'beheerder')));

DROP POLICY IF EXISTS "boete_items_delete" ON boete_items;
CREATE POLICY "boete_items_delete" ON boete_items FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.rol IN ('hoofdbeheerder', 'beheerder')));

-- INDEXES
CREATE INDEX IF NOT EXISTS idx_activiteit_spelers_activiteit ON activiteit_spelers(activiteit_id);
CREATE INDEX IF NOT EXISTS idx_activiteit_spelers_speler ON activiteit_spelers(speler_id);
CREATE INDEX IF NOT EXISTS idx_boete_items_activiteit_speler ON boete_items(activiteit_speler_id);
CREATE INDEX IF NOT EXISTS idx_activiteiten_datum ON activiteiten(datum DESC);
