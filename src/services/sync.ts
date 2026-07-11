/**
 * Sync layer: Dexie (local cache) ↔ Supabase (cloud source of truth)
 *
 * Strategy:
 *  - All reads come from Dexie (reactive via useLiveQuery)
 *  - All writes go to Dexie immediately + Supabase async
 *  - On login: pull all user data from Supabase → replace local Dexie data
 *  - On logout: clear Dexie (keep only local/unseeded data if needed)
 */

import { supabase, isSupabaseConfigured } from '../lib/supabase'
import { db } from '../db/db'
import type { Account, Tag, Transaction, Recurring, Preset, UserSettings, SavingsPlan, SavingsCashFlow, ScheduledPayment, WeightEntry, FoodEntry, ExerciseEntry, WaterLog, HealthSettings } from '../types'

// ─── Pull: Supabase → Dexie ──────────────────────────────────────────────────

// Dedupe concurrent pulls for the same user (e.g. App-level + Dashboard-level)
// so a stale snapshot can't overwrite fresher local writes.
let inflightPull: { userId: string; promise: Promise<void> } | null = null

// Users already pulled this session. Re-pulling on every Dashboard mount is
// dangerous: right after adding a transaction (cloud push still in-flight),
// a pull would fetch a stale snapshot and wipe the new record locally.
const pulledThisSession = new Set<string>()

export function pullFromCloud(userId: string): Promise<void> {
  if (inflightPull?.userId === userId) return inflightPull.promise
  const promise = doPullFromCloud(userId)
    .then(() => { pulledThisSession.add(userId) })
    .finally(() => {
      if (inflightPull?.promise === promise) inflightPull = null
    })
  inflightPull = { userId, promise }
  return promise
}

// Pull only if this user hasn't been pulled yet this session (login/cold start).
export function pullFromCloudOnce(userId: string): Promise<void> {
  if (pulledThisSession.has(userId)) return Promise.resolve()
  return pullFromCloud(userId)
}

// Forget the session pull state (call on sign-out so re-login re-pulls)
export function invalidatePullCache(userId: string) {
  pulledThisSession.delete(userId)
}

async function doPullFromCloud(userId: string): Promise<void> {
  if (!isSupabaseConfigured) return

  const [accRes, tagRes, txnRes, recRes, settingsRes, presetsRes, plansRes, cashFlowsRes, scheduledRes, weightRes, foodRes, exerciseRes, waterRes, healthRes] = await Promise.all([
    supabase.from('accounts').select('*').eq('user_id', userId),
    supabase.from('tags').select('*').eq('user_id', userId),
    supabase.from('transactions').select('*').eq('user_id', userId),
    supabase.from('recurring').select('*').eq('user_id', userId),
    supabase.from('user_settings').select('*').eq('user_id', userId).maybeSingle(),
    supabase.from('presets').select('*').eq('user_id', userId),
    supabase.from('savings_plans').select('*').eq('user_id', userId),
    supabase.from('savings_cash_flows').select('*').eq('user_id', userId),
    supabase.from('scheduled_payments').select('*').eq('user_id', userId),
    supabase.from('weight_entries').select('*').eq('user_id', userId),
    supabase.from('food_entries').select('*').eq('user_id', userId),
    supabase.from('exercise_entries').select('*').eq('user_id', userId),
    supabase.from('water_logs').select('*').eq('user_id', userId),
    supabase.from('health_settings').select('*').eq('user_id', userId).maybeSingle(),
  ])

  // ALL queries must succeed before we destructively replace local data —
  // a partial failure would otherwise silently wipe local tables.
  const firstError = [accRes, tagRes, txnRes, recRes, settingsRes, presetsRes, plansRes, cashFlowsRes, scheduledRes, weightRes, foodRes, exerciseRes, waterRes, healthRes]
    .map((r) => r.error)
    .find(Boolean)
  if (firstError) throw new Error(firstError.message)

  await db.transaction('rw', [db.accounts, db.tags, db.transactions, db.recurring, db.userSettings, db.presets, db.savingsPlans, db.savingsCashFlows, db.scheduledPayments, db.weightEntries, db.foodEntries, db.exerciseEntries, db.waterLogs, db.healthSettings], async () => {
    // Clear existing cloud-user data
    await db.accounts.where('userId').equals(userId).delete()
    await db.tags.where('userId').equals(userId).delete()
    await db.transactions.where('userId').equals(userId).delete()
    await db.recurring.where('userId').equals(userId).delete()
    await db.presets.where('userId').equals(userId).delete()
    await db.savingsPlans.where('userId').equals(userId).delete()
    await db.savingsCashFlows.where('userId').equals(userId).delete()
    await db.scheduledPayments.where('userId').equals(userId).delete()
    await db.weightEntries.where('userId').equals(userId).delete()
    await db.foodEntries.where('userId').equals(userId).delete()
    await db.exerciseEntries.where('userId').equals(userId).delete()
    await db.waterLogs.where('userId').equals(userId).delete()
    await db.healthSettings.where('userId').equals(userId).delete()

    if (accRes.data?.length) {
      await db.accounts.bulkPut(accRes.data.map(rowToAccount))
    }
    if (tagRes.data?.length) {
      await db.tags.bulkPut(tagRes.data.map(rowToTag))
    }
    if (txnRes.data?.length) {
      await db.transactions.bulkPut(txnRes.data.map(rowToTransaction))
    }
    if (recRes.data?.length) {
      await db.recurring.bulkPut(recRes.data.map(rowToRecurring))
    }
    if (settingsRes.data) {
      await db.userSettings.put(rowToSettings(settingsRes.data as Record<string, unknown>))
    }
    if (presetsRes.data?.length) {
      await db.presets.bulkPut(presetsRes.data.map(rowToPreset))
    }
    if (plansRes.data?.length) {
      await db.savingsPlans.bulkPut(plansRes.data.map(rowToSavingsPlan))
    }
    if (cashFlowsRes.data?.length) {
      await db.savingsCashFlows.bulkPut(cashFlowsRes.data.map(rowToSavingsCashFlow))
    }
    if (scheduledRes.data?.length) {
      await db.scheduledPayments.bulkPut(scheduledRes.data.map(rowToScheduledPayment))
    }
    if (weightRes.data?.length) {
      await db.weightEntries.bulkPut(weightRes.data.map(rowToWeightEntry))
    }
    if (foodRes.data?.length) {
      await db.foodEntries.bulkPut(foodRes.data.map(rowToFoodEntry))
    }
    if (exerciseRes.data?.length) {
      await db.exerciseEntries.bulkPut(exerciseRes.data.map(rowToExerciseEntry))
    }
    if (waterRes.data?.length) {
      await db.waterLogs.bulkPut(waterRes.data.map(rowToWaterLog))
    }
    if (healthRes.data) {
      await db.healthSettings.put(rowToHealthSettings(healthRes.data as Record<string, unknown>))
    }
  })

  // If brand new user, seed default accounts + tags
  const accCount = await db.accounts.where('userId').equals(userId).count()
  if (accCount === 0) {
    await seedCloudDefaults(userId)
  }
}

// ─── Push: Dexie → Supabase (single record) ──────────────────────────────────

// supabase-js returns errors instead of throwing — surface them so callers'
// .catch(console.error) actually sees failed syncs.
function throwIfError({ error }: { error: { message: string } | null }) {
  if (error) throw new Error(error.message)
}

export async function pushAccount(a: Account) {
  if (!isSupabaseConfigured) return
  throwIfError(await supabase.from('accounts').upsert(accountToRow(a)))
}

export async function deleteCloudAccount(id: string) {
  if (!isSupabaseConfigured) return
  throwIfError(await supabase.from('accounts').delete().eq('id', id))
}

export async function pushTag(t: Tag) {
  if (!isSupabaseConfigured) return
  throwIfError(await supabase.from('tags').upsert(tagToRow(t)))
}

export async function deleteCloudTag(id: string) {
  if (!isSupabaseConfigured) return
  throwIfError(await supabase.from('tags').delete().eq('id', id))
}

export async function pushTransaction(t: Transaction) {
  if (!isSupabaseConfigured) return
  throwIfError(await supabase.from('transactions').upsert(transactionToRow(t)))
}

export async function deleteCloudTransaction(id: string) {
  if (!isSupabaseConfigured) return
  throwIfError(await supabase.from('transactions').delete().eq('id', id))
}

export async function pushRecurring(r: Recurring) {
  if (!isSupabaseConfigured) return
  throwIfError(await supabase.from('recurring').upsert(recurringToRow(r)))
}

export async function deleteCloudRecurring(id: string) {
  if (!isSupabaseConfigured) return
  throwIfError(await supabase.from('recurring').delete().eq('id', id))
}

export async function pushUserSettings(s: UserSettings) {
  if (!isSupabaseConfigured) return
  throwIfError(await supabase.from('user_settings').upsert(settingsToRow(s)))
}

export async function pushPreset(p: Preset) {
  if (!isSupabaseConfigured) return
  throwIfError(await supabase.from('presets').upsert(presetToRow(p)))
}

export async function deleteCloudPreset(id: string) {
  if (!isSupabaseConfigured) return
  throwIfError(await supabase.from('presets').delete().eq('id', id))
}

export async function pushSavingsPlan(p: SavingsPlan) {
  if (!isSupabaseConfigured) return
  throwIfError(await supabase.from('savings_plans').upsert(savingsPlanToRow(p)))
}

export async function deleteCloudSavingsPlan(id: string) {
  if (!isSupabaseConfigured) return
  throwIfError(await supabase.from('savings_plans').delete().eq('id', id))
}

export async function pushSavingsCashFlow(c: SavingsCashFlow) {
  if (!isSupabaseConfigured) return
  throwIfError(await supabase.from('savings_cash_flows').upsert(savingsCashFlowToRow(c)))
}

export async function deleteCloudSavingsCashFlow(id: string) {
  if (!isSupabaseConfigured) return
  throwIfError(await supabase.from('savings_cash_flows').delete().eq('id', id))
}

export async function pushScheduledPayment(p: ScheduledPayment) {
  if (!isSupabaseConfigured) return
  throwIfError(await supabase.from('scheduled_payments').upsert(scheduledPaymentToRow(p)))
}

export async function deleteCloudScheduledPayment(id: string) {
  if (!isSupabaseConfigured) return
  throwIfError(await supabase.from('scheduled_payments').delete().eq('id', id))
}

export async function pushWeightEntry(w: WeightEntry) {
  if (!isSupabaseConfigured) return
  throwIfError(await supabase.from('weight_entries').upsert(weightEntryToRow(w)))
}

export async function deleteCloudWeightEntry(id: string) {
  if (!isSupabaseConfigured) return
  throwIfError(await supabase.from('weight_entries').delete().eq('id', id))
}

export async function pushFoodEntry(f: FoodEntry) {
  if (!isSupabaseConfigured) return
  throwIfError(await supabase.from('food_entries').upsert(foodEntryToRow(f)))
}

export async function deleteCloudFoodEntry(id: string) {
  if (!isSupabaseConfigured) return
  throwIfError(await supabase.from('food_entries').delete().eq('id', id))
}

export async function pushExerciseEntry(e: ExerciseEntry) {
  if (!isSupabaseConfigured) return
  throwIfError(await supabase.from('exercise_entries').upsert(exerciseEntryToRow(e)))
}

export async function deleteCloudExerciseEntry(id: string) {
  if (!isSupabaseConfigured) return
  throwIfError(await supabase.from('exercise_entries').delete().eq('id', id))
}

export async function pushWaterLog(w: WaterLog) {
  if (!isSupabaseConfigured) return
  throwIfError(await supabase.from('water_logs').upsert(waterLogToRow(w)))
}

export async function pushHealthSettings(s: HealthSettings) {
  if (!isSupabaseConfigured) return
  throwIfError(await supabase.from('health_settings').upsert(healthSettingsToRow(s)))
}

// ─── Bulk: used by import ────────────────────────────────────────────────────

// Delete ALL cloud data for a user (overwrite-import). Accounts cascade to
// transactions/recurring/presets/scheduled_payments, but delete explicitly
// anyway so nothing survives if cascades change.
export async function deleteAllCloudData(userId: string) {
  if (!isSupabaseConfigured) return
  // children first to avoid FK violations
  for (const table of ['transactions', 'recurring', 'presets', 'scheduled_payments', 'savings_cash_flows', 'savings_plans', 'tags', 'accounts', 'weight_entries', 'food_entries', 'exercise_entries', 'water_logs', 'health_settings'] as const) {
    throwIfError(await supabase.from(table).delete().eq('user_id', userId))
  }
}

// Push every local record of this user to the cloud (after import).
export async function pushAllUserData(userId: string) {
  if (!isSupabaseConfigured) return
  const [accounts, tags, transactions, recurring, presets, savingsPlans, savingsCashFlows, scheduledPayments, settings, weightEntries, foodEntries, exerciseEntries, waterLogs, healthSettings] =
    await Promise.all([
      db.accounts.where('userId').equals(userId).toArray(),
      db.tags.where('userId').equals(userId).toArray(),
      db.transactions.where('userId').equals(userId).toArray(),
      db.recurring.where('userId').equals(userId).toArray(),
      db.presets.where('userId').equals(userId).toArray(),
      db.savingsPlans.where('userId').equals(userId).toArray(),
      db.savingsCashFlows.where('userId').equals(userId).toArray(),
      db.scheduledPayments.where('userId').equals(userId).toArray(),
      db.userSettings.get(userId),
      db.weightEntries.where('userId').equals(userId).toArray(),
      db.foodEntries.where('userId').equals(userId).toArray(),
      db.exerciseEntries.where('userId').equals(userId).toArray(),
      db.waterLogs.where('userId').equals(userId).toArray(),
      db.healthSettings.get(userId),
    ])
  // parents first so FK references resolve
  if (accounts.length) throwIfError(await supabase.from('accounts').upsert(accounts.map(accountToRow)))
  if (tags.length) throwIfError(await supabase.from('tags').upsert(tags.map(tagToRow)))
  if (transactions.length) throwIfError(await supabase.from('transactions').upsert(transactions.map(transactionToRow)))
  if (recurring.length) throwIfError(await supabase.from('recurring').upsert(recurring.map(recurringToRow)))
  if (presets.length) throwIfError(await supabase.from('presets').upsert(presets.map(presetToRow)))
  if (savingsPlans.length) throwIfError(await supabase.from('savings_plans').upsert(savingsPlans.map(savingsPlanToRow)))
  if (savingsCashFlows.length) throwIfError(await supabase.from('savings_cash_flows').upsert(savingsCashFlows.map(savingsCashFlowToRow)))
  if (scheduledPayments.length) throwIfError(await supabase.from('scheduled_payments').upsert(scheduledPayments.map(scheduledPaymentToRow)))
  if (settings) throwIfError(await supabase.from('user_settings').upsert(settingsToRow(settings)))
  if (weightEntries.length) throwIfError(await supabase.from('weight_entries').upsert(weightEntries.map(weightEntryToRow)))
  if (foodEntries.length) throwIfError(await supabase.from('food_entries').upsert(foodEntries.map(foodEntryToRow)))
  if (exerciseEntries.length) throwIfError(await supabase.from('exercise_entries').upsert(exerciseEntries.map(exerciseEntryToRow)))
  if (waterLogs.length) throwIfError(await supabase.from('water_logs').upsert(waterLogs.map(waterLogToRow)))
  if (healthSettings) throwIfError(await supabase.from('health_settings').upsert(healthSettingsToRow(healthSettings)))
}

// ─── Seed defaults for new cloud users ───────────────────────────────────────

async function seedCloudDefaults(userId: string) {
  const accounts: Account[] = [
    { id: crypto.randomUUID(), userId, name: 'เงินสด', type: 'cash', color: '#f59e0b', icon: '💵', createdAt: new Date() },
    { id: crypto.randomUUID(), userId, name: 'บัญชีธนาคาร', type: 'bank', color: '#6366f1', icon: '🏦', createdAt: new Date() },
  ]
  const tags: Tag[] = [
    { id: crypto.randomUUID(), userId, name: 'อาหาร', color: '#f97316', icon: '🍜', type: 'expense' },
    { id: crypto.randomUUID(), userId, name: 'ค่าเดินทาง', color: '#3b82f6', icon: '🚌', type: 'expense' },
    { id: crypto.randomUUID(), userId, name: 'ช้อปปิ้ง', color: '#ec4899', icon: '🛍️', type: 'expense' },
    { id: crypto.randomUUID(), userId, name: 'บันเทิง', color: '#8b5cf6', icon: '🎮', type: 'expense' },
    { id: crypto.randomUUID(), userId, name: 'สุขภาพ', color: '#10b981', icon: '🏥', type: 'expense' },
    { id: crypto.randomUUID(), userId, name: 'เงินเดือน', color: '#22c55e', icon: '💼', type: 'income' },
    { id: crypto.randomUUID(), userId, name: 'รายได้อื่น', color: '#14b8a6', icon: '💰', type: 'income' },
    { id: crypto.randomUUID(), userId, name: 'ค่าสาธารณูปโภค', color: '#64748b', icon: '💡', type: 'expense' },
  ]
  await db.accounts.bulkAdd(accounts)
  await db.tags.bulkAdd(tags)
  await Promise.all([
    ...accounts.map(pushAccount),
    ...tags.map(pushTag),
  ])
}

// ─── Row mappers (snake_case Supabase ↔ camelCase app) ───────────────────────

function accountToRow(a: Account) {
  return {
    id: a.id, user_id: a.userId, name: a.name, type: a.type,
    color: a.color, icon: a.icon, created_at: a.createdAt.toISOString(),
    archived: a.archived ?? false,
  }
}

function rowToAccount(r: Record<string, unknown>): Account {
  return {
    id: r.id as string, userId: r.user_id as string, name: r.name as string,
    type: r.type as Account['type'], color: r.color as string, icon: r.icon as string,
    createdAt: new Date(r.created_at as string),
    archived: (r.archived as boolean | null) ?? undefined,
  }
}

function tagToRow(t: Tag) {
  return {
    id: t.id, user_id: t.userId, name: t.name, color: t.color, icon: t.icon, type: t.type,
    monthly_budget: t.monthlyBudget ?? null,
    daily_budget: t.dailyBudget ?? null,
  }
}

function rowToTag(r: Record<string, unknown>): Tag {
  return {
    id: r.id as string, userId: r.user_id as string, name: r.name as string,
    color: r.color as string, icon: r.icon as string, type: r.type as Tag['type'],
    monthlyBudget: (r.monthly_budget as number | null) ?? undefined,
    dailyBudget: (r.daily_budget as number | null) ?? undefined,
  }
}

function transactionToRow(t: Transaction) {
  return {
    id: t.id, user_id: t.userId, type: t.type, amount: t.amount,
    account_id: t.accountId, to_account_id: t.toAccountId ?? null,
    tag_id: t.tagId ?? null, note: t.note, date: t.date.toISOString(),
    is_recurring: t.isRecurring, recurring_id: t.recurringId ?? null,
    split_group_id: t.splitGroupId ?? null,
  }
}

function rowToTransaction(r: Record<string, unknown>): Transaction {
  return {
    id: r.id as string, userId: r.user_id as string, type: r.type as Transaction['type'],
    amount: r.amount as number, accountId: r.account_id as string,
    toAccountId: (r.to_account_id as string | null) ?? undefined,
    tagId: (r.tag_id as string | null) ?? undefined, note: r.note as string,
    date: new Date(r.date as string), isRecurring: r.is_recurring as boolean,
    recurringId: (r.recurring_id as string | null) ?? undefined,
    splitGroupId: (r.split_group_id as string | null) ?? undefined,
  }
}

function settingsToRow(s: UserSettings) {
  return {
    user_id: s.userId,
    discord_webhook: s.discordWebhook ?? null,
    daily_summary: s.dailySummary ?? false,
    weekly_summary: s.weeklySummary ?? false,
    last_daily_summary: s.lastDailySummary ?? null,
    last_weekly_summary: s.lastWeeklySummary ?? null,
    daily_allowance: s.dailyAllowance ?? null,
    allowance_rollover: s.allowanceRollover ?? false,
    allowance_reset_weekday: s.allowanceResetWeekday ?? null,
    groq_api_key: s.groqApiKey ?? null,
    groq_model: s.groqModel ?? null,
    monthly_advice: s.monthlyAdvice ?? false,
    last_monthly_advice: s.lastMonthlyAdvice ?? null,
  }
}

function rowToSettings(r: Record<string, unknown>): UserSettings {
  return {
    userId: r.user_id as string,
    discordWebhook: (r.discord_webhook as string | null) ?? undefined,
    dailySummary: (r.daily_summary as boolean | null) ?? undefined,
    weeklySummary: (r.weekly_summary as boolean | null) ?? undefined,
    lastDailySummary: (r.last_daily_summary as string | null) ?? undefined,
    lastWeeklySummary: (r.last_weekly_summary as string | null) ?? undefined,
    dailyAllowance: (r.daily_allowance as number | null) ?? undefined,
    allowanceRollover: (r.allowance_rollover as boolean | null) ?? undefined,
    allowanceResetWeekday: (r.allowance_reset_weekday as number | null) ?? undefined,
    groqApiKey: (r.groq_api_key as string | null) ?? undefined,
    groqModel: (r.groq_model as string | null) ?? undefined,
    monthlyAdvice: (r.monthly_advice as boolean | null) ?? undefined,
    lastMonthlyAdvice: (r.last_monthly_advice as string | null) ?? undefined,
  }
}

function presetToRow(p: Preset) {
  return {
    id: p.id, user_id: p.userId, name: p.name, type: p.type,
    amount: p.amount, account_id: p.accountId,
    to_account_id: p.toAccountId ?? null,
    tag_id: p.tagId ?? null, note: p.note,
  }
}

function rowToPreset(r: Record<string, unknown>): Preset {
  return {
    id: r.id as string, userId: r.user_id as string, name: r.name as string,
    type: r.type as Preset['type'], amount: r.amount as number,
    accountId: r.account_id as string,
    toAccountId: (r.to_account_id as string | null) ?? undefined,
    tagId: (r.tag_id as string | null) ?? undefined,
    note: r.note as string,
  }
}

function recurringToRow(rec: Recurring) {
  return {
    id: rec.id, user_id: rec.userId, name: rec.name, type: rec.type,
    amount: rec.amount, account_id: rec.accountId, tag_id: rec.tagId ?? null,
    frequency: rec.frequency, start_date: rec.startDate.toISOString(),
    end_date: rec.endDate?.toISOString() ?? null,
    next_due_date: rec.nextDueDate.toISOString(), is_active: rec.isActive,
  }
}

function rowToRecurring(r: Record<string, unknown>): Recurring {
  return {
    id: r.id as string, userId: r.user_id as string, name: r.name as string,
    type: r.type as Recurring['type'], amount: r.amount as number,
    accountId: r.account_id as string, tagId: (r.tag_id as string | null) ?? undefined,
    frequency: r.frequency as Recurring['frequency'],
    startDate: new Date(r.start_date as string),
    endDate: r.end_date ? new Date(r.end_date as string) : undefined,
    nextDueDate: new Date(r.next_due_date as string), isActive: r.is_active as boolean,
  }
}

function savingsPlanToRow(p: SavingsPlan) {
  return {
    id: p.id, user_id: p.userId, name: p.name,
    target_amount: p.targetAmount, target_date: p.targetDate.toISOString(),
    initial_amount: p.initialAmount, note: p.note ?? null,
    linked_account_id: p.linkedAccountId ?? null,
  }
}

function rowToSavingsPlan(r: Record<string, unknown>): SavingsPlan {
  return {
    id: r.id as string, userId: r.user_id as string, name: r.name as string,
    targetAmount: r.target_amount as number, targetDate: new Date(r.target_date as string),
    initialAmount: r.initial_amount as number, note: (r.note as string | null) ?? undefined,
    linkedAccountId: (r.linked_account_id as string | null) ?? undefined,
  }
}

function savingsCashFlowToRow(c: SavingsCashFlow) {
  return {
    id: c.id, user_id: c.userId, plan_id: c.planId, name: c.name,
    type: c.type, amount: c.amount, frequency: c.frequency, count_weekends: c.countWeekends,
  }
}

function rowToSavingsCashFlow(r: Record<string, unknown>): SavingsCashFlow {
  return {
    id: r.id as string, userId: r.user_id as string, planId: r.plan_id as string,
    name: r.name as string, type: r.type as SavingsCashFlow['type'],
    amount: r.amount as number, frequency: r.frequency as SavingsCashFlow['frequency'],
    countWeekends: r.count_weekends as boolean,
  }
}

function scheduledPaymentToRow(p: ScheduledPayment) {
  return {
    id: p.id, user_id: p.userId, type: p.type, amount: p.amount,
    account_id: p.accountId, tag_id: p.tagId ?? null, note: p.note,
    due_date: p.dueDate.toISOString(), is_active: p.isActive,
    executed_at: p.executedAt?.toISOString() ?? null,
    transaction_id: p.transactionId ?? null,
    reminded_at: p.remindedAt?.toISOString() ?? null,
  }
}

function rowToScheduledPayment(r: Record<string, unknown>): ScheduledPayment {
  return {
    id: r.id as string, userId: r.user_id as string, type: r.type as ScheduledPayment['type'],
    amount: r.amount as number, accountId: r.account_id as string,
    tagId: (r.tag_id as string | null) ?? undefined, note: r.note as string,
    dueDate: new Date(r.due_date as string), isActive: r.is_active as boolean,
    executedAt: r.executed_at ? new Date(r.executed_at as string) : undefined,
    transactionId: (r.transaction_id as string | null) ?? undefined,
    remindedAt: r.reminded_at ? new Date(r.reminded_at as string) : undefined,
  }
}

function weightEntryToRow(w: WeightEntry) {
  return { id: w.id, user_id: w.userId, date: w.date, weight: w.weight, note: w.note ?? null }
}

function rowToWeightEntry(r: Record<string, unknown>): WeightEntry {
  return {
    id: r.id as string, userId: r.user_id as string, date: r.date as string,
    weight: r.weight as number, note: (r.note as string | null) ?? undefined,
  }
}

function foodEntryToRow(f: FoodEntry) {
  return {
    id: f.id, user_id: f.userId, date: f.date, meal: f.meal, name: f.name,
    kcal: f.kcal, protein: f.protein ?? null, carbs: f.carbs ?? null, fat: f.fat ?? null,
    ai_estimated: f.aiEstimated ?? false, created_at: f.createdAt.toISOString(),
  }
}

function rowToFoodEntry(r: Record<string, unknown>): FoodEntry {
  return {
    id: r.id as string, userId: r.user_id as string, date: r.date as string,
    meal: r.meal as FoodEntry['meal'], name: r.name as string, kcal: r.kcal as number,
    protein: (r.protein as number | null) ?? undefined,
    carbs: (r.carbs as number | null) ?? undefined,
    fat: (r.fat as number | null) ?? undefined,
    aiEstimated: (r.ai_estimated as boolean | null) ?? undefined,
    createdAt: new Date(r.created_at as string),
  }
}

function exerciseEntryToRow(e: ExerciseEntry) {
  return {
    id: e.id, user_id: e.userId, date: e.date, name: e.name,
    minutes: e.minutes ?? null, kcal_burned: e.kcalBurned, created_at: e.createdAt.toISOString(),
  }
}

function rowToExerciseEntry(r: Record<string, unknown>): ExerciseEntry {
  return {
    id: r.id as string, userId: r.user_id as string, date: r.date as string,
    name: r.name as string, minutes: (r.minutes as number | null) ?? undefined,
    kcalBurned: r.kcal_burned as number, createdAt: new Date(r.created_at as string),
  }
}

function waterLogToRow(w: WaterLog) {
  return { id: w.id, user_id: w.userId, date: w.date, glasses: w.glasses }
}

function rowToWaterLog(r: Record<string, unknown>): WaterLog {
  return {
    id: r.id as string, userId: r.user_id as string,
    date: r.date as string, glasses: r.glasses as number,
  }
}

function healthSettingsToRow(s: HealthSettings) {
  return {
    user_id: s.userId,
    daily_kcal_limit: s.dailyKcalLimit ?? null,
    target_weight: s.targetWeight ?? null,
    start_weight: s.startWeight ?? null,
    height_cm: s.heightCm ?? null,
    birth_year: s.birthYear ?? null,
    gender: s.gender ?? null,
    activity_level: s.activityLevel ?? null,
    water_goal: s.waterGoal ?? null,
    protein_goal: s.proteinGoal ?? null,
    carbs_goal: s.carbsGoal ?? null,
    fat_goal: s.fatGoal ?? null,
    count_exercise: s.countExercise ?? true,
  }
}

function rowToHealthSettings(r: Record<string, unknown>): HealthSettings {
  return {
    userId: r.user_id as string,
    dailyKcalLimit: (r.daily_kcal_limit as number | null) ?? undefined,
    targetWeight: (r.target_weight as number | null) ?? undefined,
    startWeight: (r.start_weight as number | null) ?? undefined,
    heightCm: (r.height_cm as number | null) ?? undefined,
    birthYear: (r.birth_year as number | null) ?? undefined,
    gender: (r.gender as HealthSettings['gender'] | null) ?? undefined,
    activityLevel: (r.activity_level as HealthSettings['activityLevel'] | null) ?? undefined,
    waterGoal: (r.water_goal as number | null) ?? undefined,
    proteinGoal: (r.protein_goal as number | null) ?? undefined,
    carbsGoal: (r.carbs_goal as number | null) ?? undefined,
    fatGoal: (r.fat_goal as number | null) ?? undefined,
    countExercise: (r.count_exercise as boolean | null) ?? undefined,
  }
}
