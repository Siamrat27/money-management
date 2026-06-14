// PocketFlow external API — create a transaction (รับ / จ่าย / โอน)
//
// Auth:  Authorization: Bearer <api_key>   (key created in the app's Settings)
// Body:  { "action": "income|expense|transfer" | "รับ|จ่าย|โอน",
//          "amount": 120,
//          "account": "เงินสด" | "<account_id>",
//          "toAccount": "ธนาคาร" | "<account_id>",   // transfer only
//          "category": "อาหาร" | "<tag_id>",          // optional, income/expense
//          "note": "ข้าวเที่ยง" }                      // optional
//
// Deploy: supabase functions deploy tx --no-verify-jwt
// (must NOT verify the Supabase JWT — callers authenticate with their api_key)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })
}

async function sha256Hex(s: string): Promise<string> {
  const data = new TextEncoder().encode(s)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

const ACTION_MAP: Record<string, 'income' | 'expense' | 'transfer'> = {
  income: 'income', expense: 'expense', transfer: 'transfer',
  'รับ': 'income', 'จ่าย': 'expense', 'โอน': 'transfer',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405)

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  // ── authenticate via api key ──────────────────────────────────────────────
  const auth = req.headers.get('Authorization') ?? ''
  const apiKey = auth.replace(/^Bearer\s+/i, '').trim()
  if (!apiKey) return json({ error: 'missing API key' }, 401)

  const keyHash = await sha256Hex(apiKey)
  const { data: keyRow } = await admin
    .from('api_keys').select('id, user_id').eq('key_hash', keyHash).maybeSingle()
  if (!keyRow) return json({ error: 'invalid API key' }, 401)

  const userId = keyRow.user_id as string
  admin.from('api_keys').update({ last_used_at: new Date().toISOString() }).eq('id', keyRow.id).then()

  // ── parse + validate ──────────────────────────────────────────────────────
  let body: Record<string, unknown>
  try { body = await req.json() } catch { return json({ error: 'invalid JSON body' }, 400) }

  const action = ACTION_MAP[String(body.action ?? '').trim()]
  if (!action) return json({ error: "action must be income|expense|transfer (รับ|จ่าย|โอน)" }, 400)

  const amount = Number(body.amount)
  if (!amount || amount <= 0) return json({ error: 'amount must be a positive number' }, 400)

  // resolve accounts/tags for this user
  const [{ data: accounts }, { data: tags }] = await Promise.all([
    admin.from('accounts').select('id, name, archived').eq('user_id', userId),
    admin.from('tags').select('id, name').eq('user_id', userId),
  ])

  const findAccount = (ref: unknown): { id: string } | null => {
    const s = String(ref ?? '').trim()
    if (!s) return null
    const byId = accounts?.find((a) => a.id === s)
    if (byId) return byId
    const byName = accounts?.find((a) => a.name.toLowerCase() === s.toLowerCase())
    return byName ?? null
  }

  const account = findAccount(body.account)
  if (!account) return json({ error: `account not found: ${body.account ?? '(missing)'}` }, 400)

  let toAccountId: string | null = null
  if (action === 'transfer') {
    const to = findAccount(body.toAccount)
    if (!to) return json({ error: `toAccount not found: ${body.toAccount ?? '(missing)'}` }, 400)
    if (to.id === account.id) return json({ error: 'account and toAccount must differ' }, 400)
    toAccountId = to.id
  }

  let tagId: string | null = null
  if (action !== 'transfer' && body.category) {
    const s = String(body.category).trim()
    const tag = tags?.find((t) => t.id === s) ?? tags?.find((t) => t.name.toLowerCase() === s.toLowerCase())
    if (!tag) return json({ error: `category not found: ${body.category}` }, 400)
    tagId = tag.id
  }

  // ── insert transaction ────────────────────────────────────────────────────
  const row = {
    id: crypto.randomUUID(),
    user_id: userId,
    type: action,
    amount,
    account_id: account.id,
    to_account_id: toAccountId,
    tag_id: tagId,
    note: typeof body.note === 'string' ? body.note : '',
    date: new Date().toISOString(),
    is_recurring: false,
  }
  const { error } = await admin.from('transactions').insert(row)
  if (error) return json({ error: error.message }, 500)

  return json({ ok: true, id: row.id, action, amount, accountId: account.id, toAccountId, tagId })
})
