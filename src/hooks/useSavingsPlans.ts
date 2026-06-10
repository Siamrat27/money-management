import { useLiveQuery } from 'dexie-react-hooks'
import { db, LOCAL_USER_ID } from '../db/db'
import { useAuthStore } from '../stores/useAuthStore'
import { pushSavingsPlan, pushSavingsCashFlow, deleteCloudSavingsPlan, deleteCloudSavingsCashFlow } from '../services/sync'
import { notifySavingsPlanCreated } from '../lib/discord'
import type { SavingsPlan, SavingsCashFlow } from '../types'

function currentUserId(): string {
  return useAuthStore.getState().user?.id ?? LOCAL_USER_ID
}

export function useSavingsPlans() {
  const userId = useAuthStore((s) => s.user?.id ?? LOCAL_USER_ID)
  return useLiveQuery(() => db.savingsPlans.where('userId').equals(userId).toArray(), [userId]) ?? []
}

export function useSavingsCashFlows(planId: string) {
  const userId = useAuthStore((s) => s.user?.id ?? LOCAL_USER_ID)
  return useLiveQuery(
    () => db.savingsCashFlows.where('planId').equals(planId).filter((c) => c.userId === userId).toArray(),
    [planId, userId]
  ) ?? []
}

export async function addSavingsPlan(data: Omit<SavingsPlan, 'id' | 'userId'>): Promise<string> {
  const record: SavingsPlan = { ...data, id: crypto.randomUUID(), userId: currentUserId() }
  await db.savingsPlans.add(record)
  pushSavingsPlan(record).catch(console.error)
  notifySavingsPlanCreated(record).catch(console.error)
  return record.id
}

export async function updateSavingsPlan(id: string, data: Partial<SavingsPlan>) {
  await db.savingsPlans.update(id, data)
  const updated = await db.savingsPlans.get(id)
  if (updated) pushSavingsPlan(updated).catch(console.error)
}

export interface SavingsPlanSnapshot {
  plan: SavingsPlan
  cashFlows: SavingsCashFlow[]
}

// Returns a snapshot of everything deleted so the caller can offer undo
export async function deleteSavingsPlan(id: string): Promise<SavingsPlanSnapshot | null> {
  const plan = await db.savingsPlans.get(id)
  if (!plan) return null
  const cashFlows = await db.savingsCashFlows.where('planId').equals(id).toArray()
  await db.savingsCashFlows.where('planId').equals(id).delete()
  await db.savingsPlans.delete(id)
  deleteCloudSavingsPlan(id).catch(console.error) // cloud cascades cash flows
  return { plan, cashFlows }
}

// Put a previously deleted plan (and its cash flows) back (undo)
export async function restoreSavingsPlan(snapshot: SavingsPlanSnapshot) {
  await db.savingsPlans.put(snapshot.plan)
  if (snapshot.cashFlows.length) await db.savingsCashFlows.bulkPut(snapshot.cashFlows)
  pushSavingsPlan(snapshot.plan).catch(console.error)
  for (const cf of snapshot.cashFlows) pushSavingsCashFlow(cf).catch(console.error)
}

export async function addSavingsCashFlow(data: Omit<SavingsCashFlow, 'id' | 'userId'>): Promise<string> {
  const record: SavingsCashFlow = { ...data, id: crypto.randomUUID(), userId: currentUserId() }
  await db.savingsCashFlows.add(record)
  pushSavingsCashFlow(record).catch(console.error)
  return record.id
}

export async function updateSavingsCashFlow(id: string, data: Partial<SavingsCashFlow>) {
  await db.savingsCashFlows.update(id, data)
  const updated = await db.savingsCashFlows.get(id)
  if (updated) pushSavingsCashFlow(updated).catch(console.error)
}

export async function deleteSavingsCashFlow(id: string) {
  await db.savingsCashFlows.delete(id)
  deleteCloudSavingsCashFlow(id).catch(console.error)
}

// Put a previously deleted cash flow back (undo)
export async function restoreSavingsCashFlow(cf: SavingsCashFlow) {
  await db.savingsCashFlows.put(cf)
  pushSavingsCashFlow(cf).catch(console.error)
}
