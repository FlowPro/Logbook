import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

interface CoordinateValue {
  degrees: number
  minutes: number
  direction: 'N' | 'S' | 'E' | 'W'
}

interface CoordinateInputProps {
  label: ReactNode
  value: CoordinateValue
  onChange: (value: CoordinateValue) => void
  type: 'lat' | 'lon'
  error?: string
}

export function CoordinateInput({ label, value, onChange, type, error }: CoordinateInputProps) {
  const { t } = useTranslation()
  const directions = type === 'lat' ? ['N', 'S'] : ['E', 'W']

  return (
    <div>
      <label className="label">{label}</label>
      <div className="flex gap-2 items-end">
        <div className="flex-1">
          <input
            type="number"
            min={0}
            max={type === 'lat' ? 90 : 180}
            value={value.degrees}
            onChange={e => onChange({ ...value, degrees: parseInt(e.target.value) || 0 })}
            className="input text-center font-mono"
            placeholder="000"
          />
          <p className="text-xs text-center text-gray-500 mt-0.5">{t('logEntry.degrees')}°</p>
        </div>
        <div className="text-gray-400 text-lg font-light pb-5">°</div>
        <div className="flex-1">
          <input
            type="text"
            inputMode="decimal"
            value={value.minutes}
            onChange={e => onChange({ ...value, minutes: parseFloat(String(e.target.value).replace(',', '.')) || 0 })}
            className="input text-center font-mono"
            placeholder="00.000"
          />
          <p className="text-xs text-center text-gray-500 mt-0.5">{t('logEntry.minutes')}'</p>
        </div>
        <div>
          <div className="flex gap-1">
            {directions.map(dir => (
              <button
                key={dir}
                type="button"
                onClick={() => onChange({ ...value, direction: dir as CoordinateValue['direction'] })}
                className={`w-10 h-9 rounded-lg font-bold text-sm transition-colors ${
                  value.direction === dir
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                }`}
              >
                {dir}
              </button>
            ))}
          </div>
          <p className="text-xs text-center text-transparent mt-0.5 select-none">dir</p>
        </div>
      </div>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  )
}
