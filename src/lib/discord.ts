import { format, differenceInHours } from 'date-fns'
import { th } from 'date-fns/locale'
import { db, LOCAL_USER_ID } from '../db/db'
import { useAuthStore } from '../stores/useAuthStore'
import { getMonthRange, getDayRange } from '../utils/dateHelpers'
import { formatAmount } from '../utils/formatters'
import { isUrlIcon } from './storage'
import type { Transaction, SavingsPlan, ScheduledPayment } from '../types'

// Returns the icon as-is for emoji, or a fallback string for URL icons
// (Discord embed text can't display images inline)
function textIcon(icon: string, fallback: string): string {
  return isUrlIcon(icon) ? fallback : icon
}

async function getWebhookUrl(): Promise<string> {
  const userId = useAuthStore.getState().user?.id ?? LOCAL_USER_ID
  const settings = await db.userSettings.get(userId)
  return settings?.discordWebhook ?? ''
}

interface DiscordEmbed {
  title?: string
  color?: number
  thumbnail?: { url: string }
  fields?: { name: string; value: string; inline?: boolean }[]
  footer?: { text: string }
  timestamp?: string
}

async function postToDiscord(url: string, embeds: DiscordEmbed[]) {
  if (!url) return
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'PocketFlow 💰', embeds }),
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
  } catch {
    // silent — notifications are best-effort
  }
}

export async function sendTestDiscord(webhookUrl: string): Promise<boolean> {
  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'PocketFlow 💰',
        embeds: [{
          title: '✅ เชื่อมต่อ Discord สำเร็จ!',
          color: 0x6366f1,
          fields: [{ name: 'สถานะ', value: 'PocketFlow พร้อมแจ้งเตือนผ่าน Discord แล้ว 🎉', inline: false }],
          footer: { text: 'PocketFlow' },
          timestamp: new Date().toISOString(),
        }],
      }),
    })
    return res.ok
  } catch {
    return false
  }
}

export async function notifyNewTransaction(txn: Transaction) {
  const url = await getWebhookUrl()
  if (!url) return

  const [account, toAccount, tag, recurring] = await Promise.all([
    db.accounts.get(txn.accountId),
    txn.toAccountId ? db.accounts.get(txn.toAccountId) : Promise.resolve(undefined),
    txn.tagId ? db.tags.get(txn.tagId) : Promise.resolve(undefined),
    txn.recurringId ? db.recurring.get(txn.recurringId) : Promise.resolve(undefined),
  ])

  const isIncome = txn.type === 'income'
  const isTransfer = txn.type === 'transfer'
  const typeLabel = isIncome ? 'รายรับ' : isTransfer ? 'โอนเงิน' : 'รายจ่าย'
  const color = isIncome ? 0x22c55e : isTransfer ? 0x3b82f6 : 0xef4444
  const sign = isIncome ? '+' : isTransfer ? '' : '-'

  const fields: { name: string; value: string; inline?: boolean }[] = []

  // Use URL icon as embed thumbnail; emoji icons appear in field text directly
  const thumbnailUrl = tag && isUrlIcon(tag.icon) ? tag.icon
    : account && isUrlIcon(account.icon) ? account.icon
    : undefined

  if (tag) {
    fields.push({ name: '🏷️ หมวดหมู่', value: `${textIcon(tag.icon, '🏷️')} ${tag.name}`, inline: true })
  }

  if (account) {
    const accIcon = textIcon(account.icon, '🏦')
    const accText = isTransfer
      ? `${accIcon} ${account.name}  →  ${toAccount ? `${textIcon(toAccount.icon, '🏦')} ${toAccount.name}` : '?'}`
      : `${accIcon} ${account.name}`
    fields.push({ name: '🏦 บัญชี', value: accText, inline: true })
  }

  if (recurring) {
    const freqLabel: Record<string, string> = { daily: 'รายวัน', weekly: 'รายสัปดาห์', monthly: 'รายเดือน', yearly: 'รายปี' }
    fields.push({ name: '🔄 รายการต่อเนื่อง', value: `${recurring.name} · ${freqLabel[recurring.frequency] ?? recurring.frequency}`, inline: false })
  }

  if (txn.note) {
    fields.push({ name: '📝 บันทึก', value: txn.note, inline: false })
  }

  fields.push({
    name: '🕐 เวลา',
    value: format(txn.date, 'd MMM yyyy · HH:mm น.', { locale: th }),
    inline: true,
  })

  await postToDiscord(url, [{
    title: `${typeLabel}  ${sign}฿${formatAmount(txn.amount)}`,
    color,
    thumbnail: thumbnailUrl ? { url: thumbnailUrl } : undefined,
    fields,
    footer: { text: 'PocketFlow' },
    timestamp: txn.date.toISOString(),
  }])

  // Budget exceeded check — only for expense with a tagged category that has a budget
  if (txn.type === 'expense' && txn.tagId && tag?.monthlyBudget) {
    const [from, to] = getMonthRange(txn.date)
    const monthTxns = await db.transactions
      .where('date').between(from, to, true, true)
      .filter((t) => t.userId === txn.userId && t.type === 'expense' && t.tagId === txn.tagId)
      .toArray()
    const totalSpent = monthTxns.reduce((s, t) => s + t.amount, 0)

    if (totalSpent > tag.monthlyBudget) {
      const pct = Math.round((totalSpent / tag.monthlyBudget) * 100)
      await postToDiscord(url, [{
        title: `⚠️ เกินงบประมาณ! ${textIcon(tag.icon, '🏷️')} ${tag.name}`,
        color: 0xf97316,
        thumbnail: isUrlIcon(tag.icon) ? { url: tag.icon } : undefined,
        fields: [
          { name: '💰 งบรายเดือน', value: `฿${formatAmount(tag.monthlyBudget)}`, inline: true },
          { name: '💸 ใช้ไปแล้ว', value: `฿${formatAmount(totalSpent)} (${pct}%)`, inline: true },
          { name: '📊 เกินงบ', value: `฿${formatAmount(totalSpent - tag.monthlyBudget)}`, inline: true },
        ],
        footer: { text: 'PocketFlow' },
        timestamp: new Date().toISOString(),
      }])
    }
  }
}

export async function notifySavingsPlanCreated(plan: SavingsPlan) {
  const url = await getWebhookUrl()
  if (!url) return

  const fields: DiscordEmbed['fields'] = [
    { name: '🎯 เป้าหมาย', value: `฿${formatAmount(plan.targetAmount)}`, inline: true },
    { name: '📅 วันเป้าหมาย', value: format(plan.targetDate, 'd MMM yyyy', { locale: th }), inline: true },
    { name: '💰 ยอดเริ่มต้น', value: `฿${formatAmount(plan.initialAmount)}`, inline: true },
  ]
  if (plan.note) fields.push({ name: '📝 บันทึก', value: plan.note, inline: false })

  await postToDiscord(url, [{
    title: `🎯 สร้างแผนออมเงินใหม่: ${plan.name}`,
    color: 0x6366f1,
    fields,
    footer: { text: 'PocketFlow' },
    timestamp: new Date().toISOString(),
  }])
}

// "Due soon" reminder — sent once per payment (tracked via remindedAt)
export async function notifyScheduledPaymentUpcoming(payment: ScheduledPayment) {
  const url = await getWebhookUrl()
  if (!url) return

  const [account, tag] = await Promise.all([
    db.accounts.get(payment.accountId),
    payment.tagId ? db.tags.get(payment.tagId) : Promise.resolve(undefined),
  ])

  const isIncome = payment.type === 'income'
  const hoursLeft = Math.max(0, differenceInHours(payment.dueDate, new Date()))
  const whenText = hoursLeft <= 1 ? 'ภายใน 1 ชั่วโมง' : `อีกประมาณ ${hoursLeft} ชั่วโมง`

  const fields: DiscordEmbed['fields'] = [
    { name: '📅 กำหนด', value: format(payment.dueDate, 'd MMM yyyy · HH:mm น.', { locale: th }), inline: true },
    { name: '⏰ เหลือเวลา', value: whenText, inline: true },
  ]
  if (tag) fields.push({ name: '🏷️ หมวดหมู่', value: `${textIcon(tag.icon, '🏷️')} ${tag.name}`, inline: true })
  if (account) fields.push({ name: '🏦 บัญชี', value: `${textIcon(account.icon, '🏦')} ${account.name}`, inline: true })
  if (payment.note) fields.push({ name: '📝 บันทึก', value: payment.note, inline: false })

  await postToDiscord(url, [{
    title: `⏰ ใกล้ถึงกำหนด${isIncome ? 'รับ' : 'จ่าย'}  ${isIncome ? '+' : '-'}฿${formatAmount(payment.amount)}`,
    color: 0xf59e0b,
    fields,
    footer: { text: 'PocketFlow · แจ้งเตือนล่วงหน้า' },
    timestamp: new Date().toISOString(),
  }])
}

// Build income/expense/top-categories summary for a date range
async function summarizeRange(userId: string, from: Date, to: Date) {
  const txns = await db.transactions
    .where('date').between(from, to, true, true)
    .filter((t) => t.userId === userId)
    .toArray()
  const income = txns.filter((t) => t.type === 'income').reduce((s, t) => s + t.amount, 0)
  const expense = txns.filter((t) => t.type === 'expense').reduce((s, t) => s + t.amount, 0)
  const byTag = new Map<string, number>()
  for (const t of txns) {
    if (t.type === 'expense' && t.tagId) byTag.set(t.tagId, (byTag.get(t.tagId) ?? 0) + t.amount)
  }
  const topTagIds = [...byTag.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3)
  const tags = await Promise.all(topTagIds.map(([id]) => db.tags.get(id)))
  const topCategories = topTagIds.map(([id, amt], i) => {
    const tag = tags[i]
    return tag ? `${textIcon(tag.icon, '🏷️')} ${tag.name} ฿${formatAmount(amt)}` : `฿${formatAmount(amt)} (${id})`
  })
  return { count: txns.length, income, expense, net: income - expense, topCategories }
}

// Daily summary of yesterday — fired on first app open of a new day
export async function sendDailySummary(userId: string, yesterday: Date): Promise<boolean> {
  const url = await getWebhookUrl()
  if (!url) return false
  const [from, to] = getDayRange(yesterday)
  const s = await summarizeRange(userId, from, to)
  if (s.count === 0) return true // nothing to report, but mark as sent

  const fields: DiscordEmbed['fields'] = [
    { name: '💰 รายรับ', value: `฿${formatAmount(s.income)}`, inline: true },
    { name: '💸 รายจ่าย', value: `฿${formatAmount(s.expense)}`, inline: true },
    { name: s.net >= 0 ? '✅ คงเหลือ' : '⚠️ ติดลบ', value: `฿${formatAmount(Math.abs(s.net))}`, inline: true },
  ]
  if (s.topCategories.length) {
    fields.push({ name: '🏷️ ใช้จ่ายมากสุด', value: s.topCategories.join('\n'), inline: false })
  }

  await postToDiscord(url, [{
    title: `📋 สรุปประจำวัน — ${format(yesterday, 'd MMM yyyy', { locale: th })}`,
    color: 0x6366f1,
    fields,
    footer: { text: `PocketFlow · ${s.count} รายการ` },
    timestamp: new Date().toISOString(),
  }])
  return true
}

// Weekly summary of last week (Mon–Sun) — fired on first app open of a new week
export async function sendWeeklySummary(userId: string, weekStart: Date, weekEnd: Date): Promise<boolean> {
  const url = await getWebhookUrl()
  if (!url) return false
  const s = await summarizeRange(userId, weekStart, weekEnd)
  if (s.count === 0) return true

  const fields: DiscordEmbed['fields'] = [
    { name: '💰 รายรับ', value: `฿${formatAmount(s.income)}`, inline: true },
    { name: '💸 รายจ่าย', value: `฿${formatAmount(s.expense)}`, inline: true },
    { name: s.net >= 0 ? '✅ ออมได้' : '⚠️ ติดลบ', value: `฿${formatAmount(Math.abs(s.net))}`, inline: true },
  ]
  if (s.topCategories.length) {
    fields.push({ name: '🏷️ ใช้จ่ายมากสุด', value: s.topCategories.join('\n'), inline: false })
  }

  await postToDiscord(url, [{
    title: `📊 สรุปประจำสัปดาห์ — ${format(weekStart, 'd MMM', { locale: th })} ถึง ${format(weekEnd, 'd MMM yyyy', { locale: th })}`,
    color: 0x8b5cf6,
    fields,
    footer: { text: `PocketFlow · ${s.count} รายการ` },
    timestamp: new Date().toISOString(),
  }])
  return true
}

export async function notifyScheduledPaymentExecuted(payment: ScheduledPayment) {
  const url = await getWebhookUrl()
  if (!url) return

  const [account, tag] = await Promise.all([
    db.accounts.get(payment.accountId),
    payment.tagId ? db.tags.get(payment.tagId) : Promise.resolve(undefined),
  ])

  const isIncome = payment.type === 'income'
  const color = isIncome ? 0x22c55e : 0xef4444
  const sign = isIncome ? '+' : '-'
  const typeLabel = isIncome ? 'รายรับ' : 'รายจ่าย'

  const thumbnailUrl = tag && isUrlIcon(tag.icon) ? tag.icon
    : account && isUrlIcon(account.icon) ? account.icon
    : undefined

  const fields: DiscordEmbed['fields'] = []
  if (tag) fields.push({ name: '🏷️ หมวดหมู่', value: `${textIcon(tag.icon, '🏷️')} ${tag.name}`, inline: true })
  if (account) fields.push({ name: '🏦 บัญชี', value: `${textIcon(account.icon, '🏦')} ${account.name}`, inline: true })
  if (payment.note) fields.push({ name: '📝 บันทึก', value: payment.note, inline: false })
  fields.push({ name: '📅 กำหนดเดิม', value: format(payment.dueDate, 'd MMM yyyy', { locale: th }), inline: true })
  if (payment.executedAt) {
    fields.push({ name: '🕐 ดำเนินการแล้ว', value: format(payment.executedAt, 'd MMM yyyy · HH:mm น.', { locale: th }), inline: true })
  }

  await postToDiscord(url, [{
    title: `📋 ชำระล่วงหน้า ${typeLabel}  ${sign}฿${formatAmount(payment.amount)}`,
    color,
    thumbnail: thumbnailUrl ? { url: thumbnailUrl } : undefined,
    fields,
    footer: { text: 'PocketFlow' },
    timestamp: new Date().toISOString(),
  }])
}
