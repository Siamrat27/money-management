export type AccountType = 'cash' | 'bank' | 'savings' | 'other'
export type TagType = 'income' | 'expense' | 'both'
export type TransactionType = 'income' | 'expense' | 'transfer'
export type Frequency = 'daily' | 'weekly' | 'monthly' | 'yearly'

export interface Account {
  id: string
  userId: string
  name: string
  type: AccountType
  color: string
  icon: string
  createdAt: Date
}

export interface Tag {
  id: string
  userId: string
  name: string
  color: string
  icon: string
  type: TagType
}

export interface Transaction {
  id: string
  userId: string
  type: TransactionType
  amount: number
  accountId: string
  toAccountId?: string
  tagId?: string
  note: string
  date: Date
  isRecurring: boolean
  recurringId?: string
}

export interface Recurring {
  id: string
  userId: string
  name: string
  type: 'income' | 'expense'
  amount: number
  accountId: string
  tagId?: string
  frequency: Frequency
  startDate: Date
  endDate?: Date
  nextDueDate: Date
  isActive: boolean
}

export type Page = 'dashboard' | 'add' | 'calendar' | 'reports' | 'settings'
export type SubPage = 'transactions' | 'accounts' | 'recurring' | null
