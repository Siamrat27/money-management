import { formatAmount } from '../../utils/formatters'
import { hasOperator, evaluateExpression } from '../../utils/calc'

interface Props {
  value: string
}

export default function AmountDisplay({ value }: Props) {
  // While an expression is being typed, show it with a live result preview
  if (hasOperator(value)) {
    return (
      <div className="text-center py-4 select-none">
        <div className="text-3xl font-bold tabular-nums break-all">{value}</div>
        <div className="text-sm text-gray-400 mt-1">= ฿{formatAmount(evaluateExpression(value))}</div>
      </div>
    )
  }
  const [int, dec] = formatAmount(parseFloat(value) || 0).split('.')
  return (
    <div className="text-center py-4 select-none">
      <div className="flex items-baseline justify-center gap-1">
        <span className="text-2xl font-light text-gray-400">฿</span>
        <span className="text-5xl font-bold tabular-nums">{int}</span>
        <span className="text-2xl font-semibold text-gray-400">.{dec}</span>
      </div>
    </div>
  )
}
