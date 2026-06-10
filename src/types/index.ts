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
  monthlyBudget?: number
}

export interface Preset {
  id: string
  userId: string
  name: string
  type: TransactionType
  amount: number
  accountId: string
  toAccountId?: string
  tagId?: string
  note: string
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

export interface UserSettings {
  userId: string
  discordWebhook?: string
}

export interface SavingsPlan {
  id: string
  userId: string
  name: string
  targetAmount: number
  targetDate: Date
  initialAmount: number
  note?: string
}

export interface SavingsCashFlow {
  id: string
  userId: string
  planId: string
  name: string
  type: 'income' | 'expense'
  amount: number
  frequency: 'daily' | 'weekly' | 'monthly'
  countWeekends: boolean
}

export interface ScheduledPayment {
  id: string
  userId: string
  type: 'income' | 'expense'
  amount: number
  accountId: string
  tagId?: string
  note: string
  dueDate: Date
  isActive: boolean
  executedAt?: Date
  transactionId?: string
}

export type Page = 'dashboard' | 'add' | 'calendar' | 'reports' | 'settings'
export type SubPage = 'transactions' | 'accounts' | 'recurring' | 'savings-planner' | 'scheduled-payments' | 'budgets' | null
