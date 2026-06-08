import { useRef } from 'react'
import { Delete } from 'lucide-react'

interface Props {
  value: string
  onChange: (v: string) => void
}

const KEYS = ['7', '8', '9', '4', '5', '6', '1', '2', '3', '.', '0', 'del']

export default function Numpad({ value, onChange }: Props) {
  const startPos = useRef<{ x: number; y: number } | null>(null)

  function press(key: string) {
    if (key === 'del') {
      onChange(value.length <= 1 ? '0' : value.slice(0, -1))
      return
    }
    if (key === '.' && value.includes('.')) return
    const parts = value.split('.')
    if (parts[1] !== undefined && parts[1].length >= 2) return
    const next = value === '0' && key !== '.' ? key : value + key
    onChange(next)
  }

  return (
    <div className="grid grid-cols-3 gap-2">
      {KEYS.map((k) => (
        <button
          key={k}
          onPointerDown={(e) => {
            // record start position — do NOT preventDefault so scroll gestures can fire pointercancel
            startPos.current = { x: e.clientX, y: e.clientY }
          }}
          onPointerUp={(e) => {
            if (!startPos.current) return
            const dx = Math.abs(e.clientX - startPos.current.x)
            const dy = Math.abs(e.clientY - startPos.current.y)
            startPos.current = null
            // only fire if finger barely moved (tap, not scroll)
            if (dx < 10 && dy < 10) press(k)
          }}
          onPointerCancel={() => {
            // browser took over (scroll gesture, etc.) — discard
            startPos.current = null
          }}
          className="numpad-btn"
        >
          {k === 'del' ? <Delete size={22} /> : k}
        </button>
      ))}
    </div>
  )
}
