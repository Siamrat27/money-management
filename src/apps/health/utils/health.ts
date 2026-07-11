import { format, subDays } from 'date-fns'
import type { ActivityLevel, Gender, MealType } from '@/types'

// yyyy-MM-dd key used across the health app (string compare == date compare)
export function dateKey(d: Date = new Date()): string {
  return format(d, 'yyyy-MM-dd')
}

export const MEALS: { value: MealType; label: string; icon: string }[] = [
  { value: 'breakfast', label: 'มื้อเช้า', icon: '🍳' },
  { value: 'lunch', label: 'มื้อกลางวัน', icon: '🍛' },
  { value: 'dinner', label: 'มื้อเย็น', icon: '🍲' },
  { value: 'snack', label: 'ของว่าง', icon: '🍎' },
]

export function mealLabel(meal: MealType): string {
  return MEALS.find((m) => m.value === meal)?.label ?? meal
}

// ─── BMI (Asian/Thai cutoffs) ─────────────────────────────────────────────────

export function calcBMI(weightKg: number, heightCm: number): number {
  if (weightKg <= 0 || heightCm <= 0) return 0
  const m = heightCm / 100
  return weightKg / (m * m)
}

export function bmiCategory(bmi: number): { label: string; color: string } {
  if (bmi < 18.5) return { label: 'น้ำหนักน้อย', color: '#3b82f6' }
  if (bmi < 23) return { label: 'สมส่วน', color: '#22c55e' }
  if (bmi < 25) return { label: 'ท้วม', color: '#f59e0b' }
  if (bmi < 30) return { label: 'อ้วน', color: '#f97316' }
  return { label: 'อ้วนมาก', color: '#ef4444' }
}

// ─── BMR / TDEE (Mifflin-St Jeor) ─────────────────────────────────────────────

export function calcAge(birthYear: number): number {
  return Math.max(0, new Date().getFullYear() - birthYear)
}

export function calcBMR(gender: Gender, weightKg: number, heightCm: number, age: number): number {
  const base = 10 * weightKg + 6.25 * heightCm - 5 * age
  return Math.round(gender === 'male' ? base + 5 : base - 161)
}

export const ACTIVITY_LEVELS: { value: ActivityLevel; label: string; factor: number }[] = [
  { value: 'sedentary', label: 'นั่งทำงาน แทบไม่ออกกำลังกาย', factor: 1.2 },
  { value: 'light', label: 'ออกกำลังกายเบาๆ 1-3 วัน/สัปดาห์', factor: 1.375 },
  { value: 'moderate', label: 'ออกกำลังกายปานกลาง 3-5 วัน/สัปดาห์', factor: 1.55 },
  { value: 'active', label: 'ออกกำลังกายหนัก 6-7 วัน/สัปดาห์', factor: 1.725 },
  { value: 'veryActive', label: 'หนักมาก/นักกีฬา ทำงานใช้แรง', factor: 1.9 },
]

export function calcTDEE(bmr: number, level: ActivityLevel): number {
  const factor = ACTIVITY_LEVELS.find((l) => l.value === level)?.factor ?? 1.2
  return Math.round(bmr * factor)
}

// Safe weight-loss target: TDEE − 500 kcal (~0.5 kg/week), never below a floor
export function suggestKcalTarget(tdee: number, gender: Gender): number {
  const floor = gender === 'male' ? 1500 : 1200
  return Math.max(floor, tdee - 500)
}

// ─── Streak: consecutive days (ending today or yesterday) with a log ─────────

export function calcStreak(loggedDates: Set<string>): number {
  const today = new Date()
  let start = today
  if (!loggedDates.has(dateKey(today))) {
    // today not logged yet — streak still alive if yesterday was logged
    start = subDays(today, 1)
    if (!loggedDates.has(dateKey(start))) return 0
  }
  let streak = 0
  let d = start
  while (loggedDates.has(dateKey(d))) {
    streak++
    d = subDays(d, 1)
  }
  return streak
}

// ─── Formatting ───────────────────────────────────────────────────────────────

export function formatKcal(kcal: number): string {
  return new Intl.NumberFormat('th-TH', { maximumFractionDigits: 0 }).format(kcal)
}

export function formatWeight(kg: number): string {
  return new Intl.NumberFormat('th-TH', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(kg)
}
