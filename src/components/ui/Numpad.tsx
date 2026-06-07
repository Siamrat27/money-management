import { Delete } from 'lucide-react'

interface Props {
  value: string
  onChange: (v: string) => void
}

const KEYS = ['7', '8', '9', '4', '5', '6', '1', '2', '3', '.', '0', 'del']

export default function Numpad({ value, onChange }: Props) {
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
          onPointerDown={(e) => { e.preventDefault(); press(k) }}
          className="numpad-btn"
        >
          {k === 'del' ? <Delete size={22} /> : k}
        </button>
      ))}
    </div>
  )
}
