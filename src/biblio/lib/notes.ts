// Note perso d'un bloc.

import { getDb } from './db.ts'

export async function loadNote(blockId: string): Promise<string> {
  const d = await getDb()
  const [row] = await d.select<{ note: string }[]>('SELECT note FROM lib_blocks WHERE id = $1', [blockId])
  return row?.note ?? ''
}

export async function saveNote(blockId: string, note: string) {
  const d = await getDb()
  await d.execute('UPDATE lib_blocks SET note = $1 WHERE id = $2', [note, blockId])
}
