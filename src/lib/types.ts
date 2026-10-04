export interface ObjectRow {
  id: string
  type: string
  parent_id: string | null
  title: string
  icon: string | null
  cover: string | null
  properties: string
  content: string | null
  position: number
  is_favorite: number
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export type ObjectPatch = Partial<
  Pick<ObjectRow, 'title' | 'icon' | 'cover' | 'content' | 'is_favorite' | 'deleted_at' | 'parent_id' | 'position' | 'properties'>
>

/** Tout ce que l'app sait faire avec la base. Deux versions : SQLite (vraie app) et navigateur (tests). */
export interface Client {
  id: string
  /** « pro » : professionnel (l'indemnité de recouvrement de 40 € s'applique) ou « particulier ». */
  kind: 'pro' | 'particulier'
  name: string
  company_name: string
  siren: string
  siret: string
  /** Numéro de TVA intracommunautaire. */
  vat_number: string
  street: string
  postal_code: string
  city: string
  country: string
  email: string
  phone: string
  contact: string
  notes: string
  created_at: string
  updated_at: string
  archived_at: string | null
}

export interface Service {
  id: string
  label: string
  description: string
  /** Prix unitaire HT en centimes d'euro : jamais de nombres à virgule pour l'argent. */
  unit_price_cents: number
  unit: string
  created_at: string
  updated_at: string
  archived_at: string | null
}

export interface Repo {
  listClients(): Promise<Client[]>
  saveClient(client: Client): Promise<void>
  listServices(): Promise<Service[]>
  saveService(service: Service): Promise<void>
  listObjects(): Promise<ObjectRow[]>
  createPage(parentId?: string | null, type?: string, properties?: string): Promise<ObjectRow>
  updateObject(id: string, patch: ObjectPatch): Promise<void>
  purgeObject(id: string): Promise<void>
  getSetting(key: string): Promise<string | null>
  setSetting(key: string, value: string): Promise<void>
  /** Copie complète et cohérente de la base vers un fichier. */
  backupTo(filePath: string): Promise<void>
}
