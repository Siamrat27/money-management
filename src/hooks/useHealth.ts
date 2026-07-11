import { useLiveQuery } from 'dexie-react-hooks'
import { db, LOCAL_USER_ID } from '../db/db'
import { useAuthStore } from '../stores/useAuthStore'
import {
  pushWeightEntry, deleteCloudWeightEntry,
  pushFoodEntry, deleteCloudFoodEntry,
  pushExerciseEntry, deleteCloudExerciseEntry,
  pushWaterLog, pushHealthSettings,
} from '../services/sync'
import type { WeightEntry, FoodEntry, ExerciseEntry, WaterLog, HealthSettings, MealType } from '../types'

function currentUserId(): string {
  return useAuthStore.getState().user?.id ?? LOCAL_USER_ID
}

function useUserId(): string {
  return useAuthStore((s) => s.user?.id ?? LOCAL_USER_ID)
}

// ─── Weight ───────────────────────────────────────────────────────────────────

// All weight entries sorted by date ascending
export function useWeightEntries(): WeightEntry[] {
  const userId = useUserId()
  return useLiveQuery(
    () => db.weightEntries.where('userId').equals(userId).sortBy('date'),
    [userId]
  ) ?? []
}

// One entry per day: update the existing row for that date, else insert
export async function saveWeight(date: string, weight: number, note?: string) {
  const userId = currentUserId()
  const existing = await db.weightEntries.where('[userId+date]').equals([userId, date]).first()
  const record: WeightEntry = existing
    ? { ...existing, weight, note: note ?? existing.note }
    : { id: crypto.randomUUID(), userId, date, weight, note }
  await db.weightEntries.put(record)
  pushWeightEntry(record).catch(console.error)
}

export async function deleteWeight(id: string) {
  await db.weightEntries.delete(id)
  deleteCloudWeightEntry(id).catch(console.error)
}

// ─── Food ─────────────────────────────────────────────────────────────────────

export function useFoodEntriesByDate(date: string): FoodEntry[] {
  const userId = useUserId()
  return useLiveQuery(
    () => db.foodEntries.where('[userId+date]').equals([userId, date]).sortBy('createdAt'),
    [userId, date]
  ) ?? []
}

// from/to inclusive yyyy-MM-dd (string compare works for this format)
export function useFoodEntriesByRange(from: string, to: string): FoodEntry[] {
  const userId = useUserId()
  return useLiveQuery(
    () => db.foodEntries
      .where('userId').equals(userId)
      .filter((f) => f.date >= from && f.date <= to)
      .toArray(),
    [userId, from, to]
  ) ?? []
}

export async function addFoodEntry(data: Omit<FoodEntry, 'id' | 'userId' | 'createdAt'>) {
  const record: FoodEntry = { ...data, id: crypto.randomUUID(), userId: currentUserId(), createdAt: new Date() }
  await db.foodEntries.add(record)
  pushFoodEntry(record).catch(console.error)
  return record.id
}

export async function updateFoodEntry(id: string, data: Partial<FoodEntry>) {
  await db.foodEntries.update(id, data)
  const updated = await db.foodEntries.get(id)
  if (updated) pushFoodEntry(updated).catch(console.error)
}

export async function deleteFoodEntry(id: string) {
  await db.foodEntries.delete(id)
  deleteCloudFoodEntry(id).catch(console.error)
}

// Put a previously deleted entry back (undo)
export async function restoreFoodEntry(f: FoodEntry) {
  await db.foodEntries.put(f)
  pushFoodEntry(f).catch(console.error)
}

export function sumKcal(entries: { kcal: number }[]): number {
  return entries.reduce((s, e) => s + e.kcal, 0)
}

export function groupByMeal(entries: FoodEntry[]): Record<MealType, FoodEntry[]> {
  const groups: Record<MealType, FoodEntry[]> = { breakfast: [], lunch: [], dinner: [], snack: [] }
  for (const e of entries) groups[e.meal].push(e)
  return groups
}

// ─── Exercise ─────────────────────────────────────────────────────────────────

export function useExercisesByDate(date: string): ExerciseEntry[] {
  const userId = useUserId()
  return useLiveQuery(
    () => db.exerciseEntries.where('[userId+date]').equals([userId, date]).sortBy('createdAt'),
    [userId, date]
  ) ?? []
}

export function useExercisesByRange(from: string, to: string): ExerciseEntry[] {
  const userId = useUserId()
  return useLiveQuery(
    () => db.exerciseEntries
      .where('userId').equals(userId)
      .filter((e) => e.date >= from && e.date <= to)
      .toArray(),
    [userId, from, to]
  ) ?? []
}

export async function addExercise(data: Omit<ExerciseEntry, 'id' | 'userId' | 'createdAt'>) {
  const record: ExerciseEntry = { ...data, id: crypto.randomUUID(), userId: currentUserId(), createdAt: new Date() }
  await db.exerciseEntries.add(record)
  pushExerciseEntry(record).catch(console.error)
}

export async function deleteExercise(id: string) {
  await db.exerciseEntries.delete(id)
  deleteCloudExerciseEntry(id).catch(console.error)
}

// ─── Water ────────────────────────────────────────────────────────────────────

export function useWaterByDate(date: string): WaterLog | undefined {
  const userId = useUserId()
  return useLiveQuery(
    () => db.waterLogs.where('[userId+date]').equals([userId, date]).first(),
    [userId, date]
  )
}

export async function setWaterGlasses(date: string, glasses: number) {
  const userId = currentUserId()
  const clamped = Math.max(0, glasses)
  const existing = await db.waterLogs.where('[userId+date]').equals([userId, date]).first()
  const record: WaterLog = existing
    ? { ...existing, glasses: clamped }
    : { id: crypto.randomUUID(), userId, date, glasses: clamped }
  await db.waterLogs.put(record)
  pushWaterLog(record).catch(console.error)
}

// ─── Health settings ──────────────────────────────────────────────────────────

export function useHealthSettings(): HealthSettings | undefined {
  const userId = useUserId()
  return useLiveQuery(() => db.healthSettings.get(userId), [userId])
}

export async function saveHealthSettings(patch: Partial<Omit<HealthSettings, 'userId'>>) {
  const userId = currentUserId()
  const existing = await db.healthSettings.get(userId)
  const updated: HealthSettings = { userId, ...existing, ...patch }
  await db.healthSettings.put(updated)
  pushHealthSettings(updated).catch(console.error)
}
