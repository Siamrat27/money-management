import { useState } from 'react'
import { Search, Filter, Trash2, Edit2, Sparkles, X } from 'lucide-react'
import { useTransactions, deleteTransaction, restoreTransaction } from '@/apps/money/hooks/useTransactions'
import { useSnackbar } from '@/stores/useSnackbar'
import { useAccounts } from '@/apps/money/hooks/useAccounts'
import { useTags } from '@/apps/money/hooks/useTags'
import { useUserSettings } from '@/hooks/useSettings'
import { parseSearchFilter, DEFAULT_GROQ_MODEL } from '@/lib/groq'
import { format } from 'date-fns'
import { useAppStore } from '@/stores/useAppStore'
import Header from '@/components/layout/Header'
import Card from '@/components/ui/Card'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import { formatAmount } from '@/utils/formatters'
import { formatDate } from '@/utils/dateHelpers'
import IconDisplay from '@/components/ui/IconDisplay'
import { isUrlIcon } from '@/lib/storage'
import type { Transaction } from '@/types'

export default function Transactions() {
  const allTxns = useTransactions()
  const accounts = useAccounts()
  const tags = useTags()
  const { setPage, setEditTransactionId } = useAppStore()
  const [search, setSearch] = useState('')
  const [filterType, setFilterType] = useState<string>('all')
  const [filterAccount, setFilterAccount] = useState<string>('all')
  const [filterTag, setFilterTag] = useState<string>('all')
  const [showFilter, setShowFilter] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<Transaction | null>(null)

  // AI natural-language search → extra range filters
  const settings = useUserSettings()
  const aiEnabled = !!settings?.groqApiKey
  const [aiQuery, setAiQuery] = useState('')
  const [aiBusy, setAiBusy] = useState(false)
  const [aiLabel, setAiLabel] = useState<string | null>(null)
  const [dateFrom, setDateFrom] = useState<string>('')
  const [dateTo, setDateTo] = useState<string>('')
  const [minAmt, setMinAmt] = useState<number | null>(null)
  const [maxAmt, setMaxAmt] = useState<number | null>(null)

  const filtered = allTxns.filter((t) => {
    if (filterType !== 'all' && t.type !== filterType) return false
    if (filterAccount !== 'all' && t.accountId !== filterAccount) return false
    if (filterTag !== 'all' && t.tagId !== filterTag) return false
    if (dateFrom && t.date < new Date(dateFrom + 'T00:00:00')) return false
    if (dateTo && t.date > new Date(dateTo + 'T23:59:59.999')) return false
    if (minAmt !== null && t.amount < minAmt) return false
    if (maxAmt !== null && t.amount > maxAmt) return false
    if (search) {
      const q = search.toLowerCase()
      const note = t.note.toLowerCase()
      const tag = tags.find((g) => g.id === t.tagId)?.name.toLowerCase() ?? ''
      if (!note.includes(q) && !tag.includes(q)) return false
    }
    return true
  })

  function clearAiFilters() {
    setAiLabel(null); setAiQuery('')
    setFilterType('all'); setFilterAccount('all'); setFilterTag('all')
    setSearch(''); setDateFrom(''); setDateTo(''); setMinAmt(null); setMaxAmt(null)
  }

  async function runAiSearch() {
    if (!aiQuery.trim() || !settings?.groqApiKey) return
    setAiBusy(true)
    try {
      const f = await parseSearchFilter(
        settings.groqApiKey, settings.groqModel || DEFAULT_GROQ_MODEL, aiQuery.trim(),
        { accounts: accounts.map((a) => a.name), categories: tags.map((t) => t.name), today: format(new Date(), 'yyyy-MM-dd') },
      )
      // reset then apply
      setFilterType(f.type ?? 'all')
      setFilterAccount(f.account ? (accounts.find((a) => a.name.toLowerCase() === f.account!.toLowerCase())?.id ?? 'all') : 'all')
      setFilterTag(f.category ? (tags.find((t) => t.name.toLowerCase() === f.category!.toLowerCase())?.id ?? 'all') : 'all')
      setDateFrom(f.fromDate ?? '')
      setDateTo(f.toDate ?? '')
      setMinAmt(f.minAmount ?? null)
      setMaxAmt(f.maxAmount ?? null)
      setSearch(f.text ?? '')
      setAiLabel(aiQuery.trim())
    } catch {
      setAiLabel('⚠️ ค้นหาด้วย AI ไม่สำเร็จ')
    }
    setAiBusy(false)
  }

  function getTag(id?: string) { return tags.find((t) => t.id === id) }
  function getAccount(id?: string) { return accounts.find((a) => a.id === id) }

  function handleDelete(t: Transaction) {
    setDeleteConfirm(t)
  }

  function handleEdit(t: Transaction) {
    setEditTransactionId(t.id)
    setPage('add')
  }

  return (
    <div className="min-h-screen pb-nav">
      <Header
        title="รายการทั้งหมด"
        showBack
        right={
          <button onClick={() => setShowFilter((v) => !v)} className="p-2 rounded-full active:bg-gray-100 dark:active:bg-gray-800">
            <Filter size={20} className={showFilter ? 'text-indigo-500' : ''} />
          </button>
        }
      />

      <div className="max-w-lg mx-auto px-4 py-4 space-y-3">
        {/* AI search */}
        {aiEnabled && (
          <div className="flex gap-2">
            <div className="relative flex-1 min-w-0">
              <Sparkles size={15} className="absolute left-3 top-3 text-indigo-400" />
              <input
                type="text" value={aiQuery}
                onChange={(e) => setAiQuery(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') runAiSearch() }}
                placeholder='ถาม AI เช่น "รายจ่ายเกิน 500 เดือนก่อน"'
                className="w-full pl-9 pr-4 py-2.5 bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-100 dark:border-indigo-900 rounded-xl text-sm outline-none focus:border-indigo-400"
              />
            </div>
            <Button onClick={runAiSearch} disabled={aiBusy || !aiQuery.trim()} className="flex-shrink-0">
              {aiBusy ? '...' : 'ค้นหา'}
            </Button>
          </div>
        )}
        {aiLabel && (
          <div className="flex items-center gap-2 text-xs bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-300 rounded-xl px-3 py-2">
            <Sparkles size={13} className="flex-shrink-0" />
            <span className="flex-1 truncate">กรองด้วย AI: "{aiLabel}"</span>
            <button onClick={clearAiFilters} className="flex-shrink-0"><X size={14} /></button>
          </div>
        )}

        {/* Search */}
        <div className="relative">
          <Search size={16} className="absolute left-3 top-3 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ค้นหาบันทึก, หมวดหมู่..."
            className="w-full pl-9 pr-4 py-2.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm outline-none focus:border-indigo-400"
          />
        </div>

        {/* Filters */}
        {showFilter && (
          <Card className="p-4 space-y-3">
            <div>
              <label className="text-xs text-gray-500 block mb-1">ประเภท</label>
              <div className="flex gap-2 flex-wrap">
                {[['all', 'ทั้งหมด'], ['income', 'รายรับ'], ['expense', 'รายจ่าย'], ['transfer', 'โอน']].map(([v, l]) => (
                  <button key={v} onClick={() => setFilterType(v)}
                    className={`px-3 py-1 rounded-xl text-sm font-medium border-2 ${filterType === v ? 'border-indigo-500 text-indigo-600 bg-indigo-50 dark:bg-indigo-950' : 'border-gray-200 dark:border-gray-700'}`}>
                    {l}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">บัญชี</label>
              <div className="flex gap-2 flex-wrap">
                <button onClick={() => setFilterAccount('all')}
                  className={`px-3 py-1 rounded-xl text-sm font-medium border-2 ${filterAccount === 'all' ? 'border-indigo-500 text-indigo-600 bg-indigo-50 dark:bg-indigo-950' : 'border-gray-200 dark:border-gray-700'}`}>
                  ทั้งหมด
                </button>
                {accounts.map((a) => (
                  <button key={a.id} onClick={() => setFilterAccount(a.id)}
                    className={`flex items-center gap-1 px-3 py-1 rounded-xl text-sm font-medium border-2 ${filterAccount === a.id ? 'border-indigo-500 text-indigo-600 bg-indigo-50 dark:bg-indigo-950' : 'border-gray-200 dark:border-gray-700'}`}>
                    {isUrlIcon(a.icon) ? <img src={a.icon} className="w-4 h-4 rounded object-cover flex-shrink-0" alt="" /> : a.icon} {a.name}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">หมวดหมู่</label>
              <div className="flex gap-2 flex-wrap">
                <button onClick={() => setFilterTag('all')}
                  className={`px-3 py-1 rounded-xl text-sm font-medium border-2 ${filterTag === 'all' ? 'border-indigo-500 text-indigo-600 bg-indigo-50 dark:bg-indigo-950' : 'border-gray-200 dark:border-gray-700'}`}>
                  ทั้งหมด
                </button>
                {tags.map((t) => (
                  <button key={t.id} onClick={() => setFilterTag(t.id)}
                    className={`flex items-center gap-1 px-3 py-1 rounded-xl text-sm font-medium border-2 ${filterTag === t.id ? 'border-indigo-500 text-indigo-600 bg-indigo-50 dark:bg-indigo-950' : 'border-gray-200 dark:border-gray-700'}`}>
                    {isUrlIcon(t.icon) ? <img src={t.icon} className="w-4 h-4 rounded object-cover flex-shrink-0" alt="" /> : t.icon} {t.name}
                  </button>
                ))}
              </div>
            </div>
          </Card>
        )}

        <p className="text-xs text-gray-400">{filtered.length} รายการ</p>

        {/* List */}
        {filtered.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-4xl mb-2">📭</p>
            <p className="text-gray-400">ไม่พบรายการ</p>
          </div>
        ) : (
          <Card>
            {filtered.map((t, i) => {
              const tag = getTag(t.tagId)
              const account = getAccount(t.accountId)
              const toAccount = getAccount(t.toAccountId)
              const isIncome = t.type === 'income'
              const isTransfer = t.type === 'transfer'
              return (
                <div
                  key={t.id}
                  className={`flex items-center gap-3 px-4 py-3 ${i > 0 ? 'border-t border-gray-50 dark:border-gray-800' : ''}`}
                >
                  <div className="w-10 h-10 rounded-2xl flex items-center justify-center text-xl flex-shrink-0 overflow-hidden"
                    style={{ backgroundColor: (tag?.color ?? '#6366f1') + '22' }}>
                    <IconDisplay icon={isTransfer ? '↔️' : tag?.icon ?? '💸'} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1">
                      <p className="font-medium text-sm truncate">{t.note || tag?.name || (isTransfer ? 'โอนเงิน' : '-')}</p>
                      {t.isRecurring && <span className="flex-shrink-0 text-[9px] leading-none bg-indigo-100 dark:bg-indigo-950 text-indigo-500 rounded-full px-1.5 py-0.5">🔄</span>}
                      {t.splitGroupId && <span className="flex-shrink-0 text-[9px] leading-none bg-purple-100 dark:bg-purple-950 text-purple-500 rounded-full px-1.5 py-0.5">🔗 แยก</span>}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <p className="text-xs text-gray-400">{formatDate(t.date, 'd MMM yy HH:mm')}</p>
                      {tag && <Badge icon={tag.icon} label={tag.name} color={tag.color} />}
                      <span className="text-xs text-gray-400">{isTransfer ? `${account?.name}→${toAccount?.name}` : account?.name}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <p className={`font-semibold text-sm ${isIncome ? 'text-green-500' : isTransfer ? 'text-blue-500' : 'text-red-500'}`}>
                      {isIncome ? '+' : isTransfer ? '' : '-'}฿{formatAmount(t.amount)}
                    </p>
                    <button onClick={() => handleEdit(t)} className="p-1.5 rounded-lg active:bg-gray-100 dark:active:bg-gray-700 text-gray-400">
                      <Edit2 size={14} />
                    </button>
                    <button onClick={() => handleDelete(t)} className="p-1.5 rounded-lg active:bg-red-50 dark:active:bg-red-950 text-gray-400 active:text-red-500">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              )
            })}
          </Card>
        )}
      </div>

      <Modal open={!!deleteConfirm} onClose={() => setDeleteConfirm(null)} title="ยืนยันการลบ">
        <div className="space-y-4">
          <p className="text-sm text-gray-600 dark:text-gray-300">
            ลบรายการ <span className="font-semibold">"{deleteConfirm?.note || '-'}"</span> ใช่หรือไม่?
          </p>
          <div className="flex gap-3">
            <Button variant="secondary" fullWidth onClick={() => setDeleteConfirm(null)}>ยกเลิก</Button>
            <Button variant="danger" fullWidth onClick={async () => {
              const t = deleteConfirm!
              await deleteTransaction(t.id)
              setDeleteConfirm(null)
              useSnackbar.getState().show('ลบรายการแล้ว', () => restoreTransaction(t))
            }}>ลบ</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
