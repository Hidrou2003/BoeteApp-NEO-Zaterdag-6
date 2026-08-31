/*
# Add doe_mee_aan_boetes column and separate statistiekenbeheerder flag

1. Modified Tables
- `spelers` — add `doe_mee_aan_boetes` boolean column (default true)
  - When false, the speler does not participate in boetes (not shown in flow/overzicht/betaling)
  - They still appear in the statistieken page
- `profiles` — add `is_statistiekenbeheerder` boolean column (default false)
  - This is SEPARATE from the `rol` column, so someone can be beheerder AND statistiekenbeheerder
  - The `rol` column keeps its existing values (hoofdbeheerder, beheerder, kijker)
  - statistiekenbeheerder is no longer a value in `rol` — it's a separate flag

2. Security
- No new tables, RLS unchanged
- The new columns inherit existing RLS policies from their tables
*/

-- Add doe_mee_aan_boetes to spelers (default true for existing spelers)
ALTER TABLE spelers ADD COLUMN IF NOT EXISTS doe_mee_aan_boetes boolean NOT NULL DEFAULT true;

-- Add is_statistiekenbeheerder to profiles (default false)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_statistiekenbeheerder boolean NOT NULL DEFAULT false;

-- Migrate existing statistiekenbeheerder rol values to the new boolean flag
UPDATE profiles SET is_statistiekenbeheerder = true WHERE rol = 'statistiekenbeheerder';

-- Revert any statistiekenbeheerder rol back to kijker (since the flag now holds this info)
UPDATE profiles SET rol = 'kijker' WHERE rol = 'statistiekenbeheerder';

-- Update the rol check constraint to remove statistiekenbeheerder
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_rol_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_rol_check
  CHECK (rol IN ('hoofdbeheerder', 'beheerder', 'kijker'));
