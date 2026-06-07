import { useState, useRef } from 'react'
import { Plus, Edit2, Trash2, Download, Upload, AlertTriangle, Wallet, RefreshCcw, List, LogOut, RefreshCw } from 'lucide-react'
import { useTags, addTag, updateTag, deleteTag } from '../hooks/useTags'
import { useAppStore } from '../stores/useAppStore'
import { useAuthStore } from '../stores/useAuthStore'
import { pullFromCloud } from '../services/sync'
import { isSupabaseConfigured } from '../lib/supabase'
import Card from '../components/ui/Card'
import Modal from '../components/ui/Modal'
import Button from '../components/ui/Button'
import Header from '../components/layout/Header'
import { exportData, importData } from '../utils/exportImport'
import { db } from '../db/db'
import type { Tag, TagType } from '../types'

const TAG_TYPES: { value: TagType; label: string }[] = [
  { value: 'expense', label: 'รายจ่าย' },
  { value: 'income', label: 'รายรับ' },
  { value: 'both', label: 'ทั้งสอง' },
]
const COLORS = ['#f97316', '#3b82f6', '#ec4899', '#8b5cf6', '#10b981', '#22c55e', '#14b8a6', '#f59e0b', '#64748b', '#ef4444']
const ICONS_LIST = ['🍜', '🚌', '🛍️', '🎮', '🏥', '💼', '💰', '💡', '🏠', '🎓', '✈️', '🐾', '📱', '💊', '🎵', '⚽', '🎬', '📚', '🧴', '🌿']

export default function Settings() {
  const tags = useTags()
  const { setPage, setSubPage } = useAppStore()
  const { user, signOut, setSyncing, setSyncError } = useAuthStore()
  const [modal, setModal] = useState(false)
  const [editing, setEditing] = useState<Tag | null>(null)
  const [form, setForm] = useState({ name: '', color: COLORS[0], icon: ICONS_LIST[0], type: 'expense' as TagType })
  const fileRef = useRef<HTMLInputElement>(null)
  const [importStatus, setImportStatus] = useState<'idle' | 'success' | 'error'>('idle')

  async function handleManualSync() {
    if (!user || !isSupabaseConfigured) return
    setSyncing(true)
    try { await pullFromCloud(user.id) } catch (e) { setSyncError(String(e)) }
    setSyncing(false)
  }

  function openAdd() {
    setEditing(null)
    setForm({ name: '', color: COLORS[0], icon: ICONS_LIST[0], type: 'expense' })
    setModal(true)
  }

  function openEdit(t: Tag) {
    setEditing(t)
    setForm({ name: t.name, color: t.color, icon: t.icon, type: t.type })
    setModal(true)
  }

  async function handleSave() {
    if (!form.name.trim()) return
    if (editing) await updateTag(editing.id, form)
    else await addTag(form)
    setModal(false)
  }

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      await importData(file)
      setImportStatus('success')
      setTimeout(() => setImportStatus('idle'), 3000)
    } catch {
      setImportStatus('error')
      setTimeout(() => setImportStatus('idle'), 3000)
    }
    e.target.value = ''
  }

  async function handleClear() {
    if (!confirm('ลบข้อมูลทั้งหมด? ไม่สามารถย้อนกลับได้')) return
    await db.transaction('rw', db.accounts, db.tags, db.transactions, db.recurring, async () => {
      await db.transactions.clear()
      await db.recurring.clear()
    })
  }

  return (
    <div className="min-h-screen pb-nav">
      <Header title="ตั้งค่า" />

      <div className="max-w-lg mx-auto px-4 py-4 space-y-4">
        {/* Quick Nav */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { icon: List, label: 'รายการ', action: () => setSubPage('transactions') },
            { icon: Wallet, label: 'บัญชี', action: () => setSubPage('accounts') },
            { icon: RefreshCcw, label: 'ต่อเนื่อง', action: () => setSubPage('recurring') },
          ].map(({ icon: Icon, label, action }) => (
            <Card key={label} className="p-4 text-center cursor-pointer active:scale-[0.98] transition-transform" onClick={action}>
              <Icon size={24} className="mx-auto mb-1 text-indigo-500" />
              <p className="text-sm font-medium">{label}</p>
            </Card>
          ))}
        </div>

        {/* Tags */}
        <Card className="p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="font-semibold">หมวดหมู่</p>
            <button onClick={openAdd} className="flex items-center gap-1 text-sm text-indigo-500">
              <Plus size={16} /> เพิ่ม
            </button>
          </div>
          <div className="space-y-2">
            {tags.map((t) => (
              <div key={t.id} className="flex items-center gap-3 p-2 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center text-lg" style={{ backgroundColor: t.color + '22' }}>
                  {t.icon}
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium">{t.name}</p>
                  <p className="text-xs text-gray-400">{TAG_TYPES.find((x) => x.value === t.type)?.label}</p>
                </div>
                <button onClick={() => openEdit(t)} className="p-1.5 rounded-lg text-gray-400"><Edit2 size={14} /></button>
                <button onClick={() => deleteTag(t.id)} className="p-1.5 rounded-lg text-gray-400"><Trash2 size={14} /></button>
              </div>
            ))}
          </div>
        </Card>

        {/* Backup */}
        <Card className="p-4 space-y-3">
          <p className="font-semibold">ข้อมูล</p>
          <Button variant="secondary" fullWidth onClick={exportData}>
            <Download size={16} className="inline mr-2" />
            ส่งออกข้อมูล (JSON)
          </Button>
          <Button variant="secondary" fullWidth onClick={() => fileRef.current?.click()}>
            <Upload size={16} className="inline mr-2" />
            นำเข้าข้อมูล (JSON)
          </Button>
          <input ref={fileRef} type="file" accept=".json" className="hidden" onChange={handleImport} />
          {importStatus === 'success' && <p className="text-sm text-green-500 text-center">นำเข้าสำเร็จ ✓</p>}
          {importStatus === 'error' && <p className="text-sm text-red-500 text-center">เกิดข้อผิดพลาด กรุณาตรวจสอบไฟล์</p>}
        </Card>

        {/* Account / Sync */}
        {isSupabaseConfigured && user && (
          <Card className="p-4 space-y-3">
            <p className="font-semibold">บัญชีผู้ใช้</p>
            <p className="text-sm text-gray-500 truncate">{user.email}</p>
            <Button variant="secondary" fullWidth onClick={handleManualSync}>
              <RefreshCw size={16} className="inline mr-2" />
              ดึงข้อมูลจาก Cloud
            </Button>
            <Button variant="ghost" fullWidth onClick={signOut}>
              <LogOut size={16} className="inline mr-2" />
              ออกจากระบบ
            </Button>
          </Card>
        )}

        {/* Danger Zone */}
        <Card className="p-4 space-y-3 border border-red-100 dark:border-red-900">
          <div className="flex items-center gap-2 text-red-500">
            <AlertTriangle size={18} />
            <p className="font-semibold">โซนอันตราย</p>
          </div>
          <Button variant="danger" fullWidth onClick={handleClear}>ลบรายการทั้งหมด</Button>
        </Card>

        <p className="text-center text-xs text-gray-300 pb-4">PocketFlow v1.0 · {isSupabaseConfigured ? `☁️ ซิงค์ผ่าน Supabase` : '📱 โหมดใช้งานในเครื่อง'}</p>
      </div>

      {/* Tag Modal */}
      <Modal open={modal} onClose={() => setModal(false)} title={editing ? 'แก้ไขหมวดหมู่' : 'เพิ่มหมวดหมู่'}>
        <div className="space-y-4">
          <input type="text" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            placeholder="ชื่อหมวดหมู่..." className="w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm outline-none" />
          <div>
            <label className="text-xs text-gray-500 block mb-1">ใช้กับ</label>
            <div className="flex gap-2">
              {TAG_TYPES.map((t) => (
                <button key={t.value} onClick={() => setForm((f) => ({ ...f, type: t.value }))}
                  className={`px-3 py-1.5 rounded-xl text-sm border-2 ${form.type === t.value ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950 text-indigo-600' : 'border-gray-200 dark:border-gray-700'}`}>
                  {t.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">ไอคอน</label>
            <div className="flex gap-2 flex-wrap">
              {ICONS_LIST.map((ic) => (
                <button key={ic} onClick={() => setForm((f) => ({ ...f, icon: ic }))}
                  className={`w-9 h-9 rounded-xl text-lg border-2 ${form.icon === ic ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950' : 'border-gray-200 dark:border-gray-700'}`}>
                  {ic}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-2">สี</label>
            <div className="flex gap-2 flex-wrap">
              {COLORS.map((c) => (
                <button key={c} onClick={() => setForm((f) => ({ ...f, color: c }))}
                  className={`w-8 h-8 rounded-full border-4 ${form.color === c ? 'border-white ring-2 ring-offset-1 ring-gray-400 scale-110' : 'border-transparent'}`}
                  style={{ backgroundColor: c }} />
              ))}
            </div>
          </div>
          <div className="flex gap-3">
            <Button variant="secondary" onClick={() => setModal(false)}>ยกเลิก</Button>
            <Button fullWidth onClick={handleSave}>บันทึก</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
