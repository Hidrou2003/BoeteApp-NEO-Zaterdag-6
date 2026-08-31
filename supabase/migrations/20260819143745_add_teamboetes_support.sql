/*
# Add team boetes support

1. Modified Tables
- `boetecategorieen`: add `is_teamboete` boolean (default false). When true, the category is a team-related fine that:
  - Appears in a separate section at the end of the activity flow
  - Applies to ALL players (present and absent)
  - Does NOT count toward the average (gemiddelde) calculation
  - Has its own tab in instellingen

2. Security
- No RLS policy changes needed; existing policies cover the new column.
*/

ALTER TABLE boetecategorieen ADD COLUMN IF NOT EXISTS is_teamboete boolean NOT NULL DEFAULT false;
