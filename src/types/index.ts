export type AccountType = 'cash' | 'bank' | 'savings' | 'other'
export type TagType = 'income' | 'expense' | 'both'
export type TransactionType = 'income' | 'expense' | 'transfer'
export type Frequency = 'daily' | 'weekly' | 'monthly' | 'yearly'

export interface Account {
  id?: number
  name: string
  type: AccountType
  color: string
  icon: string
  createdAt: Date
}

export interface Tag {
  id?: number
  name: string
  color: string
  icon: string
  type: TagType
}

export interface Transaction {
  id?: number
  type: TransactionType
  amount: number
  accountId: number
  toAccountId?: number
  tagId?: number
  note: string
  date: Date
  isRecurring: boolean
  recurringId?: number
}

export interface Recurring {
  id?: number
  name: string
  type: 'income' | 'expense'
  amount: number
  accountId: number
  tagId?: number
  frequency: Frequency
  startDate: Date
  endDate?: Date
  nextDueDate: Date
  isActive: boolean
}

export type Page = 'dashboard' | 'add' | 'calendar' | 'reports' | 'settings'
export type SubPage = 'transactions' | 'accounts' | 'recurring' | null
