import { useLiveQuery } from 'dexie-react-hooks'
import { db, LOCAL_USER_ID } from '../db/db'
import { useAuthStore } from '../stores/useAuthStore'
import { pushPreset, deleteCloudPreset } from '../services/sync'
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
  const preset: Preset = { id: crypto.randomUUID(), userId, ...data }
  await db.presets.add(preset)
  await pushPreset(preset)
}

export async function updatePreset(id: string, data: Partial<Omit<Preset, 'id' | 'userId'>>) {
  await db.presets.update(id, data)
  const updated = await db.presets.get(id)
  if (updated) await pushPreset(updated)
}

export async function deletePreset(id: string) {
  await db.presets.delete(id)
  await deleteCloudPreset(id)
}

// Put a previously deleted preset back (undo)
export async function restorePreset(p: Preset) {
  await db.presets.put(p)
  pushPreset(p).catch(console.error)
}
