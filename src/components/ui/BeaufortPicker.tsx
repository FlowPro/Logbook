import { useTranslation } from 'react-i18next'
import { BEAUFORT_DATA } from '../../utils/units'

// Douglas Sea Scale wave-height sub-labels (one per state 0–9)
const DOUGLAS_HEIGHTS = ['0 m', '≈0.1', '0.1–0.5', '0.5–1.3', '1.3–2.5', '2.5–4', '4–6', '6–9', '9–14', '>14']

interface BeaufortPickerProps {
  label: string
  value: number
  onChange: (force: number) => void
  maxForce?: number
  readOnly?: boolean
  /** 'beaufort' (default) shows knot ranges; 'douglas' shows wave heights in m */
  scale?: 'beaufort' | 'douglas'
}

const BEAUFORT_COLORS = [
  '#f1f5f9', '#d1fae5', '#a7f3d0', '#fef3c7',
  '#fde68a', '#fed7aa', '#fdba74', '#fca5a5',
  '#f87171', '#ef4444', '#c084fc', '#a855f7', '#000000'
]

const BEAUFORT_TEXT_COLORS = [
  '#374151', '#065f46', '#065f46', '#92400e',
  '#92400e', '#9a3412', '#9a3412', '#991b1b',
  '#991b1b', '#991b1b', '#581c87', '#581c87', '#ffffff'
]

export function BeaufortPicker({ label, value, onChange, maxForce = 12, readOnly = false, scale = 'beaufort' }: BeaufortPickerProps) {
  const { t } = useTranslation()
  const isDouglas = scale === 'douglas'

  return (
    <div>
      <label className="label">
        {label}
        <span className="ml-2 text-xs font-normal text-gray-400">
          {isDouglas ? 'Douglas Scale' : 'Beaufort Scale'}
          {readOnly && ' · auto'}
        </span>
      </label>
      <div className="flex flex-wrap gap-1.5">
        {BEAUFORT_DATA.slice(0, maxForce + 1).map(b => (
          <button
            key={b.force}
            type="button"
            onClick={() => !readOnly && onChange(b.force)}
            title={isDouglas ? `${DOUGLAS_HEIGHTS[b.force]} m` : t(`beaufort.${b.force}`)}
            style={{
              backgroundColor: BEAUFORT_COLORS[b.force],
              color: BEAUFORT_TEXT_COLORS[b.force],
              outline: value === b.force ? '2px solid #3b82f6' : 'none',
              outlineOffset: '2px',
              opacity: readOnly && value !== b.force ? 0.35 : 1,
            }}
            className={`w-10 h-10 rounded-lg font-bold text-sm flex flex-col items-center justify-center
              ${readOnly ? 'cursor-default' : 'transition-transform hover:scale-110'}`}
          >
            <span className="text-xs font-bold leading-none">{b.force}</span>
            <span className="text-[9px] leading-none opacity-70">
              {isDouglas ? DOUGLAS_HEIGHTS[b.force] : `${b.minKts}-${b.maxKts === 999 ? '64+' : b.maxKts}`}
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}
