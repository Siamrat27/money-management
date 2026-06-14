// Tiny safe arithmetic evaluator for the numpad. Supports + - × ÷ with
// correct precedence (× ÷ before + -). No eval(); tokenizes manually.
// Inputs come only from the numpad so the grammar is constrained.

export const OPERATORS = ['+', '-', '×', '÷'] as const

export function hasOperator(expr: string): boolean {
  return /[+\-×÷]/.test(expr)
}

export function evaluateExpression(expr: string): number {
  if (!expr) return 0
  // normalize glyphs and drop any trailing operator / dot the user left dangling
  let s = expr.replace(/×/g, '*').replace(/÷/g, '/').replace(/[+\-*/.]+$/, '')
  if (!s) return 0

  const tokens = s.match(/(\d+\.?\d*)|[+\-*/]/g)
  if (!tokens) return 0

  // pass 1: resolve * and /
  const reduced: (number | string)[] = []
  let i = 0
  while (i < tokens.length) {
    const t = tokens[i]
    if (t === '*' || t === '/') {
      const prev = reduced.pop() as number
      const next = parseFloat(tokens[++i] ?? '0')
      reduced.push(t === '*' ? prev * next : next === 0 ? 0 : prev / next)
    } else if (t === '+' || t === '-') {
      reduced.push(t)
    } else {
      reduced.push(parseFloat(t))
    }
    i++
  }

  // pass 2: resolve + and - left to right
  let result = (reduced[0] as number) ?? 0
  for (let j = 1; j < reduced.length; j += 2) {
    const op = reduced[j] as string
    const val = (reduced[j + 1] as number) ?? 0
    result = op === '+' ? result + val : result - val
  }

  if (!isFinite(result)) return 0
  return Math.round(result * 100) / 100
}
