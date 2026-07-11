import { useState } from 'react'
import { Lock } from 'lucide-react'
import { hasPin, setPin, clearPin, verifyPin } from '@/lib/pin'
import Card from '@/components/ui/Card'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'

const inputCls = 'w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm outline-none tracking-widest'

// Central device PIN — locks the whole Life Management app (all sub-apps).
// Shown on the app selector screen so it lives above any single app.
export default function PinSettings() {
  const [pinEnabled, setPinEnabled] = useState(hasPin())
  const [pinModal, setPinModal] = useState<'set' | 'remove' | null>(null)
  const [pinCurrent, setPinCurrent] = useState('')
  const [pinNew, setPinNew] = useState('')
  const [pinConfirmInput, setPinConfirmInput] = useState('')
  const [pinError, setPinError] = useState('')

  function openPinModal(mode: 'set' | 'remove') {
    setPinCurrent(''); setPinNew(''); setPinConfirmInput(''); setPinError('')
    setPinModal(mode)
  }

  async function handlePinSave() {
    setPinError('')
    if (pinEnabled) {
      if (!(await verifyPin(pinCurrent))) { setPinError('PIN ปัจจุบันไม่ถูกต้อง'); return }
    }
    if (pinModal === 'remove') {
      clearPin()
      setPinEnabled(false)
      setPinModal(null)
      return
    }
    if (!/^\d{4,6}$/.test(pinNew)) { setPinError('PIN ต้องเป็นตัวเลข 4-6 หลัก'); return }
    if (pinNew !== pinConfirmInput) { setPinError('PIN ใหม่ไม่ตรงกัน'); return }
    await setPin(pinNew)
    setPinEnabled(true)
    setPinModal(null)
  }

  return (
    <>
      <Card className="p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Lock size={18} className="text-indigo-500" />
          <p className="font-semibold">ความปลอดภัย</p>
        </div>
        <p className="text-xs text-gray-400">
          ตั้ง PIN เพื่อล็อคทุกแอปบนเครื่องนี้ — จะถามตอนเปิดแอป และเมื่อพับแอปไว้เกิน 5 นาที
        </p>
        {pinEnabled ? (
          <div className="flex gap-2">
            <Button variant="secondary" fullWidth onClick={() => openPinModal('set')}>เปลี่ยน PIN</Button>
            <Button variant="ghost" fullWidth onClick={() => openPinModal('remove')}>ปิดใช้งาน</Button>
          </div>
        ) : (
          <Button variant="secondary" fullWidth onClick={() => openPinModal('set')}>
            <Lock size={15} className="inline mr-2" />
            ตั้ง PIN ล็อคแอป
          </Button>
        )}
      </Card>

      <Modal open={!!pinModal} onClose={() => setPinModal(null)}
        title={pinModal === 'remove' ? 'ปิดใช้งาน PIN' : pinEnabled ? 'เปลี่ยน PIN' : 'ตั้ง PIN'}>
        <div className="space-y-4">
          {pinEnabled && (
            <div>
              <label className="text-xs text-gray-500 block mb-1">PIN ปัจจุบัน</label>
              <input
                type="password" inputMode="numeric" maxLength={6} value={pinCurrent}
                onChange={(e) => setPinCurrent(e.target.value.replace(/\D/g, ''))}
                className={inputCls}
              />
            </div>
          )}
          {pinModal === 'set' && (
            <>
              <div>
                <label className="text-xs text-gray-500 block mb-1">PIN ใหม่ (ตัวเลข 4-6 หลัก)</label>
                <input
                  type="password" inputMode="numeric" maxLength={6} value={pinNew}
                  onChange={(e) => setPinNew(e.target.value.replace(/\D/g, ''))}
                  className={inputCls}
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">ยืนยัน PIN ใหม่</label>
                <input
                  type="password" inputMode="numeric" maxLength={6} value={pinConfirmInput}
                  onChange={(e) => setPinConfirmInput(e.target.value.replace(/\D/g, ''))}
                  className={inputCls}
                />
              </div>
            </>
          )}
          {pinModal === 'remove' && (
            <p className="text-sm text-gray-600 dark:text-gray-300">ยืนยันการปิดใช้งาน PIN ล็อคแอป?</p>
          )}
          {pinError && <p className="text-xs text-red-500">⚠️ {pinError}</p>}
          <div className="flex gap-3">
            <Button variant="secondary" onClick={() => setPinModal(null)}>ยกเลิก</Button>
            <Button fullWidth variant={pinModal === 'remove' ? 'danger' : undefined} onClick={handlePinSave}>
              {pinModal === 'remove' ? 'ปิดใช้งาน' : 'บันทึก'}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  )
}
