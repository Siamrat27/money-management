import { formatAmount } from '../../utils/formatters'

interface Props {
  value: string
}

export default function AmountDisplay({ value }: Props) {
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
