import { useRef } from 'react'
import { Delete } from 'lucide-react'
import { OPERATORS, evaluateExpression } from '../../utils/calc'

interface Props {
  value: string
  onChange: (v: string) => void
}

// 4-column calculator layout. Operators in the right column, '=' spans the
// bottom. Digit grid order preserved from the old 3-col pad.
const KEYS = [
  '7', '8', '9', '÷',
  '4', '5', '6', '×',
  '1', '2', '3', '-',
  '.', '0', 'del', '+',
]

const TAP_THRESHOLD_PX = 8

function lastSegment(v: string): string {
  const m = v.match(/[\d.]*$/)
  return m ? m[0] : ''
}

export default function Numpad({ value, onChange }: Props) {
  const startRef = useRef<{ x: number; y: number } | null>(null)
  const maxMovePx = useRef(0)

  function press(key: string) {
    if (key === 'del') {
      onChange(value.length <= 1 ? '0' : value.slice(0, -1))
      return
    }
    if (key === '=') {
      onChange(String(evaluateExpression(value)))
      return
    }
    if ((OPERATORS as readonly string[]).includes(key)) {
      if (value === '0') return // don't begin with an operator
      const last = value[value.length - 1]
      if ((OPERATORS as readonly string[]).includes(last)) {
        onChange(value.slice(0, -1) + key) // replace a dangling operator
      } else {
        onChange(value + key)
      }
      return
    }
    if (key === '.') {
      const seg = lastSegment(value)
      if (seg.includes('.')) return
      onChange(seg === '' ? value + '0.' : value + '.')
      return
    }
    // digit
    const seg = lastSegment(value)
    const dec = seg.split('.')[1]
    if (dec !== undefined && dec.length >= 2) return // max 2 decimals per number
    if (value === '0') { onChange(key); return }
    if (seg === '0') { onChange(value.slice(0, -1) + key); return } // replace lone 0 after operator
    onChange(value + key)
  }

  return (
    <div>
      <div
        className="grid grid-cols-4 gap-2"
        onPointerMove={(e) => {
          if (!startRef.current) return
          const dx = Math.abs(e.clientX - startRef.current.x)
          const dy = Math.abs(e.clientY - startRef.current.y)
          maxMovePx.current = Math.max(maxMovePx.current, dx, dy)
        }}
      >
        {KEYS.map((k) => {
          const isOp = (OPERATORS as readonly string[]).includes(k)
          return (
            <button
              key={k}
              onPointerDown={(e) => { startRef.current = { x: e.clientX, y: e.clientY }; maxMovePx.current = 0 }}
              onPointerUp={() => {
                if (!startRef.current) return
                const moved = maxMovePx.current
                startRef.current = null
                maxMovePx.current = 0
                if (moved < TAP_THRESHOLD_PX) press(k)
              }}
              onPointerCancel={() => { startRef.current = null; maxMovePx.current = 0 }}
              className={`numpad-btn ${isOp ? '!bg-indigo-50 dark:!bg-indigo-950 text-indigo-600 dark:text-indigo-300' : ''}`}
            >
              {k === 'del' ? <Delete size={22} /> : k}
            </button>
          )
        })}
      </div>
      <button
        onPointerDown={(e) => { startRef.current = { x: e.clientX, y: e.clientY }; maxMovePx.current = 0 }}
        onPointerUp={() => {
          if (!startRef.current) return
          const moved = maxMovePx.current
          startRef.current = null
          maxMovePx.current = 0
          if (moved < TAP_THRESHOLD_PX) press('=')
        }}
        onPointerCancel={() => { startRef.current = null; maxMovePx.current = 0 }}
        onPointerMove={(e) => {
          if (!startRef.current) return
          const dx = Math.abs(e.clientX - startRef.current.x)
          const dy = Math.abs(e.clientY - startRef.current.y)
          maxMovePx.current = Math.max(maxMovePx.current, dx, dy)
        }}
        className="numpad-btn w-full mt-2 !bg-indigo-500 !text-white !active:bg-indigo-600"
      >
        =
      </button>
    </div>
  )
}
