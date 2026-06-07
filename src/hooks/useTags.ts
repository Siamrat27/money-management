import { useLiveQuery } from 'dexie-react-hooks'
import { db, LOCAL_USER_ID } from '../db/db'
import { useAuthStore } from '../stores/useAuthStore'
import { pushTag, deleteCloudTag } from '../services/sync'
import type { Tag } from '../types'

function currentUserId(): string {
  return useAuthStore.getState().user?.id ?? LOCAL_USER_ID
}

export function useTags() {
  const userId = useAuthStore((s) => s.user?.id ?? LOCAL_USER_ID)
  return useLiveQuery(() => db.tags.where('userId').equals(userId).toArray(), [userId]) ?? []
}

export async function addTag(data: Omit<Tag, 'id' | 'userId'>) {
  const record: Tag = { ...data, id: crypto.randomUUID(), userId: currentUserId() }
  await db.tags.add(record)
  pushTag(record).catch(console.error)
  return record.id
}

export async function updateTag(id: string, data: Partial<Tag>) {
  await db.tags.update(id, data)
  const updated = await db.tags.get(id)
  if (updated) pushTag(updated).catch(console.error)
}

export async function deleteTag(id: string) {
  await db.tags.delete(id)
  deleteCloudTag(id).catch(console.error)
}
