import { useState, useEffect } from 'react'
import { ArrowLeftRight } from 'lucide-react'
import { format } from 'date-fns'
import { useAccounts, getAccountBalance } from '../hooks/useAccounts'
import { useTags } from '../hooks/useTags'
import { addTransaction, updateTransaction, useTransactions } from '../hooks/useTransactions'
import { usePresets } from '../hooks/usePresets'
import type { Preset } from '../types'
import { addRecurring } from '../hooks/useRecurring'
import { useAppStore } from '../stores/useAppStore'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import Numpad from '../components/ui/Numpad'
import AmountDisplay from '../components/ui/AmountDisplay'
import Button from '../components/ui/Button'
import Header from '../components/layout/Header'
import { formatAmount } from '../utils/formatters'
import type { TransactionType, Frequency } from '../types'
import { nextDueDate, frequencyLabel } from '../utils/dateHelpers'

const FREQUENCIES: Frequency[] = ['daily', 'weekly', 'monthly', 'yearly']

export default function AddTransaction() {
  const { setPage, editTransactionId, setEditTransactionId } = useAppStore()
  const accounts = useAccounts()
  const tags = useTags()
  const allTxns = useTransactions()
  const presets = usePresets()

  function calcBal(accountId: string): number {
    let bal = 0
    for (const t of allTxns) {
      if (t.type === 'income' && t.accountId === accountId) bal += t.amount
      if (t.type === 'expense' && t.accountId === accountId) bal -= t.amount
      if (t.type === 'transfer') {
        if (t.accountId === accountId) bal -= t.amount
        if (t.toAccountId === accountId) bal += t.amount
      }
    }
    return bal
  }

  const editTxn = useLiveQuery(
    () => editTransactionId ? db.transactions.get(editTransactionId) : Promise.resolve(undefined),
    [editTransactionId]
  )

  const [type, setType] = useState<TransactionType>('expense')
  const [amount, setAmount] = useState('0')
  const [accountId, setAccountId] = useState<string | null>(null)
  const [toAccountId, setToAccountId] = useState<string | null>(null)
  const [tagId, setTagId] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [isRecurring, setIsRecurring] = useState(false)
  const [frequency, setFrequency] = useState<Frequency>('monthly')
  const [recurringName, setRecurringName] = useState('')
  const [insufficientFunds, setInsufficientFunds] = useState(false)

  useEffect(() => {
    if (accounts.length > 0 && accountId === null) setAccountId(accounts[0].id)
  }, [accounts])

  useEffect(() => {
    if (editTxn) {
      setType(editTxn.type)
      setAmount(String(editTxn.amount))
      setAccountId(editTxn.accountId)
      setToAccountId(editTxn.toAccountId ?? null)
      setTagId(editTxn.tagId ?? null)
      setNote(editTxn.note)
      setDate(format(editTxn.date, 'yyyy-MM-dd'))
    }
  }, [editTxn])

  function applyPreset(p: Preset) {
    setType(p.type)
    setAmount(String(p.amount))
    setAccountId(p.accountId)
    setToAccountId(p.toAccountId ?? null)
    setTagId(p.tagId ?? null)
    setNote(p.note)
    setInsufficientFunds(false)
  }

  const filteredTags = tags.filter((t) => type === 'income' ? t.type !== 'expense' : type === 'expense' ? t.type !== 'income' : true)

  async function handleSave() {
    const amt = parseFloat(amount)
    if (!amt || amt <= 0 || !accountId) return

    setInsufficientFunds(false)

    if ((type === 'expense' || type === 'transfer') && !editTransactionId) {
      const balance = await getAccountBalance(accountId)
      if (balance - amt < 0) {
        setInsufficientFunds(true)
        return
      }
    }

    const now = new Date()
    const [yr, mo, dy] = date.split('-').map(Number)
    const txnDate = new Date(yr, mo - 1, dy, now.getHours(), now.getMinutes(), now.getSeconds())

    if (editTransactionId) {
      await updateTransaction(editTransactionId, {
        type, amount: amt, accountId,
        toAccountId: type === 'transfer' ? (toAccountId ?? undefined) : undefined,
        tagId: tagId ?? undefined, note, date: txnDate,
      })
      setEditTransactionId(null)
    } else {
      await addTransaction({
        type, amount: amt, accountId,
        toAccountId: type === 'transfer' ? (toAccountId ?? undefined) : undefined,
        tagId: tagId ?? undefined, note, date: txnDate, isRecurring,
      })

      if (isRecurring && type !== 'transfer') {
        const start = txnDate
        await addRecurring({
          name: recurringName || note || 'รายการต่อเนื่อง',
          type: type as 'income' | 'expense',
          amount: amt, accountId,
          tagId: tagId ?? undefined,
          frequency, startDate: start,
          nextDueDate: nextDueDate(start, frequency),
          isActive: true,
        })
      }
    }
    setAmount('0')
    setNote('')
    setIsRecurring(false)
    setPage('dashboard')
  }

  return (
    <div className="min-h-screen pb-nav flex flex-col">
      <Header title={editTransactionId ? 'แก้ไขรายการ' : 'เพิ่มรายการ'} />

      <div className="max-w-lg mx-auto w-full px-4 py-4 flex-1 flex flex-col gap-4">
        {/* Preset Strip */}
        {presets.length > 0 && (
          <div>
            <label className="text-xs text-gray-500 mb-1 block">รายการด่วน</label>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {presets.map((p) => {
                const tag = tags.find((t) => t.id === p.tagId)
                return (
                  <button
                    key={p.id}
                    onClick={() => applyPreset(p)}
                    className="flex-shrink-0 flex flex-col items-start px-3 py-2 rounded-xl border-2 border-gray-200 dark:border-gray-700 active:border-indigo-500 active:bg-indigo-50 dark:active:bg-indigo-950 transition-colors"
                  >
                    <span className="text-sm font-medium flex items-center gap-1">
                      {tag?.icon ?? (p.type === 'income' ? '💰' : p.type === 'transfer' ? '↔️' : '💸')} {p.name}
                    </span>
                    <span className="text-xs text-gray-400">฿{formatAmount(p.amount)}</span>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* Type Selector */}
        <div className="flex bg-gray-100 dark:bg-gray-800 rounded-2xl p-1 gap-1">
          {(['expense', 'income', 'transfer'] as TransactionType[]).map((t) => (
            <button
              key={t}
              onClick={() => { setType(t); setTagId(null) }}
              className={`flex-1 py-2 rounded-xl text-sm font-semibold transition-colors ${
                type === t
                  ? t === 'income' ? 'bg-green-500 text-white'
                    : t === 'expense' ? 'bg-red-500 text-white'
                    : 'bg-blue-500 text-white'
                  : 'text-gray-500'
              }`}
            >
              {t === 'income' ? 'รายรับ' : t === 'expense' ? 'รายจ่าย' : 'โอนเงิน'}
            </button>
          ))}
        </div>

        {/* Amount Display */}
        <AmountDisplay value={amount} />

        {/* Numpad */}
        <Numpad value={amount} onChange={(v) => { setAmount(v); setInsufficientFunds(false) }} />

        {/* Fields */}
        <div className="space-y-3">
          {/* Account */}
          <div>
            <label className="text-xs text-gray-500 mb-1 block">บัญชี{type === 'transfer' ? ' (จาก)' : ''}</label>
            <div className="flex gap-2 flex-wrap">
              {accounts.map((a) => {
                const bal = calcBal(a.id)
                return (
                  <button
                    key={a.id}
                    onClick={() => setAccountId(a.id)}
                    className={`flex flex-col items-start px-3 py-2 rounded-xl text-sm font-medium border-2 transition-colors ${
                      accountId === a.id ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950 text-indigo-600' : 'border-gray-200 dark:border-gray-700'
                    }`}
                  >
                    <span className="flex items-center gap-1.5">{a.icon} {a.name}</span>
                    <span className={`text-xs mt-0.5 ${accountId === a.id ? 'text-indigo-400' : 'text-gray-400'}`}>฿{formatAmount(bal)}</span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* To Account (transfer) */}
          {type === 'transfer' && (
            <div>
              <label className="text-xs text-gray-500 mb-1 block flex items-center gap-1"><ArrowLeftRight size={12} />บัญชีปลายทาง</label>
              <div className="flex gap-2 flex-wrap">
                {accounts.filter((a) => a.id !== accountId).map((a) => {
                  const bal = calcBal(a.id)
                  return (
                    <button
                      key={a.id}
                      onClick={() => setToAccountId(a.id)}
                      className={`flex flex-col items-start px-3 py-2 rounded-xl text-sm font-medium border-2 transition-colors ${
                        toAccountId === a.id ? 'border-blue-500 bg-blue-50 dark:bg-blue-950 text-blue-600' : 'border-gray-200 dark:border-gray-700'
                      }`}
                    >
                      <span className="flex items-center gap-1.5">{a.icon} {a.name}</span>
                      <span className={`text-xs mt-0.5 ${toAccountId === a.id ? 'text-blue-400' : 'text-gray-400'}`}>฿{formatAmount(bal)}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* Tag */}
          {type !== 'transfer' && (
            <div>
              <label className="text-xs text-gray-500 mb-1 block">หมวดหมู่</label>
              <div className="flex gap-2 flex-wrap">
                {filteredTags.map((tag) => (
                  <button
                    key={tag.id}
                    onClick={() => setTagId(tagId === tag.id ? null : tag.id)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-medium border-2 transition-colors ${
                      tagId === tag.id ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950 text-indigo-600' : 'border-gray-200 dark:border-gray-700'
                    }`}
                    style={tagId === tag.id ? { borderColor: tag.color, backgroundColor: tag.color + '11', color: tag.color } : {}}
                  >
                    <span>{tag.icon}</span>{tag.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Note */}
          <div>
            <label className="text-xs text-gray-500 mb-1 block">บันทึก</label>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="บันทึกช่วยจำ..."
              className="w-full px-4 py-2.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm outline-none focus:border-indigo-400"
            />
          </div>

          {/* Date */}
          <div>
            <label className="text-xs text-gray-500 mb-1 block">วันที่</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full px-4 py-2.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm outline-none focus:border-indigo-400"
            />
          </div>

          {/* Recurring */}
          {type !== 'transfer' && !editTransactionId && (
            <div className="bg-gray-50 dark:bg-gray-800 rounded-2xl p-4">
              <label className="flex items-center gap-3 cursor-pointer">
                <div
                  onClick={() => setIsRecurring((v) => !v)}
                  className={`w-12 h-6 rounded-full transition-colors flex items-center ${isRecurring ? 'bg-indigo-500' : 'bg-gray-300 dark:bg-gray-600'}`}
                >
                  <div className={`w-5 h-5 bg-white rounded-full shadow transition-transform mx-0.5 ${isRecurring ? 'translate-x-6' : ''}`} />
                </div>
                <span className="text-sm font-medium">รายการต่อเนื่อง</span>
              </label>
              {isRecurring && (
                <div className="mt-3 space-y-3">
                  <input
                    type="text"
                    value={recurringName}
                    onChange={(e) => setRecurringName(e.target.value)}
                    placeholder="ชื่อรายการต่อเนื่อง..."
                    className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl text-sm outline-none"
                  />
                  <div className="flex gap-2 flex-wrap">
                    {FREQUENCIES.map((f) => (
                      <button
                        key={f}
                        onClick={() => setFrequency(f)}
                        className={`px-3 py-1.5 rounded-xl text-sm font-medium border-2 ${frequency === f ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950 text-indigo-600' : 'border-gray-200 dark:border-gray-700'}`}
                      >
                        {frequencyLabel(f)}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Save Button */}
        {insufficientFunds && (
          <div className="flex items-center gap-2 px-4 py-3 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-2xl text-red-600 dark:text-red-400 text-sm font-medium">
            <span>⚠️</span>
            <span>เงินในบัญชีไม่เพียงพอ</span>
          </div>
        )}
        <div className="flex gap-3 mt-2">
          <Button variant="secondary" onClick={() => { setPage('dashboard'); setEditTransactionId(null) }}>ยกเลิก</Button>
          <Button
            fullWidth
            onClick={handleSave}
            className={type === 'income' ? '!bg-green-500' : type === 'expense' ? '!bg-red-500' : '!bg-blue-500'}
          >
            {editTransactionId ? 'บันทึกการแก้ไข' : 'บันทึก'}
          </Button>
        </div>
      </div>
    </div>
  )
}
