import { useActivityStore } from '../stores/activityStore'

interface Props {
  tsb: number
}

export default function FormBadge({ tsb }: Props) {
  const theme = useActivityStore(s => s.settings.theme)
  if (tsb > 10) return <Badge color="emerald" label="Descansado" theme={theme} />
  if (tsb > -5) return <Badge color="blue" label="Forma optima" theme={theme} />
  if (tsb > -15) return <Badge color="amber" label="Entrenando fuerte" theme={theme} />
  if (tsb > -25) return <Badge color="orange" label="Acumulando fatiga" theme={theme} />
  return <Badge color="rose" label="Descansa ya" theme={theme} />
}

const DARK_PALETTE: Record<string, { border: string; bg: string; text: string }> = {
  emerald: { border: '#22c55e40', bg: '#22c55e15', text: '#86efac' },
  blue: { border: '#3b82f640', bg: '#3b82f615', text: '#93c5fd' },
  amber: { border: '#f59e0b40', bg: '#f59e0b15', text: '#fcd34d' },
  orange: { border: '#f9731640', bg: '#f9731615', text: '#fdba74' },
  rose: { border: '#f43f5e40', bg: '#f43f5e15', text: '#fca5a5' },
}

const LIGHT_PALETTE: typeof DARK_PALETTE = {
  emerald: { border: '#05966955', bg: '#d1fae5', text: '#047857' },
  blue: { border: '#2563eb55', bg: '#dbeafe', text: '#1d4ed8' },
  amber: { border: '#d9770655', bg: '#fef3c7', text: '#92400e' },
  orange: { border: '#ea580c55', bg: '#ffedd5', text: '#9a3412' },
  rose: { border: '#e11d4855', bg: '#ffe4e6', text: '#be123c' },
}

function Badge({ color, label, theme }: { color: string; label: string; theme: 'dark' | 'light' }) {
  const p = theme === 'light' ? LIGHT_PALETTE[color] : DARK_PALETTE[color]
  return (
    <span
      className="px-2.5 py-1 rounded-full text-xs font-bold border"
      style={{ borderColor: p.border, background: p.bg, color: p.text }}
    >
      {label}
    </span>
  )
}
