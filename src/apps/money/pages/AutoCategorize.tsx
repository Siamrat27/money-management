import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Sparkles, Wand2 } from 'lucide-react'
import { db, LOCAL_USER_ID } from '@/db/db'
import { useAuthStore } from '@/stores/useAuthStore'
import { useAppStore } from '@/stores/useAppStore'
import { useTags, addTag } from '@/apps/money/hooks/useTags'
import { updateTransaction } from '@/apps/money/hooks/useTransactions'
import { useUserSettings } from '@/hooks/useSettings'
import { categorizeTransactions, DEFAULT_GROQ_MODEL } from '@/lib/groq'
import Header from '@/components/layout/Header'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import { formatAmount } from '@/utils/formatters'
import { formatDate } from '@/utils/dateHelpers'
import type { Transaction, TagType } from '@/types'

const NEW_PREFIX = 'new:'
const SKIP = 'skip'
const PALETTE = ['#f97316', '#3b82f6', '#ec4899', '#8b5cf6', '#10b981', '#22c55e', '#14b8a6', '#f59e0b', '#64748b', '#ef4444']
const MAX_BATCH = 120

export default function AutoCategorize() {
  const userId = useAuthStore((s) => s.user?.id ?? LOCAL_USER_ID)
  const tags = useTags()
  const settings = useUserSettings()
  const { setSubPage } = useAppStore()
  const aiEnabled = !!settings?.groqApiKey

  const uncategorized = useLiveQuery(
    () => db.transactions.where('userId').equals(userId)
      .filter((t) => (t.type === 'income' || t.type === 'expense') && !t.tagId)
      .reverse().sortBy('date'),
    [userId],
  ) ?? []

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  // choice per txn id: existing tagId | `new:Name` | 'skip'
  const [choices, setChoices] = useState<Map<string, string> | null>(null)
  const [saving, setSaving] = useState(false)

  const tagsFor = (type: Transaction['type']) =>
    tags.filter((t) => (type === 'income' ? t.type !== 'expense' : t.type !== 'income'))
  const findTag = (name: string, type: Transaction['type']) =>
    tagsFor(type).find((t) => t.name.toLowerCase() === name.trim().toLowerCase())

  async function analyze() {
    if (!settings?.groqApiKey) return
    setBusy(true); setError('')
    try {
      const batch = uncategorized.slice(0, MAX_BATCH) as Transaction[]
      const results = await categorizeTransactions(
        settings.groqApiKey, settings.groqModel || DEFAULT_GROQ_MODEL,
        batch.map((t) => ({ id: t.id, type: t.type as 'income' | 'expense', note: t.note || '', amount: t.amount })),
        {
          expenseCategories: tags.filter((t) => t.type !== 'income').map((t) => t.name),
          incomeCategories: tags.filter((t) => t.type !== 'expense').map((t) => t.name),
        },
      )
      const byId = new Map(results.map((r) => [r.id, r.category]))
      const next = new Map<string, string>()
      for (const t of batch) {
        const cat = (byId.get(t.id) || '').trim()
        if (!cat) { next.set(t.id, SKIP); continue }
        const existing = findTag(cat, t.type)
        next.set(t.id, existing ? existing.id : NEW_PREFIX + cat)
      }
      setChoices(next)
      if (results.length === 0) setError('วิเคราะห์ไม่สำเร็จ ลองใหม่อีกครั้ง')
    } catch {
      setError('เชื่อมต่อ AI ไม่ได้ — ตรวจ Groq API key ในตั้งค่า')
    }
    setBusy(false)
  }

  // summary of what will happen
  const rows = (uncategorized.slice(0, MAX_BATCH) as Transaction[]).filter((t) => choices?.has(t.id))
  const applyCount = rows.filter((t) => choices!.get(t.id) !== SKIP).length
  const newTagNames = [...new Set(
    rows.map((t) => choices!.get(t.id)!).filter((c) => c.startsWith(NEW_PREFIX)).map((c) => c.slice(NEW_PREFIX.length)),
  )]

  async function confirm() {
    if (!choices) return
    setSaving(true)
    try {
      // create new tags once per (name|type), reusing an existing tag if one appeared meanwhile
      const created = new Map<string, string>() // `name|type` -> tagId
      let colorIdx = tags.length
      for (const t of rows) {
        const choice = choices.get(t.id)!
        if (choice === SKIP || !choice.startsWith(NEW_PREFIX)) continue
        const name = choice.slice(NEW_PREFIX.length)
        const key = `${name.toLowerCase()}|${t.type}`
        if (created.has(key)) continue
        const existing = findTag(name, t.type)
        if (existing) { created.set(key, existing.id); continue }
        const id = await addTag({
          name, color: PALETTE[colorIdx++ % PALETTE.length], icon: '🏷️',
          type: t.type as TagType,
        })
        created.set(key, id)
      }
      // assign tags
      for (const t of rows) {
        const choice = choices.get(t.id)!
        if (choice === SKIP) continue
        let tagId: string | undefined
        if (choice.startsWith(NEW_PREFIX)) {
          tagId = created.get(`${choice.slice(NEW_PREFIX.length).toLowerCase()}|${t.type}`)
        } else {
          tagId = choice
        }
        if (tagId) await updateTransaction(t.id, { tagId })
      }
      setChoices(null)
    } catch {
      setError('บันทึกไม่สำเร็จ ลองใหม่')
    }
    setSaving(false)
  }

  return (
    <div className="min-h-screen pb-nav">
      <Header title="จัดหมวดอัตโนมัติ" showBack onBack={() => setSubPage(null)} />

      <div className="max-w-lg mx-auto px-4 py-4 space-y-3">
        {!aiEnabled ? (
          <div className="text-center py-16">
            <Sparkles size={40} className="mx-auto mb-3 text-gray-300" />
            <p className="text-gray-400 mb-1">ยังไม่ได้ตั้งค่า AI</p>
            <p className="text-xs text-gray-400">ใส่ Groq API key ในหน้าตั้งค่าก่อน</p>
          </div>
        ) : uncategorized.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-5xl mb-3">✨</p>
            <p className="text-gray-400">ทุกรายการมีหมวดหมู่แล้ว</p>
          </div>
        ) : !choices ? (
          <div className="text-center py-12">
            <Wand2 size={36} className="mx-auto mb-3 text-indigo-500" />
            <p className="font-semibold mb-1">มี {uncategorized.length} รายการที่ยังไม่มีหมวด</p>
            <p className="text-xs text-gray-400 mb-5">AI จะเดาหมวดให้ โดยใช้หมวดที่มีอยู่ก่อน — คุณตรวจก่อนยืนยันได้</p>
            <Button onClick={analyze} disabled={busy}>
              {busy ? '🔄 กำลังวิเคราะห์...' : `✨ วิเคราะห์ ${Math.min(uncategorized.length, MAX_BATCH)} รายการ`}
            </Button>
            {error && <p className="text-xs text-red-500 mt-3">{error}</p>}
          </div>
        ) : (
          <>
            {rows.map((t) => {
              const choice = choices.get(t.id)!
              const isNew = choice.startsWith(NEW_PREFIX)
              const newName = isNew ? choice.slice(NEW_PREFIX.length) : ''
              return (
                <Card key={t.id} className="p-3">
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{t.note || (t.type === 'income' ? 'รายรับ' : 'รายจ่าย')}</p>
                      <p className="text-xs text-gray-400">
                        <span className={t.type === 'income' ? 'text-green-500' : 'text-red-500'}>
                          {t.type === 'income' ? '+' : '-'}฿{formatAmount(t.amount)}
                        </span> · {formatDate(t.date, 'd MMM yy')}
                      </p>
                    </div>
                    {isNew && <span className="text-[10px] flex-shrink-0 bg-amber-100 dark:bg-amber-950 text-amber-600 rounded-full px-2 py-0.5 font-medium">หมวดใหม่</span>}
                  </div>
                  <select
                    value={choice}
                    onChange={(e) => setChoices((m) => new Map(m).set(t.id, e.target.value))}
                    className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm outline-none"
                  >
                    {isNew && <option value={choice}>+ สร้างหมวด "{newName}"</option>}
                    {tagsFor(t.type).map((tg) => <option key={tg.id} value={tg.id}>{tg.name}</option>)}
                    <option value={SKIP}>— ข้าม —</option>
                  </select>
                </Card>
              )
            })}

            <div className="sticky bottom-16 bg-gray-50/90 dark:bg-gray-900/90 backdrop-blur rounded-2xl p-3 space-y-2 border border-gray-100 dark:border-gray-800">
              <p className="text-sm">จะจัดหมวด <span className="font-bold">{applyCount}</span> รายการ</p>
              {newTagNames.length > 0 && (
                <p className="text-xs text-amber-600">สร้างหมวดใหม่ {newTagNames.length} หมวด: {newTagNames.join(', ')}</p>
              )}
              {error && <p className="text-xs text-red-500">{error}</p>}
              <div className="flex gap-2">
                <Button variant="secondary" onClick={() => setChoices(null)}>วิเคราะห์ใหม่</Button>
                <Button fullWidth onClick={confirm} disabled={saving || applyCount === 0}>
                  {saving ? 'กำลังบันทึก...' : 'ยืนยัน'}
                </Button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
