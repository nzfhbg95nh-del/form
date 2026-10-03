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
  Pick<ObjectRow, 'title' | 'icon' | 'cover' | 'content' | 'is_favorite' | 'deleted_at' | 'parent_id' | 'position'>
>

/** Tout ce que l'app sait faire avec la base. Deux versions : SQLite (vraie app) et navigateur (tests). */
export interface Repo {
  listObjects(): Promise<ObjectRow[]>
  createPage(parentId?: string | null): Promise<ObjectRow>
  updateObject(id: string, patch: ObjectPatch): Promise<void>
  purgeObject(id: string): Promise<void>
  getSetting(key: string): Promise<string | null>
  setSetting(key: string, value: string): Promise<void>
  /** Copie complète et cohérente de la base vers un fichier. */
  backupTo(filePath: string): Promise<void>
}
