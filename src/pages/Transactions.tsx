import { useState } from 'react'
import { Search, Filter, Trash2, Edit2, ArrowUpDown } from 'lucide-react'
import { useTransactions, deleteTransaction } from '../hooks/useTransactions'
import { useAccounts } from '../hooks/useAccounts'
import { useTags } from '../hooks/useTags'
import { useAppStore } from '../stores/useAppStore'
import Header from '../components/layout/Header'
import Card from '../components/ui/Card'
import Badge from '../components/ui/Badge'
import { formatCurrency, formatAmount } from '../utils/formatters'
import { formatDate } from '../utils/dateHelpers'
import type { Transaction } from '../types'

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

  const filtered = allTxns.filter((t) => {
    if (filterType !== 'all' && t.type !== filterType) return false
    if (filterAccount !== 'all' && t.accountId !== parseInt(filterAccount)) return false
    if (filterTag !== 'all' && t.tagId !== parseInt(filterTag)) return false
    if (search) {
      const q = search.toLowerCase()
      const note = t.note.toLowerCase()
      const tag = tags.find((g) => g.id === t.tagId)?.name.toLowerCase() ?? ''
      if (!note.includes(q) && !tag.includes(q)) return false
    }
    return true
  })

  function getTag(id?: number) { return tags.find((t) => t.id === id) }
  function getAccount(id?: number) { return accounts.find((a) => a.id === id) }

  async function handleDelete(t: Transaction) {
    if (confirm('ลบรายการนี้?')) await deleteTransaction(t.id!)
  }

  function handleEdit(t: Transaction) {
    setEditTransactionId(t.id!)
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
                  <button key={a.id} onClick={() => setFilterAccount(String(a.id))}
                    className={`px-3 py-1 rounded-xl text-sm font-medium border-2 ${filterAccount === String(a.id) ? 'border-indigo-500 text-indigo-600 bg-indigo-50 dark:bg-indigo-950' : 'border-gray-200 dark:border-gray-700'}`}>
                    {a.icon} {a.name}
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
                  <button key={t.id} onClick={() => setFilterTag(String(t.id))}
                    className={`px-3 py-1 rounded-xl text-sm font-medium border-2 ${filterTag === String(t.id) ? 'border-indigo-500 text-indigo-600 bg-indigo-50 dark:bg-indigo-950' : 'border-gray-200 dark:border-gray-700'}`}>
                    {t.icon} {t.name}
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
                  <div className="w-10 h-10 rounded-2xl flex items-center justify-center text-xl flex-shrink-0"
                    style={{ backgroundColor: (tag?.color ?? '#6366f1') + '22' }}>
                    {isTransfer ? '↔️' : tag?.icon ?? '💸'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{t.note || tag?.name || (isTransfer ? 'โอนเงิน' : '-')}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <p className="text-xs text-gray-400">{formatDate(t.date, 'd MMM yy')}</p>
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
    </div>
  )
}
