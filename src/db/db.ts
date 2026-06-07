import Dexie, { type EntityTable } from 'dexie'
import type { Account, Tag, Transaction, Recurring } from '../types'

const db = new Dexie('PocketFlowDB') as Dexie & {
  accounts: EntityTable<Account, 'id'>
  tags: EntityTable<Tag, 'id'>
  transactions: EntityTable<Transaction, 'id'>
  recurring: EntityTable<Recurring, 'id'>
}

db.version(1).stores({
  accounts: '++id, name, type, createdAt',
  tags: '++id, name, type',
  transactions: '++id, type, accountId, toAccountId, tagId, date, recurringId',
  recurring: '++id, type, accountId, tagId, nextDueDate, isActive',
})

db.on('ready', async () => {
  const count = await db.accounts.count()
  if (count === 0) {
    await db.accounts.bulkAdd([
      { name: 'เงินสด', type: 'cash', color: '#f59e0b', icon: '💵', createdAt: new Date() },
      { name: 'บัญชีธนาคาร', type: 'bank', color: '#6366f1', icon: '🏦', createdAt: new Date() },
    ])
    await db.tags.bulkAdd([
      { name: 'อาหาร', color: '#f97316', icon: '🍜', type: 'expense' },
      { name: 'ค่าเดินทาง', color: '#3b82f6', icon: '🚌', type: 'expense' },
      { name: 'ช้อปปิ้ง', color: '#ec4899', icon: '🛍️', type: 'expense' },
      { name: 'บันเทิง', color: '#8b5cf6', icon: '🎮', type: 'expense' },
      { name: 'สุขภาพ', color: '#10b981', icon: '🏥', type: 'expense' },
      { name: 'เงินเดือน', color: '#22c55e', icon: '💼', type: 'income' },
      { name: 'รายได้อื่น', color: '#14b8a6', icon: '💰', type: 'income' },
      { name: 'ค่าสาธารณูปโภค', color: '#64748b', icon: '💡', type: 'expense' },
    ])
  }
})

export { db }
