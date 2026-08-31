-- Add 'ntb' (nader te bepalen) as a valid betaal_status
ALTER TABLE betalingen DROP CONSTRAINT IF EXISTS betalingen_betaal_status_check;
ALTER TABLE betalingen ADD CONSTRAINT betalingen_betaal_status_check
  CHECK (betaal_status IN ('betaald', 'te_laag_betaald', 'niet_betaald', 'te_weinig_betaald', 'ntb') OR betaal_status IS NULL);