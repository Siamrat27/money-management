import { useState } from 'react'
import { Plus, Trash2, Edit2, Play, Pause } from 'lucide-react'
import { useRecurring, addRecurring, updateRecurring, deleteRecurring, confirmRecurring, skipRecurring } from '../hooks/useRecurring'
import { useAccounts } from '../hooks/useAccounts'
import { useTags } from '../hooks/useTags'
import { nextDueDate as calcNextDue } from '../utils/dateHelpers'
import Card from '../components/ui/Card'
import Modal from '../components/ui/Modal'
import Button from '../components/ui/Button'
import Header from '../components/layout/Header'
import IconDisplay from '../components/ui/IconDisplay'
import { isUrlIcon } from '../lib/storage'
import { formatAmount } from '../utils/formatters'
import { formatDate, frequencyLabel, today } from '../utils/dateHelpers'
import { format } from 'date-fns'
import type { Recurring, Frequency } from '../types'

const FREQUENCIES: Frequency[] = ['daily', 'weekly', 'monthly', 'yearly']

export default function RecurringManager() {
  const recurring = useRecurring()
  const accounts = useAccounts()
  const tags = useTags()
  const [modal, setModal] = useState(false)
  const [editing, setEditing] = useState<Recurring | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<Recurring | null>(null)
  const [form, setForm] = useState({
    name: '', type: 'expense' as 'income' | 'expense', amount: '',
    accountId: '' as string, tagId: undefined as string | undefined,
    frequency: 'monthly' as Frequency, startDate: format(new Date(), 'yyyy-MM-dd'),
  })

  function openAdd() {
    setEditing(null)
    setForm({ name: '', type: 'expense', amount: '', accountId: accounts[0]?.id ?? '', tagId: undefined, frequency: 'monthly', startDate: format(new Date(), 'yyyy-MM-dd') })
    setModal(true)
  }

  function openEdit(r: Recurring) {
    setEditing(r)
    setForm({
      name: r.name, type: r.type, amount: String(r.amount), accountId: r.accountId,
      tagId: r.tagId, frequency: r.frequency, startDate: format(r.startDate, 'yyyy-MM-dd'),
    })
    setModal(true)
  }

  async function handleSave() {
    const amt = parseFloat(form.amount)
    if (!amt || !form.name || !form.accountId) return
    const startDate = new Date(form.startDate + 'T00:00:00')
    if (editing) {
      const startChanged = startDate.getTime() !== new Date(editing.startDate).getTime()
      const freqChanged = form.frequency !== editing.frequency
      const updates: Partial<typeof editing> = {
        name: form.name, type: form.type, amount: amt,
        accountId: form.accountId, tagId: form.tagId,
        frequency: form.frequency, startDate,
      }
      if (startChanged || freqChanged) updates.nextDueDate = startDate
      await updateRecurring(editing.id, updates)
    } else {
      await addRecurring({ name: form.name, type: form.type, amount: amt, accountId: form.accountId, tagId: form.tagId, frequency: form.frequency, startDate, nextDueDate: startDate, isActive: true })
    }
    setModal(false)
  }

  function getAccount(id: string) { return accounts.find((a) => a.id === id) }
  function getTag(id?: string) { return tags.find((t) => t.id === id) }

  const isOverdue = (r: Recurring) => r.nextDueDate <= today()

  return (
    <div className="min-h-screen pb-nav">
      <Header title="รายการต่อเนื่อง" showBack right={
        <button onClick={openAdd} className="p-2 rounded-full active:bg-gray-100 dark:active:bg-gray-800"><Plus size={20} /></button>
      } />

      <div className="max-w-lg mx-auto px-4 py-4 space-y-3">
        {recurring.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-4xl mb-2">🔄</p>
            <p className="text-gray-400 mb-4">ยังไม่มีรายการต่อเนื่อง</p>
            <Button onClick={openAdd}>เพิ่มรายการ</Button>
          </div>
        ) : (
          recurring.map((r) => {
            const acc = getAccount(r.accountId)
            const tag = getTag(r.tagId)
            const overdue = isOverdue(r) && r.isActive
            return (
              <Card key={r.id} className={`p-4 ${overdue ? 'ring-2 ring-orange-400' : ''}`}>
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-2xl flex items-center justify-center text-xl flex-shrink-0 overflow-hidden"
                    style={{ backgroundColor: (tag?.color ?? '#6366f1') + '22' }}>
                    <IconDisplay icon={tag?.icon ?? '🔄'} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold">{r.name}</p>
                      {overdue && <span className="text-xs bg-orange-100 text-orange-600 dark:bg-orange-950 dark:text-orange-400 px-2 py-0.5 rounded-full font-medium">ครบกำหนด</span>}
                      {!r.isActive && <span className="text-xs bg-gray-100 text-gray-500 dark:bg-gray-800 px-2 py-0.5 rounded-full font-medium">หยุดพัก</span>}
                    </div>
                    <p className={`text-sm font-bold ${r.type === 'income' ? 'text-green-500' : 'text-red-500'}`}>
                      {r.type === 'income' ? '+' : '-'}฿{formatAmount(r.amount)}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      <span className="text-xs text-gray-400">{frequencyLabel(r.frequency)}</span>
                      <span className="text-xs text-gray-300">·</span>
                      <span className="text-xs text-gray-400">ถัดไป: {formatDate(r.nextDueDate, 'd MMM yy')}</span>
                      {acc && (
                        <span className="flex items-center gap-1 text-xs text-gray-400">
                          {isUrlIcon(acc.icon)
                            ? <img src={acc.icon} className="w-3.5 h-3.5 rounded object-cover flex-shrink-0" alt="" />
                            : <span>{acc.icon}</span>}
                          {acc.name}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-col gap-1">
                    <div className="flex gap-1">
                      <button onClick={() => updateRecurring(r.id, { isActive: !r.isActive })}
                        className="p-1.5 rounded-lg active:bg-gray-100 dark:active:bg-gray-800 text-gray-400">
                        {r.isActive ? <Pause size={14} /> : <Play size={14} />}
                      </button>
                      <button onClick={() => openEdit(r)} className="p-1.5 rounded-lg active:bg-gray-100 dark:active:bg-gray-800 text-gray-400"><Edit2 size={14} /></button>
                      <button onClick={() => setDeleteConfirm(r)} className="p-1.5 rounded-lg active:bg-red-50 dark:active:bg-red-950 text-gray-400"><Trash2 size={14} /></button>
                    </div>
                    {overdue && (
                      <div className="flex gap-1">
                        <Button size="sm" variant="secondary" onClick={() => skipRecurring(r)}>ข้าม</Button>
                        <Button size="sm" onClick={() => confirmRecurring(r)}>บันทึก</Button>
                      </div>
                    )}
                  </div>
                </div>
              </Card>
            )
          })
        )}
      </div>

      <Modal open={modal} onClose={() => setModal(false)} title={editing ? 'แก้ไขรายการต่อเนื่อง' : 'เพิ่มรายการต่อเนื่อง'}>
        <div className="space-y-4">
          <input type="text" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            placeholder="ชื่อรายการ..." className="w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm outline-none" />
          <div className="flex bg-gray-100 dark:bg-gray-800 rounded-2xl p-1 gap-1">
            {(['expense', 'income'] as const).map((t) => (
              <button key={t} onClick={() => setForm((f) => ({ ...f, type: t }))}
                className={`flex-1 py-2 rounded-xl text-sm font-semibold ${form.type === t ? (t === 'income' ? 'bg-green-500 text-white' : 'bg-red-500 text-white') : 'text-gray-500'}`}>
                {t === 'income' ? 'รายรับ' : 'รายจ่าย'}
              </button>
            ))}
          </div>
          <input type="number" value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
            placeholder="จำนวนเงิน" className="w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm outline-none" />
          <div>
            <label className="text-xs text-gray-500 block mb-1">บัญชี</label>
            <div className="flex gap-2 flex-wrap">
              {accounts.map((a) => (
                <button key={a.id} onClick={() => setForm((f) => ({ ...f, accountId: a.id }))}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm border-2 ${form.accountId === a.id ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950 text-indigo-600' : 'border-gray-200 dark:border-gray-700'}`}>
                  {isUrlIcon(a.icon)
                    ? <img src={a.icon} className="w-4 h-4 rounded object-cover flex-shrink-0" alt="" />
                    : a.icon} {a.name}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">ความถี่</label>
            <div className="flex gap-2 flex-wrap">
              {FREQUENCIES.map((f) => (
                <button key={f} onClick={() => setForm((frm) => ({ ...frm, frequency: f }))}
                  className={`px-3 py-1.5 rounded-xl text-sm border-2 ${form.frequency === f ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950 text-indigo-600' : 'border-gray-200 dark:border-gray-700'}`}>
                  {frequencyLabel(f)}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">วันเริ่มต้น</label>
            <input type="date" value={form.startDate} onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))}
              className="w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm outline-none" />
          </div>
          <div className="flex gap-3">
            <Button variant="secondary" onClick={() => setModal(false)}>ยกเลิก</Button>
            <Button fullWidth onClick={handleSave}>บันทึก</Button>
          </div>
        </div>
      </Modal>

      <Modal open={!!deleteConfirm} onClose={() => setDeleteConfirm(null)} title="ยืนยันการลบ">
        <div className="space-y-4">
          <p className="text-sm text-gray-600 dark:text-gray-300">
            ลบ <span className="font-semibold">"{deleteConfirm?.name}"</span> ออกจากรายการต่อเนื่องใช่หรือไม่?
          </p>
          <p className="text-xs text-gray-400">รายการที่บันทึกไปแล้วจะไม่ถูกลบ</p>
          <div className="flex gap-3">
            <Button variant="secondary" fullWidth onClick={() => setDeleteConfirm(null)}>ยกเลิก</Button>
            <Button variant="danger" fullWidth onClick={async () => { await deleteRecurring(deleteConfirm!.id); setDeleteConfirm(null) }}>ลบ</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
