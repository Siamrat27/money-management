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
  ctx: { accounts: string[]; expenseCategories: string[]; incomeCategories: string[] },
): Promise<ParsedTxn[]> {
  const system = `คุณเป็นตัวช่วยแปลงข้อความภาษาไทยเป็นรายการการเงิน ตอบเป็น JSON เท่านั้น

บัญชีที่มี: ${ctx.accounts.join(', ') || '(ไม่มี)'}
หมวดหมู่สำหรับรายจ่าย (expense): ${ctx.expenseCategories.join(', ') || '(ไม่มี)'}
หมวดหมู่สำหรับรายรับ (income): ${ctx.incomeCategories.join(', ') || '(ไม่มี)'}

กฎ:
- action: "income" (รับ/ได้เงิน), "expense" (จ่าย/ซื้อ/เสีย), "transfer" (โอน/ย้ายเงินระหว่างบัญชี)
- amount: ตัวเลขมากกว่า 0
- account, toAccount: ต้องเลือกชื่อจากรายการบัญชีด้านบนเท่านั้น (จับคู่ที่ใกล้ที่สุด)
- category: ต้องเลือกให้ตรงประเภทของ action — ถ้า action เป็น expense ให้เลือกจาก "หมวดสำหรับรายจ่าย" เท่านั้น, ถ้าเป็น income ให้เลือกจาก "หมวดสำหรับรายรับ" เท่านั้น, ถ้าเป็น transfer ห้ามใส่ category. ถ้าไม่มีหมวดที่ตรงให้เว้นว่าง ห้ามใช้หมวดข้ามประเภทเด็ดขาด
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

// ─── Auto-categorize uncategorized transactions ──────────────────────────────

export interface CategorizeItem { id: string; type: 'income' | 'expense'; note: string; amount: number }
export interface CategorizeResult { id: string; category: string }

// For each item, suggest a category. STRONGLY prefers reusing existing
// categories; only proposes a new short name when truly nothing fits.
export async function categorizeTransactions(
  apiKey: string,
  model: string,
  items: CategorizeItem[],
  ctx: { expenseCategories: string[]; incomeCategories: string[] },
): Promise<CategorizeResult[]> {
  const system = `คุณช่วยจัดหมวดหมู่ให้รายการการเงินที่ยังไม่มีหมวด ตอบ JSON เท่านั้น

หมวดสำหรับรายจ่าย (expense) ที่มีอยู่: ${ctx.expenseCategories.join(', ') || '(ไม่มี)'}
หมวดสำหรับรายรับ (income) ที่มีอยู่: ${ctx.incomeCategories.join(', ') || '(ไม่มี)'}

กฎสำคัญมาก:
- พยายาม "เลือกจากหมวดที่มีอยู่" ให้มากที่สุด — จับคู่ที่ใกล้เคียงที่สุดเสมอ
- สร้างชื่อหมวดใหม่ "เฉพาะเมื่อไม่มีหมวดเดิมที่เข้ากันได้จริงๆ" เท่านั้น ใช้ชื่อสั้น ทั่วไป ใช้ซ้ำได้ (เช่น "อาหาร" ไม่ใช่ "ข้าวมันไก่ร้านป้า")
- ห้ามสร้างหมวดใหม่ที่ความหมายซ้ำกับหมวดเดิม (เช่น มี "อาหาร" แล้วห้ามสร้าง "กินข้าว")
- รายการ expense ใช้หมวดรายจ่าย, income ใช้หมวดรายรับ
- ถ้าเดาไม่ได้เลย ให้ category เป็นค่าว่าง ""

ข้อมูลแต่ละรายการมี id, type, note, amount
ตอบ: {"results":[{"id":"...","category":"ชื่อหมวด"}]}`

  const user = JSON.stringify(items.map((i) => ({ id: i.id, type: i.type, note: i.note, amount: i.amount })))

  const res = await client(apiKey).chat.completions.create({
    model, temperature: 0,
    response_format: { type: 'json_object' },
    messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
  })
  const content = res.choices[0]?.message?.content ?? '{}'
  try {
    const p = JSON.parse(content)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const arr: any[] = Array.isArray(p?.results) ? p.results : Array.isArray(p) ? p : []
    return arr
      .filter((r) => r && typeof r.id === 'string' && typeof r.category === 'string')
      .map((r) => ({ id: r.id, category: r.category.trim() }))
  } catch {
    return []
  }
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
อ้างอิงจากข้อมูลด้านล่างเท่านั้น มีทั้งสรุปภาพรวมและรายการธุรกรรมรายตัว
ถ้าผู้ใช้ถามช่วงเวลาใด (เช่น สัปดาห์นี้ เมื่อวาน 3 วันล่าสุด หมวดใดช่วงไหน) ให้คำนวณเองจากรายการธุรกรรมตามวันที่
ใส่ตัวเลขเป็นบาท (฿) ให้ชัดเจน ถ้าข้อมูลไม่พอจริงๆ ค่อยบอกว่าไม่มีข้อมูล

${summary}`
  const res = await client(apiKey).chat.completions.create({
    model,
    temperature: 0.3,
    messages: [{ role: 'system', content: system }, ...messages],
  })
  return res.choices[0]?.message?.content ?? ''
}

// ─── Natural-language search → structured filter ─────────────────────────────

export interface SearchFilter {
  type?: 'income' | 'expense' | 'transfer'
  account?: string
  category?: string
  fromDate?: string // yyyy-MM-dd
  toDate?: string   // yyyy-MM-dd
  minAmount?: number
  maxAmount?: number
  text?: string
}

export async function parseSearchFilter(
  apiKey: string,
  model: string,
  text: string,
  ctx: { accounts: string[]; categories: string[]; today: string },
): Promise<SearchFilter> {
  const system = `แปลงคำค้นหาภาษาไทยเป็นตัวกรองรายการการเงิน ตอบ JSON เท่านั้น
วันนี้คือ ${ctx.today} (ใช้คำนวณช่วงเวลา เช่น "เดือนก่อน", "สัปดาห์นี้")
บัญชีที่มี: ${ctx.accounts.join(', ') || '-'}
หมวดหมู่ที่มี: ${ctx.categories.join(', ') || '-'}

ฟิลด์ (ใส่เฉพาะที่เกี่ยวข้อง เว้นที่เหลือ):
- type: income | expense | transfer
- account: ชื่อบัญชีจากรายการ
- category: ชื่อหมวดจากรายการ
- fromDate, toDate: รูปแบบ YYYY-MM-DD
- minAmount, maxAmount: ตัวเลข
- text: คำค้นในบันทึก (เช่น ชื่อร้าน)
รูปแบบ: {"type":"","account":"","category":"","fromDate":"","toDate":"","minAmount":0,"maxAmount":0,"text":""}`

  const res = await client(apiKey).chat.completions.create({
    model, temperature: 0,
    response_format: { type: 'json_object' },
    messages: [{ role: 'system', content: system }, { role: 'user', content: text }],
  })
  const content = res.choices[0]?.message?.content ?? '{}'
  try {
    const p = JSON.parse(content)
    const clean: SearchFilter = {}
    if (['income', 'expense', 'transfer'].includes(p.type)) clean.type = p.type
    if (typeof p.account === 'string' && p.account) clean.account = p.account
    if (typeof p.category === 'string' && p.category) clean.category = p.category
    if (typeof p.fromDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(p.fromDate)) clean.fromDate = p.fromDate
    if (typeof p.toDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(p.toDate)) clean.toDate = p.toDate
    if (Number(p.minAmount) > 0) clean.minAmount = Number(p.minAmount)
    if (Number(p.maxAmount) > 0) clean.maxAmount = Number(p.maxAmount)
    if (typeof p.text === 'string' && p.text) clean.text = p.text
    return clean
  } catch {
    return {}
  }
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
