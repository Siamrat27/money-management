import { useLiveQuery } from 'dexie-react-hooks'
import { db, LOCAL_USER_ID } from '../db/db'
import { useAuthStore } from '../stores/useAuthStore'
import { pushUserSettings } from '../services/sync'
import type { UserSettings } from '../types'

function currentUserId(): string {
  return useAuthStore.getState().user?.id ?? LOCAL_USER_ID
}

export function useUserSettings(): UserSettings | undefined {
  const userId = useAuthStore((s) => s.user?.id ?? LOCAL_USER_ID)
  return useLiveQuery(() => db.userSettings.get(userId), [userId])
}

export async function saveUserSettings(patch: Partial<Omit<UserSettings, 'userId'>>) {
  const userId = currentUserId()
  const existing = await db.userSettings.get(userId)
  const updated: UserSettings = { userId, ...existing, ...patch }
  await db.userSettings.put(updated)
  pushUserSettings(updated).catch(console.error)
}
