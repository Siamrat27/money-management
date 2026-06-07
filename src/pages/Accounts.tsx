import { useState } from 'react'
import { Plus, Edit2, Trash2, ArrowLeftRight } from 'lucide-react'
import { useAccounts, addAccount, updateAccount, deleteAccount, getAccountBalance } from '../hooks/useAccounts'
import { useTransactions, addTransaction } from '../hooks/useTransactions'
import { useTags } from '../hooks/useTags'
import Card from '../components/ui/Card'
import Modal from '../components/ui/Modal'
import Button from '../components/ui/Button'
import Numpad from '../components/ui/Numpad'
import AmountDisplay from '../components/ui/AmountDisplay'
import IconDisplay from '../components/ui/IconDisplay'
import Header from '../components/layout/Header'
import { formatAmount } from '../utils/formatters'
import { uploadIcon, isUrlIcon } from '../lib/storage'
import type { Account, AccountType } from '../types'

const ACCOUNT_TYPES: { value: AccountType; label: string; icon: string }[] = [
  { value: 'cash', label: 'เงินสด', icon: '💵' },
  { value: 'bank', label: 'บัญชีธนาคาร', icon: '🏦' },
  { value: 'savings', label: 'ออมทรัพย์', icon: '🐷' },
  { value: 'other', label: 'อื่นๆ', icon: '💳' },
]

const COLORS = ['#6366f1', '#f59e0b', '#22c55e', '#ef4444', '#3b82f6', '#8b5cf6', '#ec4899', '#14b8a6']
const ICONS = ['💵', '🏦', '🐷', '💳', '💰', '🏧', '📈', '🪙', '💎', '🎯']

function useBalance(accountId: string): number {
  const txns = useTransactions()
  let balance = 0
  for (const t of txns) {
    if (t.type === 'income' && t.accountId === accountId) balance += t.amount
    if (t.type === 'expense' && t.accountId === accountId) balance -= t.amount
    if (t.type === 'transfer') {
      if (t.accountId === accountId) balance -= t.amount
      if (t.toAccountId === accountId) balance += t.amount
    }
  }
  return balance
}

function AccountBalance({ id }: { id: string }) {
  const balance = useBalance(id)
  return <span className={`text-lg font-bold ${balance >= 0 ? 'text-gray-800 dark:text-gray-100' : 'text-red-500'}`}>฿{formatAmount(balance)}</span>
}

export default function Accounts() {
  const accounts = useAccounts()
  const [modal, setModal] = useState<'add' | 'edit' | 'transfer' | null>(null)
  const [editing, setEditing] = useState<Account | null>(null)
  const [form, setForm] = useState({ name: '', type: 'cash' as AccountType, color: COLORS[0], icon: ICONS[0] })
  const [currentBalance, setCurrentBalance] = useState(0)
  const [balanceTarget, setBalanceTarget] = useState('')
  const [iconUploading, setIconUploading] = useState(false)
  const [fromId, setFromId] = useState<string | null>(null)
  const [toId, setToId] = useState<string | null>(null)
  const [transferAmt, setTransferAmt] = useState('0')
  const [transferNote, setTransferNote] = useState('')
  const [transferInsufficient, setTransferInsufficient] = useState(false)

  function openAdd() {
    setEditing(null)
    setForm({ name: '', type: 'cash', color: COLORS[0], icon: ICONS[0] })
    setModal('add')
  }

  async function openEdit(a: Account) {
    setEditing(a)
    setForm({ name: a.name, type: a.type, color: a.color, icon: a.icon })
    setBalanceTarget('')
    const bal = await getAccountBalance(a.id)
    setCurrentBalance(bal)
    setModal('edit')
  }

  async function handleSave() {
    if (!form.name.trim()) return
    if (editing) {
      await updateAccount(editing.id, form)
      if (balanceTarget !== '') {
        const target = parseFloat(balanceTarget)
        if (!isNaN(target) && target !== currentBalance) {
          const diff = target - currentBalance
          await addTransaction({
            type: diff > 0 ? 'income' : 'expense',
            amount: Math.abs(diff),
            accountId: editing.id,
            note: 'ปรับยอดบัญชี',
            date: new Date(),
            isRecurring: false,
          })
        }
      }
    } else {
      await addAccount({ ...form, createdAt: new Date() })
    }
    setModal(null)
  }

  async function handleDelete(a: Account) {
    if (confirm(`ลบบัญชี "${a.name}"?`)) await deleteAccount(a.id)
  }

  async function handleIconUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setIconUploading(true)
    try {
      const url = await uploadIcon(file)
      setForm((f) => ({ ...f, icon: url }))
    } catch (err) {
      console.error('icon upload failed', err)
    }
    setIconUploading(false)
    e.target.value = ''
  }

  async function handleTransfer() {
    const amt = parseFloat(transferAmt)
    if (!amt || !fromId || !toId || fromId === toId) return

    setTransferInsufficient(false)
    const balance = await getAccountBalance(fromId)
    if (balance - amt < 0) {
      setTransferInsufficient(true)
      return
    }

    await addTransaction({
      type: 'transfer', amount: amt, accountId: fromId, toAccountId: toId,
      note: transferNote || 'โอนเงิน', date: new Date(), isRecurring: false,
    })
    setTransferAmt('0')
    setTransferNote('')
    setModal(null)
  }

  return (
    <div className="min-h-screen pb-nav">
      <Header
        title="บัญชี"
        showBack
        right={
          <button onClick={openAdd} className="p-2 rounded-full active:bg-gray-100 dark:active:bg-gray-800">
            <Plus size={20} />
          </button>
        }
      />

      <div className="max-w-lg mx-auto px-4 py-4 space-y-3">
        {accounts.map((a) => (
          <Card key={a.id} className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl overflow-hidden" style={{ backgroundColor: a.color + '22' }}>
                <IconDisplay icon={a.icon} />
              </div>
              <div className="flex-1">
                <p className="font-semibold">{a.name}</p>
                <p className="text-xs text-gray-400">{ACCOUNT_TYPES.find((t) => t.value === a.type)?.label}</p>
              </div>
              <AccountBalance id={a.id} />
              <div className="flex gap-1">
                <button onClick={() => openEdit(a)} className="p-2 rounded-lg active:bg-gray-100 dark:active:bg-gray-800 text-gray-400"><Edit2 size={16} /></button>
                <button onClick={() => handleDelete(a)} className="p-2 rounded-lg active:bg-red-50 dark:active:bg-red-950 text-gray-400"><Trash2 size={16} /></button>
              </div>
            </div>
          </Card>
        ))}

        {accounts.length >= 2 && (
          <Button
            variant="secondary"
            fullWidth
            onClick={() => { setFromId(accounts[0].id); setToId(accounts[1].id); setModal('transfer') }}
          >
            <ArrowLeftRight size={16} className="inline mr-2" />
            โอนเงินระหว่างบัญชี
          </Button>
        )}

        {accounts.length === 0 && (
          <div className="text-center py-16">
            <p className="text-4xl mb-2">🏦</p>
            <p className="text-gray-400 mb-4">ยังไม่มีบัญชี</p>
            <Button onClick={openAdd}>เพิ่มบัญชี</Button>
          </div>
        )}
      </div>

      {/* Add/Edit Modal */}
      <Modal open={modal === 'add' || modal === 'edit'} onClose={() => setModal(null)} title={modal === 'edit' ? 'แก้ไขบัญชี' : 'เพิ่มบัญชี'}>
        <div className="space-y-4">
          <div>
            <label className="text-sm text-gray-500 block mb-1">ชื่อบัญชี</label>
            <input
              type="text" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="ชื่อบัญชี..."
              className="w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm outline-none focus:border-indigo-400"
            />
          </div>
          <div>
            <label className="text-sm text-gray-500 block mb-2">ประเภท</label>
            <div className="grid grid-cols-2 gap-2">
              {ACCOUNT_TYPES.map((t) => (
                <button key={t.value} onClick={() => setForm((f) => ({ ...f, type: t.value }))}
                  className={`flex items-center gap-2 px-3 py-2 rounded-xl border-2 text-sm ${form.type === t.value ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950 text-indigo-600' : 'border-gray-200 dark:border-gray-700'}`}>
                  {t.icon} {t.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-sm text-gray-500 block mb-2">ไอคอน</label>
            <div className="flex gap-2 flex-wrap">
              {ICONS.map((ic) => (
                <button key={ic} onClick={() => setForm((f) => ({ ...f, icon: ic }))}
                  className={`w-10 h-10 rounded-xl text-xl border-2 ${form.icon === ic ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950' : 'border-gray-200 dark:border-gray-700'}`}>
                  {ic}
                </button>
              ))}
              {isUrlIcon(form.icon) && (
                <div className="w-10 h-10 rounded-xl border-2 border-indigo-500 overflow-hidden">
                  <img src={form.icon} className="w-full h-full object-cover" alt="" />
                </div>
              )}
              <label className={`w-10 h-10 rounded-xl border-2 border-dashed border-gray-300 dark:border-gray-600 flex items-center justify-center cursor-pointer hover:border-indigo-400 transition-colors ${iconUploading ? 'opacity-50 pointer-events-none' : ''}`}>
                {iconUploading ? <span className="text-xs text-gray-400">...</span> : <Plus size={16} className="text-gray-400" />}
                <input type="file" accept="image/*" className="hidden" onChange={handleIconUpload} />
              </label>
            </div>
          </div>
          <div>
            <label className="text-sm text-gray-500 block mb-2">สี</label>
            <div className="flex gap-2 flex-wrap">
              {COLORS.map((c) => (
                <button key={c} onClick={() => setForm((f) => ({ ...f, color: c }))}
                  className={`w-8 h-8 rounded-full border-4 ${form.color === c ? 'border-white ring-2 ring-offset-1 ring-gray-400 scale-110' : 'border-transparent'}`}
                  style={{ backgroundColor: c }} />
              ))}
            </div>
          </div>
          {modal === 'edit' && (
            <div>
              <label className="text-sm text-gray-500 block mb-1">ปรับยอดเงิน</label>
              <div className="bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-3 space-y-2">
                <p className="text-xs text-gray-400">
                  ยอดปัจจุบัน: <span className={`font-semibold ${currentBalance >= 0 ? 'text-gray-700 dark:text-gray-200' : 'text-red-500'}`}>฿{formatAmount(currentBalance)}</span>
                </p>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-sm text-gray-400">฿</span>
                  <input
                    type="number"
                    value={balanceTarget}
                    onChange={(e) => setBalanceTarget(e.target.value)}
                    placeholder={`${formatAmount(currentBalance)} (ไม่เปลี่ยน)`}
                    className="w-full pl-7 pr-4 py-2.5 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl text-sm outline-none focus:border-indigo-400"
                  />
                </div>
                {balanceTarget !== '' && !isNaN(parseFloat(balanceTarget)) && parseFloat(balanceTarget) !== currentBalance && (
                  <p className="text-xs text-indigo-500 font-medium">
                    → จะบันทึก{parseFloat(balanceTarget) > currentBalance ? 'รายรับ' : 'รายจ่าย'}ปรับยอด ฿{formatAmount(Math.abs(parseFloat(balanceTarget) - currentBalance))}
                  </p>
                )}
              </div>
            </div>
          )}
          <div className="flex gap-3">
            <Button variant="secondary" onClick={() => setModal(null)}>ยกเลิก</Button>
            <Button fullWidth onClick={handleSave}>บันทึก</Button>
          </div>
        </div>
      </Modal>

      {/* Transfer Modal */}
      <Modal open={modal === 'transfer'} onClose={() => setModal(null)} title="โอนเงิน">
        <div className="space-y-4">
          <AmountDisplay value={transferAmt} />
          <Numpad value={transferAmt} onChange={(v) => { setTransferAmt(v); setTransferInsufficient(false) }} />
          <div>
            <label className="text-xs text-gray-500 block mb-1">จากบัญชี</label>
            <div className="flex gap-2 flex-wrap">
              {accounts.map((a) => (
                <button key={a.id} onClick={() => { setFromId(a.id); setTransferInsufficient(false) }}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm border-2 ${fromId === a.id ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950 text-indigo-600' : 'border-gray-200 dark:border-gray-700'}`}>
                  {a.icon} {a.name}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">ไปบัญชี</label>
            <div className="flex gap-2 flex-wrap">
              {accounts.filter((a) => a.id !== fromId).map((a) => (
                <button key={a.id} onClick={() => setToId(a.id)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm border-2 ${toId === a.id ? 'border-blue-500 bg-blue-50 dark:bg-blue-950 text-blue-600' : 'border-gray-200 dark:border-gray-700'}`}>
                  {a.icon} {a.name}
                </button>
              ))}
            </div>
          </div>
          <input type="text" value={transferNote} onChange={(e) => setTransferNote(e.target.value)} placeholder="บันทึก..."
            className="w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm outline-none" />
          {transferInsufficient && (
            <div className="flex items-center gap-2 px-4 py-3 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-2xl text-red-600 dark:text-red-400 text-sm font-medium">
              <span>⚠️</span>
              <span>เงินในบัญชีต้นทางไม่เพียงพอ</span>
            </div>
          )}
          <div className="flex gap-3">
            <Button variant="secondary" onClick={() => { setModal(null); setTransferInsufficient(false) }}>ยกเลิก</Button>
            <Button fullWidth onClick={handleTransfer} className="!bg-blue-500">โอนเงิน</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
