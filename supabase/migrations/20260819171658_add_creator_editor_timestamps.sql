/*
# Add timestamps for creator and editor tracking

1. Modified Tables
- `activiteiten`
  - `gemaakt_op` (timestamptz): when the activity was first created/saved
  - `gewijzigd_op` (timestamptz): when the activity was last modified

2. Notes
- Both columns are nullable so existing rows are not affected.
- The frontend will set these values when saving progress.
*/

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'activiteiten' AND column_name = 'gemaakt_op') THEN
    ALTER TABLE activiteiten ADD COLUMN gemaakt_op timestamptz;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'activiteiten' AND column_name = 'gewijzigd_op') THEN
    ALTER TABLE activiteiten ADD COLUMN gewijzigd_op timestamptz;
  END IF;
END $$;
