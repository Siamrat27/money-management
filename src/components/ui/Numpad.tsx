import { useRef } from 'react'
import { Delete } from 'lucide-react'

interface Props {
  value: string
  onChange: (v: string) => void
}

const KEYS = ['7', '8', '9', '4', '5', '6', '1', '2', '3', '.', '0', 'del']

// Max movement (px) allowed for a pointer gesture to count as a tap.
// If the finger moves more than this at ANY point during the press → not a tap.
const TAP_THRESHOLD_PX = 8

export default function Numpad({ value, onChange }: Props) {
  const startRef = useRef<{ x: number; y: number } | null>(null)
  const maxMovePx = useRef(0)

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
    <div
      className="grid grid-cols-3 gap-2"
      // Track max movement via bubbled pointerMove from whichever button
      // has implicit pointer capture — catches scrolls that start on a button.
      onPointerMove={(e) => {
        if (!startRef.current) return
        const dx = Math.abs(e.clientX - startRef.current.x)
        const dy = Math.abs(e.clientY - startRef.current.y)
        maxMovePx.current = Math.max(maxMovePx.current, dx, dy)
      }}
    >
      {KEYS.map((k) => (
        <button
          key={k}
          onPointerDown={(e) => {
            // Record where this press started (no preventDefault — allows scroll)
            startRef.current = { x: e.clientX, y: e.clientY }
            maxMovePx.current = 0
          }}
          onPointerUp={() => {
            // Only fire if press originated HERE and finger barely moved
            if (!startRef.current) return
            const moved = maxMovePx.current
            startRef.current = null
            maxMovePx.current = 0
            if (moved < TAP_THRESHOLD_PX) press(k)
          }}
          onPointerCancel={() => {
            // Browser took over (scroll gesture, multi-touch, etc.) — discard
            startRef.current = null
            maxMovePx.current = 0
          }}
          className="numpad-btn"
        >
          {k === 'del' ? <Delete size={22} /> : k}
        </button>
      ))}
    </div>
  )
}
