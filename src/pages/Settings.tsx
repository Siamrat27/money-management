import { useState, useRef, useEffect } from 'react'
import { APP_VERSION } from '../version'
import { Plus, Edit2, Trash2, Download, Upload, AlertTriangle, Wallet, RefreshCcw, List, LogOut, RefreshCw, Zap, Bell } from 'lucide-react'
import IconDisplay from '../components/ui/IconDisplay'
import { uploadIcon, isUrlIcon } from '../lib/storage'
import { useTags, addTag, updateTag, deleteTag } from '../hooks/useTags'
import { useAccounts } from '../hooks/useAccounts'
import { usePresets, addPreset, deletePreset } from '../hooks/usePresets'
import { useUserSettings, saveUserSettings } from '../hooks/useSettings'
import { useAppStore } from '../stores/useAppStore'
import { useAuthStore } from '../stores/useAuthStore'
import { pullFromCloud } from '../services/sync'
import { isSupabaseConfigured } from '../lib/supabase'
import { sendTestDiscord } from '../lib/discord'
import Card from '../components/ui/Card'
import Modal from '../components/ui/Modal'
import Button from '../components/ui/Button'
import Header from '../components/layout/Header'
import { formatAmount } from '../utils/formatters'
import { exportData, importData } from '../utils/exportImport'
import { db } from '../db/db'
import type { Tag, TagType, TransactionType } from '../types'

const TAG_TYPES: { value: TagType; label: string }[] = [
  { value: 'expense', label: 'รายจ่าย' },
  { value: 'income', label: 'รายรับ' },
  { value: 'both', label: 'ทั้งสอง' },
]
const COLORS = ['#f97316', '#3b82f6', '#ec4899', '#8b5cf6', '#10b981', '#22c55e', '#14b8a6', '#f59e0b', '#64748b', '#ef4444']
const ICONS_LIST = ['🍜', '🚌', '🛍️', '🎮', '🏥', '💼', '💰', '💡', '🏠', '🎓', '✈️', '🐾', '📱', '💊', '🎵', '⚽', '🎬', '📚', '🧴', '🌿']

export default function Settings() {
  const tags = useTags()
  const accounts = useAccounts()
  const presets = usePresets()
  const { setPage, setSubPage } = useAppStore()
  const { user, signOut, setSyncing, setSyncError } = useAuthStore()

  // Tag modal
  const [modal, setModal] = useState(false)
  const [editing, setEditing] = useState<Tag | null>(null)
  const [form, setForm] = useState({ name: '', color: COLORS[0], icon: ICONS_LIST[0], type: 'expense' as TagType, monthlyBudget: '' })

  // Preset modal
  const [presetModal, setPresetModal] = useState(false)
  const [presetForm, setPresetForm] = useState({
    name: '', type: 'expense' as TransactionType, amount: '',
    accountId: '', toAccountId: '', tagId: '', note: '',
  })

  const userSettings = useUserSettings()
  const [discordInput, setDiscordInput] = useState('')
  const [discordStatus, setDiscordStatus] = useState<'idle' | 'saving' | 'saved' | 'testing' | 'ok' | 'fail'>('idle')

  useEffect(() => {
    setDiscordInput(userSettings?.discordWebhook ?? '')
  }, [userSettings?.discordWebhook])

  const fileRef = useRef<HTMLInputElement>(null)
  const [importStatus, setImportStatus] = useState<'idle' | 'success' | 'error'>('idle')
  const [iconUploading, setIconUploading] = useState(false)

  async function handleTagIconUpload(e: React.ChangeEvent<HTMLInputElement>) {
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

  async function handleManualSync() {
    if (!user || !isSupabaseConfigured) return
    setSyncing(true)
    try { await pullFromCloud(user.id) } catch (e) { setSyncError(String(e)) }
    setSyncing(false)
  }

  function openAdd() {
    setEditing(null)
    setForm({ name: '', color: COLORS[0], icon: ICONS_LIST[0], type: 'expense', monthlyBudget: '' })
    setModal(true)
  }

  function openEdit(t: Tag) {
    setEditing(t)
    setForm({ name: t.name, color: t.color, icon: t.icon, type: t.type, monthlyBudget: t.monthlyBudget ? String(t.monthlyBudget) : '' })
    setModal(true)
  }

  async function handleSave() {
    if (!form.name.trim()) return
    const budget = form.monthlyBudget ? parseFloat(form.monthlyBudget) : undefined
    const data = { name: form.name, color: form.color, icon: form.icon, type: form.type, monthlyBudget: budget }
    if (editing) await updateTag(editing.id, data)
    else await addTag(data)
    setModal(false)
  }

  async function handleSaveDiscord() {
    setDiscordStatus('saving')
    await saveUserSettings({ discordWebhook: discordInput.trim() || undefined })
    setDiscordStatus('saved')
    setTimeout(() => setDiscordStatus('idle'), 2000)
  }

  async function handleTestDiscord() {
    if (!discordInput.trim()) return
    setDiscordStatus('testing')
    const ok = await sendTestDiscord(discordInput.trim())
    setDiscordStatus(ok ? 'ok' : 'fail')
    setTimeout(() => setDiscordStatus('idle'), 3000)
  }

  function openAddPreset() {
    setPresetForm({ name: '', type: 'expense', amount: '', accountId: accounts[0]?.id ?? '', toAccountId: '', tagId: '', note: '' })
    setPresetModal(true)
  }

  async function handleSavePreset() {
    const amt = parseFloat(presetForm.amount)
    if (!presetForm.name.trim() || !amt || !presetForm.accountId) return
    await addPreset({
      name: presetForm.name, type: presetForm.type, amount: amt,
      accountId: presetForm.accountId,
      toAccountId: presetForm.type === 'transfer' ? presetForm.toAccountId || undefined : undefined,
      tagId: presetForm.tagId || undefined,
      note: presetForm.note,
    })
    setPresetModal(false)
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
                <div className="w-9 h-9 rounded-xl flex items-center justify-center text-lg overflow-hidden" style={{ backgroundColor: t.color + '22' }}>
                  <IconDisplay icon={t.icon} />
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

        {/* Presets */}
        <Card className="p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Zap size={18} className="text-indigo-500" />
              <p className="font-semibold">รายการด่วน (Presets)</p>
            </div>
            <button onClick={openAddPreset} className="flex items-center gap-1 text-sm text-indigo-500">
              <Plus size={16} /> เพิ่ม
            </button>
          </div>
          {presets.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-2">ยังไม่มี preset — กด + เพื่อเพิ่ม</p>
          ) : (
            <div className="space-y-2">
              {presets.map((p) => {
                const acc = accounts.find((a) => a.id === p.accountId)
                const tag = tags.find((t) => t.id === p.tagId)
                return (
                  <div key={p.id} className="flex items-center gap-3 p-2 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800">
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center text-lg bg-indigo-50 dark:bg-indigo-950">
                      {tag?.icon ?? (p.type === 'income' ? '💰' : p.type === 'transfer' ? '↔️' : '💸')}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{p.name}</p>
                      <p className="text-xs text-gray-400">
                        {p.type === 'income' ? '+' : p.type === 'transfer' ? '' : '-'}฿{formatAmount(p.amount)} · {acc?.name ?? ''}
                      </p>
                    </div>
                    <button onClick={() => deletePreset(p.id)} className="p-1.5 rounded-lg text-gray-400"><Trash2 size={14} /></button>
                  </div>
                )
              })}
            </div>
          )}
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

        {/* Discord Notifications */}
        <Card className="p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Bell size={18} className="text-indigo-500" />
            <p className="font-semibold">แจ้งเตือน Discord</p>
          </div>
          <p className="text-xs text-gray-400">วาง Webhook URL จาก Discord เพื่อรับแจ้งเตือนทุก transaction และเมื่อเกินงบประมาณ</p>
          <div className="space-y-2">
            <input
              type="url"
              value={discordInput}
              onChange={(e) => { setDiscordInput(e.target.value); setDiscordStatus('idle') }}
              placeholder="https://discord.com/api/webhooks/..."
              className="w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm outline-none focus:border-indigo-400 font-mono"
            />
            <div className="flex gap-2">
              <Button
                variant="secondary"
                onClick={handleTestDiscord}
                className="flex-1 text-sm"
              >
                {discordStatus === 'testing' ? '⏳ กำลังทดสอบ...' : '🔔 ทดสอบ'}
              </Button>
              <Button
                fullWidth
                onClick={handleSaveDiscord}
                className="flex-1 text-sm"
              >
                {discordStatus === 'saving' ? 'กำลังบันทึก...' : 'บันทึก'}
              </Button>
            </div>
            {discordStatus === 'saved' && <p className="text-xs text-green-500 text-center">✓ บันทึกแล้ว</p>}
            {discordStatus === 'ok' && <p className="text-xs text-green-500 text-center">✅ ส่งสำเร็จ! เช็ค Discord ได้เลย</p>}
            {discordStatus === 'fail' && <p className="text-xs text-red-500 text-center">❌ ส่งไม่ได้ — ตรวจสอบ URL อีกครั้ง</p>}
          </div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-3 space-y-1">
            <p className="text-xs font-medium text-gray-500">วิธีสร้าง Webhook URL:</p>
            <p className="text-xs text-gray-400">Discord → Channel Settings → Integrations → Webhooks → New Webhook → Copy URL</p>
          </div>
        </Card>

        {/* Danger Zone */}
        <Card className="p-4 space-y-3 border border-red-100 dark:border-red-900">
          <div className="flex items-center gap-2 text-red-500">
            <AlertTriangle size={18} />
            <p className="font-semibold">โซนอันตราย</p>
          </div>
          <Button variant="danger" fullWidth onClick={handleClear}>ลบรายการทั้งหมด</Button>
        </Card>

        <p className="text-center text-xs text-gray-300 pb-4">PocketFlow v{APP_VERSION} · {isSupabaseConfigured ? `☁️ ซิงค์ผ่าน Supabase` : '📱 โหมดใช้งานในเครื่อง'}</p>
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
          {(form.type === 'expense' || form.type === 'both') && (
            <div>
              <label className="text-xs text-gray-500 block mb-1">งบประมาณต่อเดือน (ไม่บังคับ)</label>
              <div className="relative">
                <span className="absolute left-3 top-2.5 text-sm text-gray-400">฿</span>
                <input type="number" value={form.monthlyBudget} onChange={(e) => setForm((f) => ({ ...f, monthlyBudget: e.target.value }))}
                  placeholder="0" className="w-full pl-7 pr-4 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm outline-none" />
              </div>
            </div>
          )}
          <div>
            <label className="text-xs text-gray-500 block mb-1">ไอคอน</label>
            <div className="flex gap-2 flex-wrap">
              {ICONS_LIST.map((ic) => (
                <button key={ic} onClick={() => setForm((f) => ({ ...f, icon: ic }))}
                  className={`w-9 h-9 rounded-xl text-lg border-2 ${form.icon === ic ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950' : 'border-gray-200 dark:border-gray-700'}`}>
                  {ic}
                </button>
              ))}
              {isUrlIcon(form.icon) && (
                <div className="w-9 h-9 rounded-xl border-2 border-indigo-500 overflow-hidden">
                  <img src={form.icon} className="w-full h-full object-cover" alt="" />
                </div>
              )}
              <label className={`w-9 h-9 rounded-xl border-2 border-dashed border-gray-300 dark:border-gray-600 flex items-center justify-center cursor-pointer hover:border-indigo-400 transition-colors ${iconUploading ? 'opacity-50 pointer-events-none' : ''}`}>
                {iconUploading ? <span className="text-xs text-gray-400">...</span> : <Plus size={14} className="text-gray-400" />}
                <input type="file" accept="image/*" className="hidden" onChange={handleTagIconUpload} />
              </label>
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

      {/* Preset Modal */}
      <Modal open={presetModal} onClose={() => setPresetModal(false)} title="เพิ่มรายการด่วน">
        <div className="space-y-4">
          <input type="text" value={presetForm.name} onChange={(e) => setPresetForm((f) => ({ ...f, name: e.target.value }))}
            placeholder="ชื่อ preset เช่น ค่ากาแฟ..." className="w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm outline-none" />
          <div className="flex bg-gray-100 dark:bg-gray-800 rounded-2xl p-1 gap-1">
            {(['expense', 'income', 'transfer'] as TransactionType[]).map((t) => (
              <button key={t} onClick={() => setPresetForm((f) => ({ ...f, type: t, tagId: '', toAccountId: '' }))}
                className={`flex-1 py-2 rounded-xl text-xs font-semibold ${presetForm.type === t ? (t === 'income' ? 'bg-green-500 text-white' : t === 'expense' ? 'bg-red-500 text-white' : 'bg-blue-500 text-white') : 'text-gray-500'}`}>
                {t === 'income' ? 'รายรับ' : t === 'expense' ? 'รายจ่าย' : 'โอน'}
              </button>
            ))}
          </div>
          <div className="relative">
            <span className="absolute left-3 top-2.5 text-sm text-gray-400">฿</span>
            <input type="number" value={presetForm.amount} onChange={(e) => setPresetForm((f) => ({ ...f, amount: e.target.value }))}
              placeholder="จำนวนเงิน" className="w-full pl-7 pr-4 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm outline-none" />
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">บัญชี{presetForm.type === 'transfer' ? ' (จาก)' : ''}</label>
            <div className="flex gap-2 flex-wrap">
              {accounts.map((a) => (
                <button key={a.id} onClick={() => setPresetForm((f) => ({ ...f, accountId: a.id }))}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm border-2 ${presetForm.accountId === a.id ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950 text-indigo-600' : 'border-gray-200 dark:border-gray-700'}`}>
                  {isUrlIcon(a.icon) ? <img src={a.icon} className="w-4 h-4 rounded object-cover flex-shrink-0" alt="" /> : a.icon} {a.name}
                </button>
              ))}
            </div>
          </div>
          {presetForm.type === 'transfer' && (
            <div>
              <label className="text-xs text-gray-500 block mb-1">บัญชีปลายทาง</label>
              <div className="flex gap-2 flex-wrap">
                {accounts.filter((a) => a.id !== presetForm.accountId).map((a) => (
                  <button key={a.id} onClick={() => setPresetForm((f) => ({ ...f, toAccountId: a.id }))}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm border-2 ${presetForm.toAccountId === a.id ? 'border-blue-500 bg-blue-50 dark:bg-blue-950 text-blue-600' : 'border-gray-200 dark:border-gray-700'}`}>
                    {isUrlIcon(a.icon) ? <img src={a.icon} className="w-4 h-4 rounded object-cover flex-shrink-0" alt="" /> : a.icon} {a.name}
                  </button>
                ))}
              </div>
            </div>
          )}
          {presetForm.type !== 'transfer' && (
            <div>
              <label className="text-xs text-gray-500 block mb-1">หมวดหมู่ (ไม่บังคับ)</label>
              <div className="flex gap-2 flex-wrap">
                {tags.filter((t) => presetForm.type === 'income' ? t.type !== 'expense' : t.type !== 'income').map((t) => (
                  <button key={t.id} onClick={() => setPresetForm((f) => ({ ...f, tagId: f.tagId === t.id ? '' : t.id }))}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm border-2 ${presetForm.tagId === t.id ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950 text-indigo-600' : 'border-gray-200 dark:border-gray-700'}`}>
                    {isUrlIcon(t.icon) ? <img src={t.icon} className="w-4 h-4 rounded object-cover flex-shrink-0" alt="" /> : t.icon} {t.name}
                  </button>
                ))}
              </div>
            </div>
          )}
          <input type="text" value={presetForm.note} onChange={(e) => setPresetForm((f) => ({ ...f, note: e.target.value }))}
            placeholder="บันทึก (ไม่บังคับ)..." className="w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm outline-none" />
          <div className="flex gap-3">
            <Button variant="secondary" onClick={() => setPresetModal(false)}>ยกเลิก</Button>
            <Button fullWidth onClick={handleSavePreset}>บันทึก</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
