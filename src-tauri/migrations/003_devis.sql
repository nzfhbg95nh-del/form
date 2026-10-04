-- Devis. Statuts internes : draft (brouillon), sent (envoyé), accepted (accepté), refused (refusé).
-- Un devis n'a de numéro qu'une fois envoyé. Dès qu'il a un numéro, son contenu est verrouillé.

CREATE TABLE quotes (
  id               TEXT PRIMARY KEY,
  number           TEXT,
  status           TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'accepted', 'refused')),
  client_id        TEXT,
  title            TEXT NOT NULL DEFAULT '',
  issue_date       TEXT NOT NULL,
  valid_until      TEXT NOT NULL,
  deposit_percent  INTEGER NOT NULL DEFAULT 30,
  payment_days     INTEGER NOT NULL DEFAULT 30,
  included_revisions INTEGER,
  notes            TEXT NOT NULL DEFAULT '',
  snapshot         TEXT,
  created_at       TEXT NOT NULL,
  updated_at       TEXT NOT NULL
);

-- Deux devis ne peuvent jamais avoir le même numéro.
CREATE UNIQUE INDEX idx_quotes_number ON quotes(number) WHERE number IS NOT NULL;

CREATE TABLE quote_lines (
  id                TEXT PRIMARY KEY,
  quote_id          TEXT NOT NULL,
  position          INTEGER NOT NULL DEFAULT 0,
  service_id        TEXT,
  label             TEXT NOT NULL DEFAULT '',
  description       TEXT NOT NULL DEFAULT '',
  quantity_milli    INTEGER NOT NULL DEFAULT 1000,
  unit              TEXT NOT NULL DEFAULT 'jour',
  unit_price_cents  INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_quote_lines_quote ON quote_lines(quote_id);

-- Verrous : un devis numéroté ne peut plus être modifié, seulement accepté ou refusé.
CREATE TRIGGER quotes_no_delete_when_numbered BEFORE DELETE ON quotes
WHEN OLD.number IS NOT NULL
BEGIN
  SELECT RAISE(ABORT, 'Un devis numéroté ne peut pas être supprimé.');
END;

CREATE TRIGGER quotes_locked_when_numbered BEFORE UPDATE ON quotes
WHEN OLD.number IS NOT NULL AND (
     NEW.number IS NOT OLD.number
  OR NEW.client_id IS NOT OLD.client_id
  OR NEW.title IS NOT OLD.title
  OR NEW.issue_date IS NOT OLD.issue_date
  OR NEW.valid_until IS NOT OLD.valid_until
  OR NEW.deposit_percent IS NOT OLD.deposit_percent
  OR NEW.payment_days IS NOT OLD.payment_days
  OR NEW.included_revisions IS NOT OLD.included_revisions
  OR NEW.notes IS NOT OLD.notes
  OR NEW.snapshot IS NOT OLD.snapshot
)
BEGIN
  SELECT RAISE(ABORT, 'Un devis envoyé ne peut plus être modifié.');
END;

CREATE TRIGGER quote_lines_locked_insert BEFORE INSERT ON quote_lines
WHEN (SELECT number FROM quotes WHERE id = NEW.quote_id) IS NOT NULL
BEGIN
  SELECT RAISE(ABORT, 'Un devis envoyé ne peut plus être modifié.');
END;

CREATE TRIGGER quote_lines_locked_update BEFORE UPDATE ON quote_lines
WHEN (SELECT number FROM quotes WHERE id = OLD.quote_id) IS NOT NULL
BEGIN
  SELECT RAISE(ABORT, 'Un devis envoyé ne peut plus être modifié.');
END;

CREATE TRIGGER quote_lines_locked_delete BEFORE DELETE ON quote_lines
WHEN (SELECT number FROM quotes WHERE id = OLD.quote_id) IS NOT NULL
BEGIN
  SELECT RAISE(ABORT, 'Un devis envoyé ne peut plus être modifié.');
END;
