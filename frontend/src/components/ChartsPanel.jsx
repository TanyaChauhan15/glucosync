import { useConfig } from '../context/ConfigContext'
import VitalChart from './VitalChart'
import { SimulatedTag, Spinner } from './ui'

export const RANGES = [
  { minutes: 15, label: '15 min' },
  { minutes: 60, label: '1 hour' },
  { minutes: 360, label: '6 hours' },
  { minutes: 1440, label: '24 hours' },
]

function normalBand(config, param) {
  const band = config?.thresholds?.[param]?.bands?.find((b) => b.severity === 'normal')
  return band ? [band.min, band.max] : null
}

export function RangeSelector({ value, onChange }) {
  return (
    <div className="inline-flex rounded-xl bg-navy-900 p-1" role="group" aria-label="Time range">
      {RANGES.map((r) => (
        <button key={r.minutes} onClick={() => onChange(r.minutes)} data-testid={`range-${r.minutes}`} aria-pressed={value === r.minutes}
          className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${value === r.minutes ? 'bg-brand-blue text-white' : 'text-muted hover:text-white'}`}>
          {r.label}
        </button>
      ))}
    </div>
  )
}

export default function ChartsPanel({ readings, loading, error, range, onRangeChange }) {
  const config = useConfig()
  return (
    <section className="mt-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold">Live Trends</h2>
          <SimulatedTag />
        </div>
        <RangeSelector value={range} onChange={onRangeChange} />
      </div>
      {error && <div className="mb-3 rounded-xl bg-red-500/10 px-4 py-2 text-sm text-red-300">{error}</div>}
      {loading ? <Spinner label="Loading readings…" /> : (
        <div className="grid gap-4 xl:grid-cols-3 md:grid-cols-2">
          {['glucose', 'heart_rate', 'spo2'].map((p) => (
            <VitalChart key={p} param={p} readings={readings} rangeMinutes={range} normalBand={normalBand(config, p)} />
          ))}
        </div>
      )}
      <div className="mt-2 flex flex-wrap gap-3 text-[11px] text-muted">
        <span>Coloured points mark abnormal readings:</span>
        <span className="text-yellow-300">● Yellow</span><span className="text-orange-300">● Orange</span><span className="text-red-300">● Red</span>
        <span>Shaded band = prototype normal range.</span>
      </div>
    </section>
  )
}
