import { useConfig } from '../context/ConfigContext'
import { PARAM_META } from '../utils/format'

function ranges(bands, sev) {
  return bands.filter((b) => b.severity === sev).map((b) => (b.min == null ? `< ${b.max + 1}` : b.max == null ? `> ${b.min - 1}` : `${b.min}–${b.max}`)).join(' or ') || '—'
}

export default function ThresholdInfo() {
  const config = useConfig()
  if (!config?.thresholds) return null
  return (
    <details className="card mt-5 p-4 text-sm" data-testid="threshold-info">
      <summary className="cursor-pointer font-semibold">Prototype alert rules</summary>
      <p className="mt-2 text-xs text-muted">{config.threshold_disclaimer}</p>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[520px]">
          <thead><tr><th className="th">Parameter</th><th className="th">Normal</th><th className="th text-yellow-300">Yellow</th><th className="th text-orange-300">Orange</th><th className="th text-red-300">Red</th></tr></thead>
          <tbody>
            {Object.entries(config.thresholds).map(([p, t]) => (
              <tr key={p} className="border-t border-white/5">
                <td className="td font-medium">{PARAM_META[p].label} ({t.unit})</td>
                {['normal', 'yellow', 'orange', 'red'].map((s) => <td key={s} className="td">{ranges(t.bands, s)}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  )
}
