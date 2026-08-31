/*
# Seed Data - Spelers en Boetecategorieën

Inserts the 20 team players for NEO Zaterdag 6 and the default fine categories.
Uses ON CONFLICT DO NOTHING to be idempotent.
*/

-- Insert spelers (team players)
INSERT INTO spelers (naam) VALUES
  ('Ewen'),
  ('Max B'),
  ('Thijmen'),
  ('Hidde R'),
  ('Joep'),
  ('Guus'),
  ('Daan'),
  ('Hidde G'),
  ('Jorn'),
  ('Niek'),
  ('Max N'),
  ('Nick'),
  ('Lucas'),
  ('Rick'),
  ('Thomas'),
  ('Tim'),
  ('Julian'),
  ('Haye'),
  ('Emiel'),
  ('Bjorn')
ON CONFLICT DO NOTHING;

-- Insert default boetecategorieën
INSERT INTO boetecategorieen (naam, bedrag, verdubbelbaar, volgorde) VALUES
  ('Te laat', 200, true, 1),
  ('Geen tenue', 500, true, 2),
  ('Gele kaart', 300, true, 3),
  ('Rode kaart', 1000, true, 4),
  ('Niet aftappen', 100, false, 5),
  ('Telefoon in kleedkamer', 100, false, 6),
  ('Niet opruimen', 150, false, 7),
  ('Overig', 0, false, 8)
ON CONFLICT DO NOTHING;
