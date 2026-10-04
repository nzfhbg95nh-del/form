import { isTauri } from './repo'

/** Envoie une notification Windows. Renvoie false si ce n'est pas possible (navigateur, permission refusée). */
export async function notify(title: string, body: string): Promise<boolean> {
  if (!isTauri()) return false
  const { isPermissionGranted, requestPermission, sendNotification } = await import('@tauri-apps/plugin-notification')
  let granted = await isPermissionGranted()
  if (!granted) granted = (await requestPermission()) === 'granted'
  if (!granted) return false
  sendNotification({ title, body })
  return true
}
