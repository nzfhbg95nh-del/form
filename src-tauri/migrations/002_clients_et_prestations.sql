CREATE TABLE clients (
  id           TEXT PRIMARY KEY,
  kind         TEXT NOT NULL DEFAULT 'pro',
  name         TEXT NOT NULL DEFAULT '',
  company_name TEXT NOT NULL DEFAULT '',
  siren        TEXT NOT NULL DEFAULT '',
  siret        TEXT NOT NULL DEFAULT '',
  vat_number   TEXT NOT NULL DEFAULT '',
  street       TEXT NOT NULL DEFAULT '',
  postal_code  TEXT NOT NULL DEFAULT '',
  city         TEXT NOT NULL DEFAULT '',
  country      TEXT NOT NULL DEFAULT 'France',
  email        TEXT NOT NULL DEFAULT '',
  phone        TEXT NOT NULL DEFAULT '',
  contact      TEXT NOT NULL DEFAULT '',
  notes        TEXT NOT NULL DEFAULT '',
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL,
  archived_at  TEXT
);

CREATE TABLE services (
  id               TEXT PRIMARY KEY,
  label            TEXT NOT NULL DEFAULT '',
  description      TEXT NOT NULL DEFAULT '',
  unit_price_cents INTEGER NOT NULL DEFAULT 0,
  unit             TEXT NOT NULL DEFAULT 'jour',
  created_at       TEXT NOT NULL,
  updated_at       TEXT NOT NULL,
  archived_at      TEXT
);
