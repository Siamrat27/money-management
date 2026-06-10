import { useState } from 'react'
import { Plus, Trash2, Edit2, CheckCircle2, XCircle, RotateCcw } from 'lucide-react'
import { format, differenceInDays, startOfDay } from 'date-fns'
import { th } from 'date-fns/locale'
import {
  useUpcomingPayments, usePaymentLog,
  addScheduledPayment, updateScheduledPayment,
  executeScheduledPayment, cancelScheduledPayment,
  reactivateScheduledPayment, deleteScheduledPayment, restoreScheduledPayment,
} from '../hooks/useScheduledPayments'
import { useSnackbar } from '../stores/useSnackbar'
import { useAccounts } from '../hooks/useAccounts'
import { useTags } from '../hooks/useTags'
import { useAppStore } from '../stores/useAppStore'
import { isUrlIcon } from '../lib/storage'
import Header from '../components/layout/Header'
import Card from '../components/ui/Card'
import Modal from '../components/ui/Modal'
import Button from '../components/ui/Button'
import IconDisplay from '../components/ui/IconDisplay'
import { formatAmount } from '../utils/formatters'
import type { ScheduledPayment, Account, Tag } from '../types'

function dueDateInfo(dueDate: Date): { text: string; className: string } {
  const today = startOfDay(new Date())
  const due = startOfDay(dueDate)
  const days = differenceInDays(due, today)
  const time = format(dueDate, 'HH:mm')
  if (days < 0) return { text: `เกิน ${Math.abs(days)} วัน · ${time}`, className: 'text-red-500' }
  if (days === 0) return { text: `วันนี้ · ${time}`, className: 'text-orange-500 font-semibold' }
  if (days <= 3) return { text: `อีก ${days} วัน · ${time}`, className: 'text-yellow-500' }
  return { text: `${format(dueDate, 'd MMM yyyy', { locale: th })} · ${time}`, className: 'text-gray-400' }
}

interface PaymentCardProps {
  payment: ScheduledPayment
  accounts: Account[]
  tags: Tag[]
  onExecute: (p: ScheduledPayment) => void
  onCancel: (p: ScheduledPayment) => void
  onEdit: (p: ScheduledPayment) => void
  onDelete: (p: ScheduledPayment) => void
}

function PaymentCard({ payment, accounts, tags, onExecute, onCancel, onEdit, onDelete }: PaymentCardProps) {
  const acc = accounts.find((a) => a.id === payment.accountId)
  const tag = tags.find((t) => t.id === payment.tagId)
  const isIncome = payment.type === 'income'
  const typeColor = isIncome ? '#22c55e' : '#ef4444'
  const sign = isIncome ? '+' : '−'
  const info = dueDateInfo(payment.dueDate)
  const isOverdue = differenceInDays(startOfDay(payment.dueDate), startOfDay(new Date())) < 0

  return (
    <Card className={`p-4 ${isOverdue ? 'ring-2 ring-red-300 dark:ring-red-800' : ''}`}>
      <div className="flex items-start gap-3">
        <div
          className="w-10 h-10 rounded-2xl flex items-center justify-center text-xl flex-shrink-0 overflow-hidden"
          style={{ backgroundColor: typeColor + '22' }}
        >
          {tag ? (
            <IconDisplay icon={tag.icon} />
          ) : (
            <span>{isIncome ? '💰' : '💸'}</span>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="font-semibold text-sm truncate">{payment.note || (isIncome ? 'รายรับ' : 'รายจ่าย')}</p>
              <p className="text-base font-bold" style={{ color: typeColor }}>
                {sign}฿{formatAmount(payment.amount)}
              </p>
              <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                {acc && (
                  <span className="flex items-center gap-1 text-xs text-gray-400">
                    {isUrlIcon(acc.icon)
                      ? <img src={acc.icon} className="w-3.5 h-3.5 rounded object-cover" alt="" />
                      : <span>{acc.icon}</span>}
                    {acc.name}
                  </span>
                )}
                {tag && (
                  <span className="text-xs text-gray-400">
                    {isUrlIcon(tag.icon)
                      ? <img src={tag.icon} className="w-3.5 h-3.5 rounded object-cover inline" alt="" />
                      : tag.icon}{' '}
                    {tag.name}
                  </span>
                )}
              </div>
              <p className={`text-xs mt-0.5 ${info.className}`}>{info.text}</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 mt-2.5">
            <Button size="sm" onClick={() => onExecute(payment)} className="flex items-center gap-1 flex-1">
              <CheckCircle2 size={14} />
              ดำเนินการ
            </Button>
            <button
              onClick={() => onEdit(payment)}
              className="p-1.5 rounded-lg text-gray-400 active:bg-gray-100 dark:active:bg-gray-800"
            >
              <Edit2 size={14} />
            </button>
            <button
              onClick={() => onCancel(payment)}
              className="p-1.5 rounded-lg text-gray-400 active:bg-gray-100 dark:active:bg-gray-800"
              title="ยกเลิก"
            >
              <XCircle size={14} />
            </button>
            <button
              onClick={() => onDelete(payment)}
              className="p-1.5 rounded-lg text-gray-400 active:bg-red-50 dark:active:bg-red-950"
            >
              <Trash2 size={14} />
            </button>
          </div>
        </div>
      </div>
    </Card>
  )
}

interface LogCardProps {
  payment: ScheduledPayment
  accounts: Account[]
  tags: Tag[]
  onReactivate: (p: ScheduledPayment) => void
  onDelete: (p: ScheduledPayment) => void
}

function LogCard({ payment, accounts, tags, onReactivate, onDelete }: LogCardProps) {
  const acc = accounts.find((a) => a.id === payment.accountId)
  const tag = tags.find((t) => t.id === payment.tagId)
  const isIncome = payment.type === 'income'
  const typeColor = isIncome ? '#22c55e' : '#ef4444'
  const sign = isIncome ? '+' : '−'
  const wasExecuted = !!payment.executedAt

  return (
    <Card className="p-4 opacity-75">
      <div className="flex items-start gap-3">
        <div
          className="w-10 h-10 rounded-2xl flex items-center justify-center text-xl flex-shrink-0 overflow-hidden"
          style={{ backgroundColor: typeColor + '18' }}
        >
          {tag ? <IconDisplay icon={tag.icon} /> : <span>{isIncome ? '💰' : '💸'}</span>}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm truncate">{payment.note || (isIncome ? 'รายรับ' : 'รายจ่าย')}</p>
          <p className="text-sm font-bold" style={{ color: typeColor }}>
            {sign}฿{formatAmount(payment.amount)}
          </p>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            {acc && (
              <span className="text-xs text-gray-400">
                {isUrlIcon(acc.icon)
                  ? <img src={acc.icon} className="w-3.5 h-3.5 rounded object-cover inline mr-0.5" alt="" />
                  : acc.icon}{' '}
                {acc.name}
              </span>
            )}
            {tag && (
              <span className="text-xs text-gray-400">
                {isUrlIcon(tag.icon)
                  ? <img src={tag.icon} className="w-3.5 h-3.5 rounded object-cover inline mr-0.5" alt="" />
                  : tag.icon}{' '}
                {tag.name}
              </span>
            )}
          </div>
          <div className="mt-1 flex items-center gap-2">
            {wasExecuted ? (
              <span className="text-xs bg-green-100 dark:bg-green-950 text-green-600 dark:text-green-400 px-2 py-0.5 rounded-full">
                ✓ ดำเนินการแล้ว {format(payment.executedAt!, 'd MMM yy · HH:mm', { locale: th })}
              </span>
            ) : (
              <span className="text-xs bg-gray-100 dark:bg-gray-800 text-gray-500 px-2 py-0.5 rounded-full">
                ยกเลิกแล้ว
              </span>
            )}
            <span className="text-xs text-gray-300">
              กำหนด {format(payment.dueDate, 'd MMM yy · HH:mm', { locale: th })}
            </span>
          </div>
          <div className="flex items-center gap-1.5 mt-2.5">
            <Button size="sm" variant="secondary" onClick={() => onReactivate(payment)} className="flex items-center gap-1 flex-1">
              <RotateCcw size={13} />
              นำกลับมา
            </Button>
            <button
              onClick={() => onDelete(payment)}
              className="p-1.5 rounded-lg text-gray-400 active:bg-red-50 dark:active:bg-red-950"
            >
              <Trash2 size={14} />
            </button>
          </div>
        </div>
      </div>
    </Card>
  )
}

const EMPTY_FORM = {
  type: 'expense' as 'income' | 'expense',
  amount: '',
  accountId: '',
  tagId: '',
  note: '',
  dueDate: format(new Date(), "yyyy-MM-dd'T'HH:mm"),
}

export default function ScheduledPayments() {
  const upcoming = useUpcomingPayments()
  const log = usePaymentLog()
  const accounts = useAccounts()
  const tags = useTags()
  const { setSubPage } = useAppStore()
  const [tab, setTab] = useState<'upcoming' | 'log'>('upcoming')

  const [modal, setModal] = useState(false)
  const [editingPayment, setEditingPayment] = useState<ScheduledPayment | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)

  const [executeConfirm, setExecuteConfirm] = useState<ScheduledPayment | null>(null)
  const [cancelConfirm, setCancelConfirm] = useState<ScheduledPayment | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<ScheduledPayment | null>(null)
  const [reactivateTarget, setReactivateTarget] = useState<ScheduledPayment | null>(null)
  const [newDueDate, setNewDueDate] = useState('')

  function openAdd() {
    setEditingPayment(null)
    setForm({ ...EMPTY_FORM, accountId: accounts[0]?.id ?? '', dueDate: format(new Date(), "yyyy-MM-dd'T'HH:mm") })
    setModal(true)
  }

  function openEdit(p: ScheduledPayment) {
    setEditingPayment(p)
    setForm({
      type: p.type,
      amount: String(p.amount),
      accountId: p.accountId,
      tagId: p.tagId ?? '',
      note: p.note,
      dueDate: format(p.dueDate, "yyyy-MM-dd'T'HH:mm"),
    })
    setModal(true)
  }

  async function handleSave() {
    const amt = parseFloat(form.amount)
    if (!amt || !form.accountId || !form.dueDate) return
    const data = {
      type: form.type,
      amount: amt,
      accountId: form.accountId,
      tagId: form.tagId || undefined,
      note: form.note,
      dueDate: new Date(form.dueDate),
      isActive: true as const,
    }
    if (editingPayment) await updateScheduledPayment(editingPayment.id, data)
    else await addScheduledPayment(data)
    setModal(false)
  }

  const filteredTags = tags.filter((t) =>
    form.type === 'income' ? t.type !== 'expense' : t.type !== 'income'
  )

  return (
    <div className="min-h-screen pb-nav">
      <Header
        title="การจ่าย/รับล่วงหน้า"
        showBack
        right={
          <button onClick={openAdd} className="p-2 rounded-full active:bg-gray-100 dark:active:bg-gray-800">
            <Plus size={20} />
          </button>
        }
      />

      {/* Tab bar */}
      <div className="max-w-lg mx-auto px-4 pt-4">
        <div className="flex bg-gray-100 dark:bg-gray-800 rounded-2xl p-1 gap-1">
          <button
            onClick={() => setTab('upcoming')}
            className={`flex-1 py-2 rounded-xl text-sm font-semibold transition-colors ${tab === 'upcoming' ? 'bg-white dark:bg-gray-700 shadow-sm' : 'text-gray-500'}`}
          >
            รอดำเนินการ
            {upcoming.length > 0 && (
              <span className="ml-1.5 text-xs bg-indigo-500 text-white rounded-full px-1.5 py-0.5">{upcoming.length}</span>
            )}
          </button>
          <button
            onClick={() => setTab('log')}
            className={`flex-1 py-2 rounded-xl text-sm font-semibold transition-colors ${tab === 'log' ? 'bg-white dark:bg-gray-700 shadow-sm' : 'text-gray-500'}`}
          >
            ประวัติ
          </button>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 py-4 space-y-3">
        {tab === 'upcoming' ? (
          upcoming.length === 0 ? (
            <div className="text-center py-16">
              <p className="text-5xl mb-3">📋</p>
              <p className="text-gray-400 mb-4">ยังไม่มีรายการที่รอดำเนินการ</p>
              <Button onClick={openAdd}>เพิ่มรายการ</Button>
            </div>
          ) : (
            upcoming.map((p) => (
              <PaymentCard
                key={p.id}
                payment={p}
                accounts={accounts}
                tags={tags}
                onExecute={setExecuteConfirm}
                onCancel={setCancelConfirm}
                onEdit={openEdit}
                onDelete={setDeleteConfirm}
              />
            ))
          )
        ) : (
          log.length === 0 ? (
            <div className="text-center py-16">
              <p className="text-5xl mb-3">📜</p>
              <p className="text-gray-400">ยังไม่มีประวัติ</p>
            </div>
          ) : (
            log.map((p) => (
              <LogCard
                key={p.id}
                payment={p}
                accounts={accounts}
                tags={tags}
                onReactivate={(p) => { setReactivateTarget(p); setNewDueDate(format(p.dueDate, "yyyy-MM-dd'T'HH:mm")) }}
                onDelete={setDeleteConfirm}
              />
            ))
          )
        )}
      </div>

      {/* ── ADD/EDIT MODAL ── */}
      <Modal open={modal} onClose={() => setModal(false)} title={editingPayment ? 'แก้ไขรายการ' : 'เพิ่มรายการล่วงหน้า'}>
        <div className="space-y-4">
          <div className="flex bg-gray-100 dark:bg-gray-800 rounded-2xl p-1 gap-1">
            {(['expense', 'income'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setForm((f) => ({ ...f, type: t, tagId: '' }))}
                className={`flex-1 py-2 rounded-xl text-sm font-semibold ${form.type === t ? (t === 'income' ? 'bg-green-500 text-white' : 'bg-red-500 text-white') : 'text-gray-500'}`}
              >
                {t === 'income' ? 'รายรับ' : 'รายจ่าย'}
              </button>
            ))}
          </div>
          <div className="relative">
            <span className="absolute left-3 top-2.5 text-sm text-gray-400">฿</span>
            <input
              type="number"
              value={form.amount}
              onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
              placeholder="จำนวนเงิน"
              className="w-full pl-7 pr-4 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm outline-none"
            />
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">บัญชี</label>
            <div className="flex gap-2 flex-wrap">
              {accounts.map((a) => (
                <button
                  key={a.id}
                  onClick={() => setForm((f) => ({ ...f, accountId: a.id }))}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm border-2 ${form.accountId === a.id ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950 text-indigo-600' : 'border-gray-200 dark:border-gray-700'}`}
                >
                  {isUrlIcon(a.icon)
                    ? <img src={a.icon} className="w-4 h-4 rounded object-cover flex-shrink-0" alt="" />
                    : a.icon}{' '}
                  {a.name}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">หมวดหมู่ (ไม่บังคับ)</label>
            <div className="flex gap-2 flex-wrap">
              {filteredTags.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setForm((f) => ({ ...f, tagId: f.tagId === t.id ? '' : t.id }))}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm border-2 ${form.tagId === t.id ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950 text-indigo-600' : 'border-gray-200 dark:border-gray-700'}`}
                >
                  {isUrlIcon(t.icon)
                    ? <img src={t.icon} className="w-4 h-4 rounded object-cover flex-shrink-0" alt="" />
                    : t.icon}{' '}
                  {t.name}
                </button>
              ))}
            </div>
          </div>
          <input
            type="text"
            value={form.note}
            onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
            placeholder="บันทึก / รายละเอียด..."
            className="w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm outline-none"
          />
          <div>
            <label className="text-xs text-gray-500 block mb-1">วันและเวลากำหนด</label>
            <input
              type="datetime-local"
              value={form.dueDate}
              onChange={(e) => setForm((f) => ({ ...f, dueDate: e.target.value }))}
              className="w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm outline-none"
            />
          </div>
          <div className="flex gap-3">
            <Button variant="secondary" onClick={() => setModal(false)}>ยกเลิก</Button>
            <Button fullWidth onClick={handleSave}>บันทึก</Button>
          </div>
        </div>
      </Modal>

      {/* ── EXECUTE CONFIRM ── */}
      <Modal open={!!executeConfirm} onClose={() => setExecuteConfirm(null)} title="ยืนยันการดำเนินการ">
        <div className="space-y-4">
          <p className="text-sm text-gray-600 dark:text-gray-300">
            ดำเนินการ{executeConfirm?.type === 'income' ? 'รับ' : 'จ่าย'}เงินจำนวน{' '}
            <span className="font-semibold">฿{formatAmount(executeConfirm?.amount ?? 0)}</span>
            {' '}จากบัญชีทันที?
          </p>
          <p className="text-xs text-gray-400">ระบบจะสร้าง transaction ใหม่และย้ายรายการนี้ไปยังประวัติ</p>
          <div className="flex gap-3">
            <Button variant="secondary" fullWidth onClick={() => setExecuteConfirm(null)}>ยกเลิก</Button>
            <Button fullWidth onClick={async () => {
              await executeScheduledPayment(executeConfirm!)
              setExecuteConfirm(null)
            }}>ดำเนินการ</Button>
          </div>
        </div>
      </Modal>

      {/* ── CANCEL CONFIRM ── */}
      <Modal open={!!cancelConfirm} onClose={() => setCancelConfirm(null)} title="ยืนยันการยกเลิก">
        <div className="space-y-4">
          <p className="text-sm text-gray-600 dark:text-gray-300">
            ยกเลิกรายการ <span className="font-semibold">"{cancelConfirm?.note || 'รายการนี้'}"</span> ใช่หรือไม่?
          </p>
          <p className="text-xs text-gray-400">รายการจะถูกย้ายไปที่ประวัติ ไม่มีการสร้าง transaction</p>
          <div className="flex gap-3">
            <Button variant="secondary" fullWidth onClick={() => setCancelConfirm(null)}>ไม่</Button>
            <Button variant="danger" fullWidth onClick={async () => {
              await cancelScheduledPayment(cancelConfirm!)
              setCancelConfirm(null)
            }}>ยกเลิกรายการ</Button>
          </div>
        </div>
      </Modal>

      {/* ── DELETE CONFIRM ── */}
      <Modal open={!!deleteConfirm} onClose={() => setDeleteConfirm(null)} title="ยืนยันการลบ">
        <div className="space-y-4">
          <p className="text-sm text-gray-600 dark:text-gray-300">
            ลบรายการ <span className="font-semibold">"{deleteConfirm?.note || 'รายการนี้'}"</span> ถาวรใช่หรือไม่?
          </p>
          <div className="flex gap-3">
            <Button variant="secondary" fullWidth onClick={() => setDeleteConfirm(null)}>ยกเลิก</Button>
            <Button variant="danger" fullWidth onClick={async () => {
              const p = deleteConfirm!
              await deleteScheduledPayment(p.id)
              setDeleteConfirm(null)
              useSnackbar.getState().show('ลบรายการล่วงหน้าแล้ว', () => restoreScheduledPayment(p))
            }}>ลบ</Button>
          </div>
        </div>
      </Modal>

      {/* ── REACTIVATE MODAL ── */}
      <Modal open={!!reactivateTarget} onClose={() => setReactivateTarget(null)} title="นำกลับมา — เลือกวันกำหนดใหม่">
        <div className="space-y-4">
          <p className="text-sm text-gray-500">
            กำหนดเดิม: {reactivateTarget && format(reactivateTarget.dueDate, "d MMM yyyy · HH:mm", { locale: th })}
          </p>
          <div>
            <label className="text-xs text-gray-500 block mb-1">วันและเวลากำหนดใหม่</label>
            <input
              type="datetime-local"
              value={newDueDate}
              onChange={(e) => setNewDueDate(e.target.value)}
              className="w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm outline-none"
            />
          </div>
          <div className="flex gap-3">
            <Button variant="secondary" onClick={() => setReactivateTarget(null)}>ยกเลิก</Button>
            <Button fullWidth onClick={async () => {
              if (!newDueDate) return
              await reactivateScheduledPayment(reactivateTarget!, new Date(newDueDate))
              setReactivateTarget(null)
            }}>ยืนยัน</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
