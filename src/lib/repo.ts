import { createLocalRepo } from './repo-local'
import { createSqlRepo } from './repo-sql'
import type { Repo } from './types'

export const isTauri = () => '__TAURI_INTERNALS__' in window

export function openRepo(): Promise<Repo> {
  return isTauri() ? createSqlRepo() : Promise.resolve(createLocalRepo())
}
