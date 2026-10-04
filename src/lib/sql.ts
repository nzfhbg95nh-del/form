/** Colonnes (dans l'ordre) des tables du suivi d'activité. */
export const CLIENT_COLUMNS = [
  'id', 'kind', 'name', 'company_name', 'siren', 'siret', 'vat_number', 'street', 'postal_code', 'city',
  'country', 'email', 'phone', 'contact', 'notes', 'created_at', 'updated_at', 'archived_at',
] as const

export const SERVICE_COLUMNS = [
  'id', 'label', 'description', 'unit_price_cents', 'unit', 'created_at', 'updated_at', 'archived_at',
] as const

/** Requête « insérer ou mettre à jour » pour une table dont la clé est `id`. Les noms viennent de listes fixes, jamais de saisies. */
export function buildUpsert(table: string, columns: readonly string[]): string {
  const marks = columns.map((_, i) => `$${i + 1}`).join(', ')
  const updates = columns.filter((c) => c !== 'id').map((c) => `${c} = excluded.${c}`).join(', ')
  return `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${marks}) ON CONFLICT(id) DO UPDATE SET ${updates}`
}
