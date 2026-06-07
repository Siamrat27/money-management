import { useLiveQuery } from 'dexie-react-hooks'
import { db, LOCAL_USER_ID } from '../db/db'
import { useAuthStore } from '../stores/useAuthStore'
import type { Preset } from '../types'

function currentUserId() {
  return useAuthStore.getState().user?.id ?? LOCAL_USER_ID
}

export function usePresets() {
  const userId = useAuthStore((s) => s.user?.id ?? LOCAL_USER_ID)
  return useLiveQuery(() => db.presets.where('userId').equals(userId).toArray(), [userId]) ?? []
}

export async function addPreset(data: Omit<Preset, 'id' | 'userId'>) {
  const userId = currentUserId()
  await db.presets.add({ id: crypto.randomUUID(), userId, ...data })
}

export async function deletePreset(id: string) {
  await db.presets.delete(id)
}
