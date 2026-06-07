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
import type { Account, Tag, Transaction, Recurring, UserSettings } from '../types'

// ─── Pull: Supabase → Dexie ──────────────────────────────────────────────────

export async function pullFromCloud(userId: string): Promise<void> {
  if (!isSupabaseConfigured) return

  const [accRes, tagRes, txnRes, recRes, settingsRes] = await Promise.all([
    supabase.from('accounts').select('*').eq('user_id', userId),
    supabase.from('tags').select('*').eq('user_id', userId),
    supabase.from('transactions').select('*').eq('user_id', userId),
    supabase.from('recurring').select('*').eq('user_id', userId),
    supabase.from('user_settings').select('*').eq('user_id', userId).maybeSingle(),
  ])

  if (accRes.error) throw new Error(accRes.error.message)

  await db.transaction('rw', [db.accounts, db.tags, db.transactions, db.recurring, db.userSettings], async () => {
    // Clear existing cloud-user data
    await db.accounts.where('userId').equals(userId).delete()
    await db.tags.where('userId').equals(userId).delete()
    await db.transactions.where('userId').equals(userId).delete()
    await db.recurring.where('userId').equals(userId).delete()

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
  })

  // If brand new user, seed default accounts + tags
  const accCount = await db.accounts.where('userId').equals(userId).count()
  if (accCount === 0) {
    await seedCloudDefaults(userId)
  }
}

// ─── Push: Dexie → Supabase (single record) ──────────────────────────────────

export async function pushAccount(a: Account) {
  if (!isSupabaseConfigured) return
  await supabase.from('accounts').upsert(accountToRow(a))
}

export async function deleteCloudAccount(id: string) {
  if (!isSupabaseConfigured) return
  await supabase.from('accounts').delete().eq('id', id)
}

export async function pushTag(t: Tag) {
  if (!isSupabaseConfigured) return
  await supabase.from('tags').upsert(tagToRow(t))
}

export async function deleteCloudTag(id: string) {
  if (!isSupabaseConfigured) return
  await supabase.from('tags').delete().eq('id', id)
}

export async function pushTransaction(t: Transaction) {
  if (!isSupabaseConfigured) return
  await supabase.from('transactions').upsert(transactionToRow(t))
}

export async function deleteCloudTransaction(id: string) {
  if (!isSupabaseConfigured) return
  await supabase.from('transactions').delete().eq('id', id)
}

export async function pushRecurring(r: Recurring) {
  if (!isSupabaseConfigured) return
  await supabase.from('recurring').upsert(recurringToRow(r))
}

export async function deleteCloudRecurring(id: string) {
  if (!isSupabaseConfigured) return
  await supabase.from('recurring').delete().eq('id', id)
}

export async function pushUserSettings(s: UserSettings) {
  if (!isSupabaseConfigured) return
  await supabase.from('user_settings').upsert(settingsToRow(s))
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
  }
}

function rowToAccount(r: Record<string, unknown>): Account {
  return {
    id: r.id as string, userId: r.user_id as string, name: r.name as string,
    type: r.type as Account['type'], color: r.color as string, icon: r.icon as string,
    createdAt: new Date(r.created_at as string),
  }
}

function tagToRow(t: Tag) {
  return {
    id: t.id, user_id: t.userId, name: t.name, color: t.color, icon: t.icon, type: t.type,
    monthly_budget: t.monthlyBudget ?? null,
  }
}

function rowToTag(r: Record<string, unknown>): Tag {
  return {
    id: r.id as string, userId: r.user_id as string, name: r.name as string,
    color: r.color as string, icon: r.icon as string, type: r.type as Tag['type'],
    monthlyBudget: (r.monthly_budget as number | null) ?? undefined,
  }
}

function transactionToRow(t: Transaction) {
  return {
    id: t.id, user_id: t.userId, type: t.type, amount: t.amount,
    account_id: t.accountId, to_account_id: t.toAccountId ?? null,
    tag_id: t.tagId ?? null, note: t.note, date: t.date.toISOString(),
    is_recurring: t.isRecurring, recurring_id: t.recurringId ?? null,
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
  }
}

function settingsToRow(s: UserSettings) {
  return { user_id: s.userId, discord_webhook: s.discordWebhook ?? null }
}

function rowToSettings(r: Record<string, unknown>): UserSettings {
  return {
    userId: r.user_id as string,
    discordWebhook: (r.discord_webhook as string | null) ?? undefined,
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
