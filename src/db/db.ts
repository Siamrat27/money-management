import Dexie, { type EntityTable } from 'dexie'
import type { Account, Tag, Transaction, Recurring, Preset } from '../types'

const db = new Dexie('PocketFlowDB') as Dexie & {
  accounts: EntityTable<Account, 'id'>
  tags: EntityTable<Tag, 'id'>
  transactions: EntityTable<Transaction, 'id'>
  recurring: EntityTable<Recurring, 'id'>
  presets: EntityTable<Preset, 'id'>
}

// Version 2: switched from auto-increment int to UUID string IDs, added userId
db.version(2).stores({
  accounts: 'id, userId, name, type, createdAt',
  tags: 'id, userId, name, type',
  transactions: 'id, userId, type, accountId, toAccountId, tagId, date, recurringId',
  recurring: 'id, userId, type, accountId, tagId, nextDueDate, isActive',
})

// Version 3: added presets table
db.version(3).stores({
  accounts: 'id, userId, name, type, createdAt',
  tags: 'id, userId, name, type',
  transactions: 'id, userId, type, accountId, toAccountId, tagId, date, recurringId',
  recurring: 'id, userId, type, accountId, tagId, nextDueDate, isActive',
  presets: 'id, userId, type, accountId',
})

export const LOCAL_USER_ID = 'local'

async function seedDefaults() {
  const count = await db.accounts.count()
  if (count > 0) return
  const uid = LOCAL_USER_ID
  await db.accounts.bulkAdd([
    { id: crypto.randomUUID(), userId: uid, name: 'เงินสด', type: 'cash', color: '#f59e0b', icon: '💵', createdAt: new Date() },
    { id: crypto.randomUUID(), userId: uid, name: 'บัญชีธนาคาร', type: 'bank', color: '#6366f1', icon: '🏦', createdAt: new Date() },
  ])
  await db.tags.bulkAdd([
    { id: crypto.randomUUID(), userId: uid, name: 'อาหาร', color: '#f97316', icon: '🍜', type: 'expense' },
    { id: crypto.randomUUID(), userId: uid, name: 'ค่าเดินทาง', color: '#3b82f6', icon: '🚌', type: 'expense' },
    { id: crypto.randomUUID(), userId: uid, name: 'ช้อปปิ้ง', color: '#ec4899', icon: '🛍️', type: 'expense' },
    { id: crypto.randomUUID(), userId: uid, name: 'บันเทิง', color: '#8b5cf6', icon: '🎮', type: 'expense' },
    { id: crypto.randomUUID(), userId: uid, name: 'สุขภาพ', color: '#10b981', icon: '🏥', type: 'expense' },
    { id: crypto.randomUUID(), userId: uid, name: 'เงินเดือน', color: '#22c55e', icon: '💼', type: 'income' },
    { id: crypto.randomUUID(), userId: uid, name: 'รายได้อื่น', color: '#14b8a6', icon: '💰', type: 'income' },
    { id: crypto.randomUUID(), userId: uid, name: 'ค่าสาธารณูปโภค', color: '#64748b', icon: '💡', type: 'expense' },
  ])
}

db.on('ready', seedDefaults)

export { db }
