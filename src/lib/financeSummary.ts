import { db } from '../db/db'
import { calcBalance } from '../hooks/useAccounts'
import { getMonthRange } from '../utils/dateHelpers'
import { formatAmount } from '../utils/formatters'
import { subMonths, format } from 'date-fns'
import { th } from 'date-fns/locale'

// Compact Thai text summary of a user's finances — fed to the LLM as context
// for chat Q&A and monthly advice. Sends aggregates, not raw rows (token + privacy).
export async function buildFinanceSummary(userId: string): Promise<string> {
  const now = new Date()
  const [allTxns, accounts, tags, plans] = await Promise.all([
    db.transactions.where('userId').equals(userId).toArray(),
    db.accounts.where('userId').equals(userId).toArray(),
    db.tags.where('userId').equals(userId).toArray(),
    db.savingsPlans.where('userId').equals(userId).toArray(),
  ])

  const [mFrom, mTo] = getMonthRange(now)
  const [lmFrom, lmTo] = getMonthRange(subMonths(now, 1))
  const inR = (d: Date, a: Date, b: Date) => d >= a && d <= b
  const thisMonth = allTxns.filter((t) => inR(t.date, mFrom, mTo))
  const lastMonth = allTxns.filter((t) => inR(t.date, lmFrom, lmTo))
  const sumType = (arr: typeof allTxns, type: string) => arr.filter((t) => t.type === type).reduce((s, t) => s + t.amount, 0)

  const income = sumType(thisMonth, 'income')
  const expense = sumType(thisMonth, 'expense')
  const lastNet = sumType(lastMonth, 'income') - sumType(lastMonth, 'expense')

  const byTag = new Map<string, number>()
  for (const t of thisMonth) if (t.type === 'expense' && t.tagId) byTag.set(t.tagId, (byTag.get(t.tagId) ?? 0) + t.amount)
  const tagName = (id: string) => tags.find((x) => x.id === id)?.name ?? '?'
  const topCats = [...byTag.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8)
    .map(([id, amt]) => `${tagName(id)} ฿${formatAmount(amt)}`)

  const budgetLines = tags.filter((t) => (t.monthlyBudget ?? 0) > 0).map((t) => {
    const spent = byTag.get(t.id) ?? 0
    const pct = Math.round((spent / t.monthlyBudget!) * 100)
    return `${t.name} ฿${formatAmount(spent)}/฿${formatAmount(t.monthlyBudget!)} (${pct}%${spent > t.monthlyBudget! ? ' เกินงบ' : ''})`
  })

  const activeAcc = accounts.filter((a) => !a.archived)
  const accLines = activeAcc.map((a) => `${a.name} ฿${formatAmount(calcBalance(a.id, allTxns))}`)
  const total = activeAcc.reduce((s, a) => s + calcBalance(a.id, allTxns), 0)

  const planLines = plans.map((p) => {
    const cur = p.linkedAccountId ? calcBalance(p.linkedAccountId, allTxns) : p.initialAmount
    return `${p.name} ฿${formatAmount(cur)}/฿${formatAmount(p.targetAmount)}`
  })

  return `ข้อมูลการเงินของผู้ใช้ (ณ ${format(now, 'd MMM yyyy', { locale: th })})

ยอดเงินรวมทุกบัญชี: ฿${formatAmount(total)}
แต่ละบัญชี: ${accLines.join(', ') || '-'}

เดือนนี้ (${format(now, 'MMMM', { locale: th })}):
- รายรับ ฿${formatAmount(income)}
- รายจ่าย ฿${formatAmount(expense)}
- คงเหลือ (ออมได้) ฿${formatAmount(income - expense)}
- เดือนก่อนคงเหลือ ฿${formatAmount(lastNet)}
- หมวดจ่ายมากสุดเดือนนี้: ${topCats.join(', ') || '-'}

งบประมาณรายหมวด: ${budgetLines.join(' | ') || 'ยังไม่ตั้งงบ'}
แผนออมเงิน: ${planLines.join(' | ') || 'ไม่มี'}`
}
