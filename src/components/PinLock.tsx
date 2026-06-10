import { useState } from 'react'
import { Delete, Lock } from 'lucide-react'
import { verifyPin } from '../lib/pin'

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del']
const MAX_LEN = 6

interface Props {
  onUnlock: () => void
}

export default function PinLock({ onUnlock }: Props) {
  const [pin, setPinValue] = useState('')
  const [shake, setShake] = useState(false)

  async function press(key: string) {
    if (key === 'del') {
      setPinValue((p) => p.slice(0, -1))
      return
    }
    if (!key || pin.length >= MAX_LEN) return
    const next = pin + key
    setPinValue(next)
    if (next.length >= 4) {
      // verify on every keystroke from 4 digits up so 4-6 digit PINs all work
      if (await verifyPin(next)) {
        onUnlock()
      } else if (next.length === MAX_LEN) {
        setShake(true)
        setTimeout(() => { setPinValue(''); setShake(false) }, 450)
      }
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 dark:bg-gray-900 px-8">
      <div className="w-16 h-16 rounded-3xl bg-indigo-500 text-white flex items-center justify-center mb-5 shadow-lg shadow-indigo-500/30">
        <Lock size={26} />
      </div>
      <p className="font-semibold mb-1">ใส่รหัส PIN</p>
      <p className="text-xs text-gray-400 mb-6">เพื่อปลดล็อค PocketFlow</p>

      {/* Dots */}
      <div className={`flex gap-3 mb-8 ${shake ? 'animate-bounce text-red-500' : ''}`}>
        {Array.from({ length: MAX_LEN }).map((_, i) => (
          <span
            key={i}
            className={`w-3.5 h-3.5 rounded-full border-2 transition-colors ${
              i < pin.length
                ? shake ? 'bg-red-500 border-red-500' : 'bg-indigo-500 border-indigo-500'
                : 'border-gray-300 dark:border-gray-600'
            }`}
          />
        ))}
      </div>

      {/* Keypad */}
      <div className="grid grid-cols-3 gap-3 w-full max-w-[260px]">
        {KEYS.map((k, i) => (
          k === '' ? <div key={i} /> : (
            <button
              key={i}
              onClick={() => press(k)}
              className="h-16 rounded-2xl bg-white dark:bg-gray-800 text-xl font-semibold active:bg-gray-100 dark:active:bg-gray-700 flex items-center justify-center select-none"
              style={{ touchAction: 'manipulation' }}
            >
              {k === 'del' ? <Delete size={22} /> : k}
            </button>
          )
        ))}
      </div>
    </div>
  )
}
