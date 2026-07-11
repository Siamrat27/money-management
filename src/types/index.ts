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
  archived?: boolean // hidden from totals & pickers; history preserved
}

export interface Tag {
  id: string
  userId: string
  name: string
  color: string
  icon: string
  type: TagType
  monthlyBudget?: number
  dailyBudget?: number // daily spending allowance for this category
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
  splitGroupId?: string // shared by transactions that were entered as one split
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
  dailySummary?: boolean       // send yesterday's summary on first open of a new day
  weeklySummary?: boolean      // send last week's summary on first open of a new week
  lastDailySummary?: string    // yyyy-MM-dd key of the last day summary sent
  lastWeeklySummary?: string   // yyyy-MM-dd key (week start) of the last week summary sent
  dailyAllowance?: number      // overall daily spending allowance (total)
  allowanceRollover?: boolean  // unused allowance carries forward within the period
  allowanceResetWeekday?: number // 0=Sun..6=Sat — day the rollover period restarts
  groqApiKey?: string          // user's own Groq API key for AI quick-add
  groqModel?: string           // selected Groq model id
  monthlyAdvice?: boolean      // AI monthly summary + advice to Discord
  lastMonthlyAdvice?: string   // yyyy-MM key of the last monthly advice sent
}

export interface SavingsPlan {
  id: string
  userId: string
  name: string
  targetAmount: number
  targetDate: Date
  initialAmount: number
  note?: string
  linkedAccountId?: string // if set, current balance comes from this real account
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
  remindedAt?: Date // when the "due soon" Discord reminder was sent
}

// ─── Health app (FitFlow: weight & diet tracking) ────────────────────────────

export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack'
export type Gender = 'male' | 'female'
export type ActivityLevel = 'sedentary' | 'light' | 'moderate' | 'active' | 'veryActive'

export interface WeightEntry {
  id: string
  userId: string
  date: string // yyyy-MM-dd — one entry per day (upsert by date)
  weight: number // kg
  note?: string
}

export interface FoodEntry {
  id: string
  userId: string
  date: string // yyyy-MM-dd
  meal: MealType
  name: string
  kcal: number
  protein?: number // grams
  carbs?: number
  fat?: number
  aiEstimated?: boolean // kcal came from LLM estimation
  createdAt: Date
}

export interface ExerciseEntry {
  id: string
  userId: string
  date: string // yyyy-MM-dd
  name: string
  minutes?: number
  kcalBurned: number
  createdAt: Date
}

export interface WaterLog {
  id: string
  userId: string
  date: string // yyyy-MM-dd — one row per day
  glasses: number
}

export interface HealthSettings {
  userId: string
  dailyKcalLimit?: number
  targetWeight?: number
  startWeight?: number // baseline for progress; defaults to first logged weight
  heightCm?: number
  birthYear?: number
  gender?: Gender
  activityLevel?: ActivityLevel
  waterGoal?: number // glasses per day
  proteinGoal?: number // grams per day
  carbsGoal?: number
  fatGoal?: number
  countExercise?: boolean // subtract exercise kcal from the daily total
}

// ─── Navigation ───────────────────────────────────────────────────────────────

export type AppId = 'money' | 'health'
export type Page = 'dashboard' | 'add' | 'calendar' | 'reports' | 'settings'
export type SubPage = 'transactions' | 'accounts' | 'recurring' | 'savings-planner' | 'scheduled-payments' | 'budgets' | 'ai-chat' | 'auto-categorize' | null
