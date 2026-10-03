import Database from '@tauri-apps/plugin-sql'
import type { ObjectPatch, ObjectRow, Repo } from './types'

export async function createSqlRepo(): Promise<Repo> {
  const db = await Database.load('sqlite:form.db')
  const now = () => new Date().toISOString()

  return {
    async listObjects() {
      return db.select<ObjectRow[]>('SELECT * FROM objects ORDER BY position, created_at')
    },
    async createPage(parentId: string | null = null) {
      const t = now()
      const row: ObjectRow = {
        id: crypto.randomUUID(), type: 'page', parent_id: parentId, title: '', icon: null,
        cover: null, properties: '{}', content: null, position: Date.now(), is_favorite: 0,
        created_at: t, updated_at: t, deleted_at: null,
      }
      await db.execute(
        'INSERT INTO objects (id, type, parent_id, title, properties, position, is_favorite, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)',
        [row.id, row.type, row.parent_id, row.title, row.properties, row.position, 0, t, t],
      )
      return row
    },
    async updateObject(id: string, patch: ObjectPatch) {
      const keys = Object.keys(patch) as (keyof ObjectPatch)[]
      if (keys.length === 0) return
      const sets = keys.map((k, i) => `${k} = $${i + 1}`).join(', ')
      const values = keys.map((k) => patch[k] ?? null)
      await db.execute(
        `UPDATE objects SET ${sets}, updated_at = $${keys.length + 1} WHERE id = $${keys.length + 2}`,
        [...values, now(), id],
      )
    },
    async purgeObject(id: string) {
      await db.execute('DELETE FROM objects WHERE id = $1', [id])
    },
    async getSetting(key: string) {
      const rows = await db.select<{ value: string | null }[]>('SELECT value FROM settings WHERE key = $1', [key])
      return rows[0]?.value ?? null
    },
    async setSetting(key: string, value: string) {
      await db.execute(
        'INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
        [key, value],
      )
    },
    async backupTo(filePath: string) {
      // VACUUM INTO produit une copie propre même si la base est ouverte.
      // SQLite refuse d'écraser un fichier existant, d'où le nom daté côté appelant.
      await db.execute(`VACUUM INTO '${filePath.replace(/'/g, "''")}'`)
    },
  }
}
