import Groq from 'groq-sdk'

export const DEFAULT_GROQ_MODEL = 'openai/gpt-oss-120b'

// Curated models always shown in the dropdown (in addition to any fetched live)
export const KNOWN_GROQ_MODELS = [
  'openai/gpt-oss-120b',
  'qwen/qwen3-32b',
]

function client(apiKey: string) {
  // The key is the user's own, entered in Settings — browser use is intended.
  return new Groq({ apiKey, dangerouslyAllowBrowser: true })
}

export async function listGroqModels(apiKey: string): Promise<string[]> {
  const res = await client(apiKey).models.list()
  const ids = (res.data ?? []).map((m) => m.id)
  return [...new Set(ids)].sort()
}

export interface ParsedTxn {
  action: 'income' | 'expense' | 'transfer'
  amount: number
  account?: string
  toAccount?: string
  category?: string
  note?: string
}

// Turn free Thai text into one or more transactions, constrained to the
// user's actual accounts/categories.
export async function parseTransactions(
  apiKey: string,
  model: string,
  text: string,
  ctx: { accounts: string[]; categories: string[] },
): Promise<ParsedTxn[]> {
  const system = `คุณเป็นตัวช่วยแปลงข้อความภาษาไทยเป็นรายการการเงิน ตอบเป็น JSON เท่านั้น

บัญชีที่มี: ${ctx.accounts.join(', ') || '(ไม่มี)'}
หมวดหมู่ที่มี: ${ctx.categories.join(', ') || '(ไม่มี)'}

กฎ:
- action: "income" (รับ/ได้เงิน), "expense" (จ่าย/ซื้อ/เสีย), "transfer" (โอน/ย้ายเงินระหว่างบัญชี)
- amount: ตัวเลขมากกว่า 0
- account, toAccount, category: ต้องเลือกชื่อจากรายการด้านบนเท่านั้น (จับคู่ที่ใกล้ที่สุด) ถ้าไม่แน่ใจให้เว้นว่าง
- transfer ต้องมีทั้ง account (ต้นทาง) และ toAccount (ปลายทาง)
- รองรับหลายรายการในประโยคเดียว
- note: รายละเอียดเพิ่มเติมถ้ามี

ตอบรูปแบบ: {"items":[{"action":"...","amount":0,"account":"...","toAccount":"...","category":"...","note":"..."}]}`

  const res = await client(apiKey).chat.completions.create({
    model,
    temperature: 0,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: text },
    ],
  })

  const content = res.choices[0]?.message?.content ?? '{}'
  let parsed: unknown
  try { parsed = JSON.parse(content) } catch { return [] }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const arr: any[] = Array.isArray((parsed as any)?.items) ? (parsed as any).items
    : Array.isArray(parsed) ? (parsed as any[]) : []

  return arr
    .filter((it) => it && ['income', 'expense', 'transfer'].includes(it.action) && Number(it.amount) > 0)
    .map((it) => ({
      action: it.action,
      amount: Number(it.amount),
      account: typeof it.account === 'string' && it.account ? it.account : undefined,
      toAccount: typeof it.toAccount === 'string' && it.toAccount ? it.toAccount : undefined,
      category: typeof it.category === 'string' && it.category ? it.category : undefined,
      note: typeof it.note === 'string' && it.note ? it.note : undefined,
    }))
}

// ─── Chat Q&A over the user's finance summary ────────────────────────────────

export interface ChatMsg { role: 'user' | 'assistant'; content: string }

export async function chatFinance(
  apiKey: string,
  model: string,
  messages: ChatMsg[],
  summary: string,
): Promise<string> {
  const system = `คุณเป็นผู้ช่วยการเงินส่วนตัว ตอบสั้น กระชับ เป็นกันเอง เป็นภาษาไทย
อ้างอิงจาก "ข้อมูลการเงิน" ด้านล่างเท่านั้น ถ้าข้อมูลไม่พอให้บอกตรงๆ ใส่ตัวเลขเป็นบาท (฿) ให้ชัดเจน

${summary}`
  const res = await client(apiKey).chat.completions.create({
    model,
    temperature: 0.3,
    messages: [{ role: 'system', content: system }, ...messages],
  })
  return res.choices[0]?.message?.content ?? ''
}

// ─── Monthly advice (for Discord summary) ────────────────────────────────────

export async function generateAdvice(apiKey: string, model: string, summary: string): Promise<string> {
  const res = await client(apiKey).chat.completions.create({
    model,
    temperature: 0.4,
    messages: [
      { role: 'system', content: 'คุณเป็นที่ปรึกษาการเงินส่วนตัว สรุปภาพรวมเดือนนี้สั้นๆ แล้วให้คำแนะนำที่ทำได้จริง 2-3 ข้อ เป็นภาษาไทย กระชับ ใช้ bullet (•) ไม่ต้องเกริ่นนำ' },
      { role: 'user', content: summary },
    ],
  })
  return res.choices[0]?.message?.content ?? ''
}
