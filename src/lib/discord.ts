import { format } from 'date-fns'
import { th } from 'date-fns/locale'
import { db, LOCAL_USER_ID } from '../db/db'
import { useAuthStore } from '../stores/useAuthStore'
import { getMonthRange } from '../utils/dateHelpers'
import { formatAmount } from '../utils/formatters'
import type { Transaction } from '../types'

async function getWebhookUrl(): Promise<string> {
  const userId = useAuthStore.getState().user?.id ?? LOCAL_USER_ID
  const settings = await db.userSettings.get(userId)
  return settings?.discordWebhook ?? ''
}

interface DiscordEmbed {
  title?: string
  color?: number
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

  const [account, toAccount, tag] = await Promise.all([
    db.accounts.get(txn.accountId),
    txn.toAccountId ? db.accounts.get(txn.toAccountId) : Promise.resolve(undefined),
    txn.tagId ? db.tags.get(txn.tagId) : Promise.resolve(undefined),
  ])

  const isIncome = txn.type === 'income'
  const isTransfer = txn.type === 'transfer'
  const typeLabel = isIncome ? 'รายรับ' : isTransfer ? 'โอนเงิน' : 'รายจ่าย'
  const color = isIncome ? 0x22c55e : isTransfer ? 0x3b82f6 : 0xef4444
  const sign = isIncome ? '+' : isTransfer ? '' : '-'

  const fields: { name: string; value: string; inline?: boolean }[] = []

  if (tag) {
    fields.push({ name: '🏷️ หมวดหมู่', value: `${tag.icon} ${tag.name}`, inline: true })
  }

  if (account) {
    const accText = isTransfer
      ? `${account.icon} ${account.name}  →  ${toAccount ? `${toAccount.icon} ${toAccount.name}` : '?'}`
      : `${account.icon} ${account.name}`
    fields.push({ name: '🏦 บัญชี', value: accText, inline: true })
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
    fields,
    footer: { text: 'PocketFlow' },
    timestamp: txn.date.toISOString(),
  }])

  // Budget exceeded check — only for expense with tagged category that has a budget
  if (txn.type === 'expense' && txn.tagId && tag?.monthlyBudget) {
    const [from, to] = getMonthRange(txn.date)
    const monthTxns = await db.transactions
      .where('date').between(from, to, true, true)
      .filter((t) => t.type === 'expense' && t.tagId === txn.tagId)
      .toArray()
    const totalSpent = monthTxns.reduce((s, t) => s + t.amount, 0)

    if (totalSpent > tag.monthlyBudget) {
      const pct = Math.round((totalSpent / tag.monthlyBudget) * 100)
      await postToDiscord(url, [{
        title: `⚠️ เกินงบประมาณ! ${tag.icon} ${tag.name}`,
        color: 0xf97316,
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
