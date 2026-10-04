/** Colonnes (dans l'ordre) des tables du suivi d'activité. */
export const CLIENT_COLUMNS = [
  'id', 'kind', 'name', 'company_name', 'siren', 'siret', 'vat_number', 'street', 'postal_code', 'city',
  'country', 'email', 'phone', 'contact', 'notes', 'created_at', 'updated_at', 'archived_at',
] as const

export const SERVICE_COLUMNS = [
  'id', 'label', 'description', 'unit_price_cents', 'unit', 'created_at', 'updated_at', 'archived_at',
] as const

/** Requête « insérer ou mettre à jour » pour une table dont la clé est `id`. Les noms viennent de listes fixes, jamais de saisies. */
export function buildUpsert(table: string, columns: readonly string[], onlyIf?: string): string {
  const marks = columns.map((_, i) => `$${i + 1}`).join(', ')
  const updates = columns.filter((c) => c !== 'id').map((c) => `${c} = excluded.${c}`).join(', ')
  const guard = onlyIf ? ` WHERE ${onlyIf}` : ''
  return `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${marks}) ON CONFLICT(id) DO UPDATE SET ${updates}${guard}`
}

export const QUOTE_COLUMNS = [
  'id', 'number', 'status', 'client_id', 'title', 'issue_date', 'valid_until', 'deposit_percent', 'payment_days',
  'included_revisions', 'notes', 'snapshot', 'created_at', 'updated_at',
] as const

export const QUOTE_LINE_COLUMNS = [
  'id', 'quote_id', 'position', 'service_id', 'label', 'description', 'quantity_milli', 'unit', 'unit_price_cents',
] as const

/**
 * Donne un numéro à un devis en UNE SEULE requête : le numéro est le plus grand numéro déjà émis pour
 * l'année, plus 1. Une seule requête = impossible que deux devis reçoivent le même numéro, et aucun trou.
 * $1 = début du numéro (« D-2026- »), $2 = date, $3 = validité, $4 = photo figée, $5 = maintenant, $6 = id.
 */
export const ISSUE_QUOTE_SQL = `UPDATE quotes SET
  number = $1 || printf('%03d', COALESCE((SELECT MAX(CAST(substr(number, length($1) + 1) AS INTEGER)) FROM quotes WHERE number LIKE $1 || '%'), 0) + 1),
  status = 'sent', issue_date = $2, valid_until = $3, snapshot = $4, updated_at = $5
WHERE id = $6 AND number IS NULL`
