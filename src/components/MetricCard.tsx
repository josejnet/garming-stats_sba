interface MetricCardProps {
  label: string
  value: string | number
  unit?: string
  sub?: string
  color?: string
  large?: boolean
}

export default function MetricCard({ label, value, unit, sub, color, large }: MetricCardProps) {
  return (
    <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl px-3.5 py-3 flex flex-col gap-0.5">
      <div className="text-[11px] text-slate-500 uppercase tracking-wider">{label}</div>
      <div className={`font-bold tabular-nums leading-none ${large ? 'text-4xl' : 'text-xl'}`} style={color ? { color } : {}}>
        {value}
        {unit && <span className="text-xs font-normal text-slate-400 ml-1">{unit}</span>}
      </div>
      {sub && <div className="text-[11px] text-slate-500 mt-0.5">{sub}</div>}
    </div>
  )
}
