interface Props {
  icon?: string
  label: string
  color?: string
}

export default function Badge({ icon, label, color = '#6366f1' }: Props) {
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
      style={{ backgroundColor: color + '22', color }}
    >
      {icon && <span>{icon}</span>}
      {label}
    </span>
  )
}
