/*
# Add open bedrag boetes and resume index

1. Modified Tables
- `boetecategorieen`: add `open_bedrag` boolean (default false). When true, the fine amount is entered during activity flow instead of being fixed.
- `activiteiten`: add `laatste_speler_index` integer (default 0). Tracks the last speler position so the flow can resume at the correct speler after a partial save.

2. Security
- No RLS policy changes needed; existing policies cover the new columns.
*/

ALTER TABLE boetecategorieen ADD COLUMN IF NOT EXISTS open_bedrag boolean NOT NULL DEFAULT false;

ALTER TABLE activiteiten ADD COLUMN IF NOT EXISTS laatste_speler_index integer NOT NULL DEFAULT 0;
