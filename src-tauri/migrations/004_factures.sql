-- Factures. Types : deposit (acompte), final (solde), standard, credit (avoir).
-- Statuts enregistrés : draft, issued, paid. « En retard » n'est pas enregistré : il se déduit de l'échéance.
-- Dès qu'une facture a un numéro, elle est verrouillée : seule la ligne « status » peut encore changer (paiement).

CREATE TABLE invoices (
  id                  TEXT PRIMARY KEY,
  number              TEXT,
  kind                TEXT NOT NULL CHECK (kind IN ('deposit', 'final', 'standard', 'credit')),
  status              TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'issued', 'paid')),
  client_id           TEXT,
  quote_id            TEXT,
  related_invoice_id  TEXT,
  title               TEXT NOT NULL DEFAULT '',
  issue_date          TEXT NOT NULL,
  service_date        TEXT NOT NULL,
  service_date_end    TEXT,
  due_date            TEXT NOT NULL,
  payment_days        INTEGER NOT NULL DEFAULT 30,
  notes               TEXT NOT NULL DEFAULT '',
  snapshot            TEXT,
  created_at          TEXT NOT NULL,
  updated_at          TEXT NOT NULL
);

CREATE UNIQUE INDEX idx_invoices_number ON invoices(number) WHERE number IS NOT NULL;
CREATE INDEX idx_invoices_quote ON invoices(quote_id);

CREATE TABLE invoice_lines (
  id                TEXT PRIMARY KEY,
  invoice_id        TEXT NOT NULL,
  position          INTEGER NOT NULL DEFAULT 0,
  line_kind         TEXT NOT NULL DEFAULT 'item' CHECK (line_kind IN ('item', 'deposit_deduction')),
  service_id        TEXT,
  label             TEXT NOT NULL DEFAULT '',
  description       TEXT NOT NULL DEFAULT '',
  quantity_milli    INTEGER NOT NULL DEFAULT 1000,
  unit              TEXT NOT NULL DEFAULT 'jour',
  unit_price_cents  INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_invoice_lines_invoice ON invoice_lines(invoice_id);

-- Journal : toute action sur une facture émise y est inscrite, et rien ne peut en être effacé.
CREATE TABLE audit_log (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  at         TEXT NOT NULL,
  entity     TEXT NOT NULL,
  entity_id  TEXT NOT NULL,
  number     TEXT,
  action     TEXT NOT NULL,
  detail     TEXT NOT NULL DEFAULT ''
);

CREATE TRIGGER audit_log_no_update BEFORE UPDATE ON audit_log
BEGIN
  SELECT RAISE(ABORT, 'Le journal ne peut pas être modifié.');
END;

CREATE TRIGGER audit_log_no_delete BEFORE DELETE ON audit_log
BEGIN
  SELECT RAISE(ABORT, 'Le journal ne peut pas être modifié.');
END;

-- Verrous
CREATE TRIGGER invoices_no_delete_when_numbered BEFORE DELETE ON invoices
WHEN OLD.number IS NOT NULL
BEGIN
  SELECT RAISE(ABORT, 'Une facture émise ne peut pas être supprimée : corrige-la par un avoir.');
END;

CREATE TRIGGER invoices_locked_when_numbered BEFORE UPDATE ON invoices
WHEN OLD.number IS NOT NULL AND (
     NEW.number IS NOT OLD.number
  OR NEW.kind IS NOT OLD.kind
  OR NEW.client_id IS NOT OLD.client_id
  OR NEW.quote_id IS NOT OLD.quote_id
  OR NEW.related_invoice_id IS NOT OLD.related_invoice_id
  OR NEW.title IS NOT OLD.title
  OR NEW.issue_date IS NOT OLD.issue_date
  OR NEW.service_date IS NOT OLD.service_date
  OR NEW.service_date_end IS NOT OLD.service_date_end
  OR NEW.due_date IS NOT OLD.due_date
  OR NEW.payment_days IS NOT OLD.payment_days
  OR NEW.notes IS NOT OLD.notes
  OR NEW.snapshot IS NOT OLD.snapshot
)
BEGIN
  SELECT RAISE(ABORT, 'Une facture émise ne peut plus être modifiée : corrige-la par un avoir.');
END;

CREATE TRIGGER invoice_lines_locked_insert BEFORE INSERT ON invoice_lines
WHEN (SELECT number FROM invoices WHERE id = NEW.invoice_id) IS NOT NULL
BEGIN
  SELECT RAISE(ABORT, 'Une facture émise ne peut plus être modifiée : corrige-la par un avoir.');
END;

CREATE TRIGGER invoice_lines_locked_update BEFORE UPDATE ON invoice_lines
WHEN (SELECT number FROM invoices WHERE id = OLD.invoice_id) IS NOT NULL
BEGIN
  SELECT RAISE(ABORT, 'Une facture émise ne peut plus être modifiée : corrige-la par un avoir.');
END;

CREATE TRIGGER invoice_lines_locked_delete BEFORE DELETE ON invoice_lines
WHEN (SELECT number FROM invoices WHERE id = OLD.invoice_id) IS NOT NULL
BEGIN
  SELECT RAISE(ABORT, 'Une facture émise ne peut plus être modifiée : corrige-la par un avoir.');
END;

-- Écriture automatique dans le journal
CREATE TRIGGER invoices_audit_issued AFTER UPDATE ON invoices
WHEN OLD.number IS NULL AND NEW.number IS NOT NULL
BEGIN
  INSERT INTO audit_log (at, entity, entity_id, number, action, detail)
  VALUES (NEW.updated_at, 'invoice', NEW.id, NEW.number, 'issued', 'Facture émise le ' || NEW.issue_date);
END;

CREATE TRIGGER invoices_audit_status AFTER UPDATE ON invoices
WHEN OLD.number IS NOT NULL AND NEW.status IS NOT OLD.status
BEGIN
  INSERT INTO audit_log (at, entity, entity_id, number, action, detail)
  VALUES (NEW.updated_at, 'invoice', NEW.id, NEW.number, 'status', OLD.status || ' -> ' || NEW.status);
END;
