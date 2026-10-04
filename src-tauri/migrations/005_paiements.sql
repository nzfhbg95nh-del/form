-- Paiements (encaissements). Ils alimentent le livre des recettes.
-- Un paiement ne se modifie pas : on le supprime (inscrit au journal) puis on le saisit à nouveau.

CREATE TABLE payments (
  id            TEXT PRIMARY KEY,
  invoice_id    TEXT NOT NULL,
  paid_on       TEXT NOT NULL,
  amount_cents  INTEGER NOT NULL CHECK (amount_cents > 0),
  method        TEXT NOT NULL DEFAULT 'transfer',
  note          TEXT NOT NULL DEFAULT '',
  created_at    TEXT NOT NULL
);
CREATE INDEX idx_payments_invoice ON payments(invoice_id);
CREATE INDEX idx_payments_date ON payments(paid_on);

CREATE TRIGGER payments_only_on_issued BEFORE INSERT ON payments
WHEN (SELECT number FROM invoices WHERE id = NEW.invoice_id) IS NULL
  OR (SELECT kind FROM invoices WHERE id = NEW.invoice_id) = 'credit'
BEGIN
  SELECT RAISE(ABORT, 'Un paiement ne peut être enregistré que sur une facture émise (pas sur un avoir).');
END;

CREATE TRIGGER payments_no_update BEFORE UPDATE ON payments
BEGIN
  SELECT RAISE(ABORT, 'Un paiement ne se modifie pas : supprime-le puis saisis-le à nouveau.');
END;

CREATE TRIGGER payments_audit_insert AFTER INSERT ON payments
BEGIN
  INSERT INTO audit_log (at, entity, entity_id, number, action, detail)
  VALUES (NEW.created_at, 'invoice', NEW.invoice_id, (SELECT number FROM invoices WHERE id = NEW.invoice_id), 'payment',
          'Paiement de ' || printf('%.2f', NEW.amount_cents / 100.0) || ' EUR reçu le ' || NEW.paid_on || ' (' || NEW.method || ')');
END;

CREATE TRIGGER payments_audit_delete AFTER DELETE ON payments
BEGIN
  INSERT INTO audit_log (at, entity, entity_id, number, action, detail)
  VALUES (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), 'invoice', OLD.invoice_id, (SELECT number FROM invoices WHERE id = OLD.invoice_id), 'payment_deleted',
          'Paiement supprimé : ' || printf('%.2f', OLD.amount_cents / 100.0) || ' EUR du ' || OLD.paid_on || ' (' || OLD.method || ')');
END;
