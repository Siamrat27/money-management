import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import type { Tag } from '../types'

export function useTags() {
  return useLiveQuery(() => db.tags.toArray(), []) ?? []
}

export async function addTag(data: Omit<Tag, 'id'>) {
  return db.tags.add(data)
}

export async function updateTag(id: number, data: Partial<Tag>) {
  return db.tags.update(id, data)
}

export async function deleteTag(id: number) {
  return db.tags.delete(id)
}
