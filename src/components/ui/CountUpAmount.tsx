import { useEffect, useRef, useState } from 'react'
import { formatAmount } from '../../utils/formatters'

const prefersReduced = () =>
  typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

const easeOut = (t: number) => 1 - Math.pow(1 - t, 3)

// Animates a number from its current displayed value toward `target`.
// Smoothly handles interruptions (value changing mid-animation) and respects
// the user's reduced-motion preference.
export function useCountUp(target: number, duration = 700): number {
  const reduced = prefersReduced()
  const [val, setVal] = useState(reduced ? target : 0)
  const currentRef = useRef(reduced ? target : 0)
  const rafRef = useRef<number | null>(null)

  useEffect(() => {
    if (reduced) { currentRef.current = target; setVal(target); return }
    const from = currentRef.current
    if (Math.abs(from - target) < 0.005) { currentRef.current = target; setVal(target); return }
    const start = performance.now()
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / duration)
      const v = from + (target - from) * easeOut(p)
      currentRef.current = v
      setVal(v)
      if (p < 1) rafRef.current = requestAnimationFrame(tick)
      else { currentRef.current = target; setVal(target); rafRef.current = null }
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }
  }, [target, duration, reduced])

  return val
}

export default function CountUpAmount({ value, className }: { value: number; className?: string }) {
  const v = useCountUp(value)
  return <span className={className}>{formatAmount(v)}</span>
}
