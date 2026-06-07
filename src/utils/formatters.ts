export function formatAmount(amount: number, showSign = false): string {
  const formatted = new Intl.NumberFormat('th-TH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Math.abs(amount))
  if (showSign && amount > 0) return `+${formatted}`
  if (showSign && amount < 0) return `-${formatted}`
  return formatted
}

export function formatCurrency(amount: number): string {
  return `฿${formatAmount(amount)}`
}

export function formatAmountInput(raw: string): string {
  const num = parseFloat(raw)
  if (isNaN(num)) return '0.00'
  return formatAmount(num)
}
