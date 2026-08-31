/*
# Add 'niet_gedeeld' status and betaal_link_actief setting

1. Schema changes
- betalingen: add 'niet_gedeeld' as valid betaal_status value.
  When a week is marked 'niet_gedeeld', all spelers' boetes carry over to the next week
  (same amount, not doubled — same as te_laag_betaald).
- app_instellingen: add betaal_link_actief boolean (default true).
  When false, the betaallink is hidden for all users at all times, even on weekends.

2. Notes
- 'niet_gedeeld' is a week-level setting: a single betalingen row with this status
  for any speler signals the whole week is "not shared". The carryover logic in the
  frontend treats ALL spelers in that week as if they have te_laag_betaald.
*/

ALTER TABLE betalingen DROP CONSTRAINT IF EXISTS betalingen_betaal_status_check;
ALTER TABLE betalingen ADD CONSTRAINT betalingen_betaal_status_check
  CHECK (betaal_status IN ('betaald', 'te_laag_betaald', 'niet_betaald', 'te_weinig_betaald', 'niet_gedeeld') OR betaal_status IS NULL);

ALTER TABLE app_instellingen ADD COLUMN IF NOT EXISTS betaal_link_actief boolean NOT NULL DEFAULT true;