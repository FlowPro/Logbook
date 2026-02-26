// Meteorological sky-coverage (oktas) picker – 0 (clear) to 8 (overcast)
// Each tile shows the standard clockwise-fill symbol

function OktasSymbol({ value, size = 28 }: { value: number; size?: number }) {
  const r = size / 2 - 2
  const cx = size / 2
  const cy = size / 2

  if (value === 0) {
    return (
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={cx} cy={cy} r={r} fill="white" stroke="#94a3b8" strokeWidth="1.5" />
      </svg>
    )
  }

  if (value === 8) {
    return (
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={cx} cy={cy} r={r} fill="#475569" />
      </svg>
    )
  }

  // Partial fill: arc from 12 o'clock clockwise for value/8 of the circle
  const angle = (value / 8) * 360
  const rad = ((angle - 90) * Math.PI) / 180
  const x = cx + r * Math.cos(rad)
  const y = cy + r * Math.sin(rad)
  const largeArc = angle > 180 ? 1 : 0

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={cx} cy={cy} r={r} fill="white" stroke="#94a3b8" strokeWidth="1.5" />
      <path
        d={`M ${cx} ${cy} L ${cx} ${cy - r} A ${r} ${r} 0 ${largeArc} 1 ${x} ${y} Z`}
        fill="#475569"
      />
    </svg>
  )
}

const OKTAS_LABELS = ['0/8', '1/8', '2/8', '3/8', '4/8', '5/8', '6/8', '7/8', '8/8']

interface OktasPickerProps {
  label?: string
  value?: number
  onChange?: (v: number) => void
  readOnly?: boolean
}

export function OktasPicker({ label, value, onChange, readOnly }: OktasPickerProps) {
  return (
    <div>
      {label && <p className="label">{label}</p>}
      <div className="flex gap-1 flex-wrap">
        {OKTAS_LABELS.map((lbl, i) => {
          const selected = value === i
          return (
            <button
              key={i}
              type="button"
              disabled={readOnly}
              onClick={() => !readOnly && onChange?.(i)}
              className={`flex flex-col items-center gap-0.5 px-1.5 py-1.5 rounded-lg border transition-all ${
                selected
                  ? 'border-blue-500 bg-blue-50 dark:bg-blue-950 ring-1 ring-blue-500'
                  : 'border-transparent hover:border-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800'
              } ${readOnly ? 'cursor-default' : 'cursor-pointer'}`}
              title={`${i} Oktas`}
            >
              <OktasSymbol value={i} size={26} />
              <span className="text-xs text-gray-500 leading-none">{lbl}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

// Compact badge for display in tables / lists
export function OktasBadge({ value }: { value?: number }) {
  if (value == null) return <span className="text-gray-300">—</span>
  return (
    <span className="inline-flex items-center gap-1">
      <OktasSymbol value={value} size={16} />
      <span className="font-mono text-xs">{value}</span>
    </span>
  )
}
