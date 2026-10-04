import type { Client, ObjectPatch, ObjectRow, Repo, Service } from './types'

/** Version « navigateur » : sert uniquement à tester l'interface sans l'app Windows. */
export function createLocalRepo(): Repo {
  const K = 'form-dev-objects'
  const S = 'form-dev-settings'
  const load = (): ObjectRow[] => JSON.parse(localStorage.getItem(K) ?? '[]')
  const save = (r: ObjectRow[]) => localStorage.setItem(K, JSON.stringify(r))
  const settings = (): Record<string, string> => JSON.parse(localStorage.getItem(S) ?? '{}')

  const table = <T extends { id: string }>(key: string) => ({
    list: (): T[] => JSON.parse(localStorage.getItem(key) ?? '[]'),
    upsert(row: T) {
      const rows = this.list()
      const i = rows.findIndex((r) => r.id === row.id)
      if (i >= 0) rows[i] = row
      else rows.push(row)
      localStorage.setItem(key, JSON.stringify(rows))
    },
  })
  const clients = table<Client>('form-dev-clients')
  const services = table<Service>('form-dev-services')

  return {
    async listClients() { return clients.list() },
    async saveClient(c: Client) { clients.upsert(c) },
    async listServices() { return services.list() },
    async saveService(s: Service) { services.upsert(s) },
    async listObjects() { return load() },
    async createPage(parentId: string | null = null, type = 'page', properties = '{}') {
      const t = new Date().toISOString()
      const row: ObjectRow = {
        id: crypto.randomUUID(), type, parent_id: parentId, title: '', icon: null,
        cover: null, properties, content: null, position: Date.now(), is_favorite: 0,
        created_at: t, updated_at: t, deleted_at: null,
      }
      save([...load(), row])
      return row
    },
    async updateObject(id: string, patch: ObjectPatch) {
      save(load().map((r) => (r.id === id ? { ...r, ...patch, updated_at: new Date().toISOString() } : r)))
    },
    async purgeObject(id: string) { save(load().filter((r) => r.id !== id)) },
    async getSetting(key: string) { return settings()[key] ?? null },
    async setSetting(key: string, value: string) {
      localStorage.setItem(S, JSON.stringify({ ...settings(), [key]: value }))
    },
    async backupTo() { throw new Error("La sauvegarde n'existe que dans l'app Windows.") },
  }
}
