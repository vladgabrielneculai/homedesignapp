import { useMemo } from 'react'
import { CITIES, compassName, dayOfYear, formatHour, getCity, MONTHS, sunPosition } from '../lib/sun'
import { useStore } from '../state/store'
import type { SunState, SunTime } from '../three/Outdoors'
import type { Site } from '../types'

const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]

/** Sunrise and sunset (local clock hours) for a site and day, by scanning the sun's altitude. */
function sunTimes(site: Site, doy: number): { rise: number | null; set: number | null; noon: number } {
  let rise: number | null = null
  let set: number | null = null
  let noon = 12
  let best = -Infinity
  let prev = sunPosition(site.lat, site.lon, site.utc, site.dst, doy, 0).altitude
  for (let h = 0.05; h <= 24; h += 0.05) {
    const alt = sunPosition(site.lat, site.lon, site.utc, site.dst, doy, h).altitude
    if (prev < 0 && alt >= 0 && rise === null) rise = h
    if (prev >= 0 && alt < 0) set = h
    if (alt > best) {
      best = alt
      noon = h
    }
    prev = alt
  }
  return { rise, set, noon }
}

const round15 = (h: number) => Math.round(h * 4) / 4

export function SunPanel({ site, time, sun, onTime, onClose }: { site: Site; time: SunTime; sun: SunState; onTime: (t: SunTime) => void; onClose: () => void }) {
  const doy = dayOfYear(time.month, time.day)
  const times = useMemo(() => sunTimes(site, doy), [site, doy])
  const setSite = (patch: Partial<Site>, record = true) => useStore.getState().updateDesign((d) => ({ ...d, site: { ...site, ...d.site, ...patch } }), { record })
  const city = getCity(site.city)

  const presets: [string, number | null][] = [
    ['Sunrise', times.rise !== null ? round15(times.rise + 0.25) : null],
    ['Morning', 9],
    ['Noon', round15(times.noon)],
    ['Golden hour', times.set !== null ? round15(times.set - 0.75) : null],
    ['Night', 22],
  ]

  return (
    <div className="sun-panel" role="dialog" aria-label="Sun and location">
      <div className="sun-head">
        <strong>Sun &amp; location</strong>
        <button className="btn ghost icon small" onClick={onClose} aria-label="Close">
          ×
        </button>
      </div>

      <label className="range-field">
        <span>Time</span>
        <input type="range" min={0} max={23.75} step={0.25} value={time.hour} onChange={(e) => onTime({ ...time, hour: Number(e.target.value) })} />
        <em>{formatHour(time.hour)}</em>
      </label>
      <div className="btn-row">
        {presets.map(([label, h]) =>
          h === null ? null : (
            <button key={label} className={'chip' + (Math.abs(time.hour - h) < 0.01 ? ' active' : '')} onClick={() => onTime({ ...time, hour: h })}>
              {label}
            </button>
          ),
        )}
      </div>

      <div className="sun-date">
        <span>Date</span>
        <select
          className="input small"
          value={time.month}
          onChange={(e) => {
            const month = Number(e.target.value)
            onTime({ ...time, month, day: Math.min(time.day, DAYS_IN_MONTH[month - 1]) })
          }}
        >
          {MONTHS.map((m, i) => (
            <option key={m} value={i + 1}>
              {m}
            </option>
          ))}
        </select>
        <input type="range" min={1} max={DAYS_IN_MONTH[time.month - 1]} value={time.day} onChange={(e) => onTime({ ...time, day: Number(e.target.value) })} aria-label="Day of month" />
        <em>{time.day}</em>
      </div>

      <label className="text-field">
        <span>Location</span>
        <select
          className="input small"
          value={city ? city.name : ''}
          onChange={(e) => {
            const c = getCity(e.target.value)
            if (c) setSite({ city: c.name, lat: c.lat, lon: c.lon, utc: c.utc, dst: c.dst })
            else setSite({ city: undefined })
          }}
        >
          {CITIES.map((c) => (
            <option key={c.name} value={c.name}>
              {c.name}
            </option>
          ))}
          <option value="">Custom coordinates…</option>
        </select>
      </label>
      {!city && (
        <div className="field-row three">
          <label className="num-field">
            <span>Lat</span>
            <input type="number" step={0.01} min={-89} max={89} value={site.lat} onChange={(e) => setSite({ lat: Number(e.target.value) || 0 }, false)} />
            <em />
          </label>
          <label className="num-field">
            <span>Lon</span>
            <input type="number" step={0.01} min={-180} max={180} value={site.lon} onChange={(e) => setSite({ lon: Number(e.target.value) || 0 }, false)} />
            <em />
          </label>
          <label className="num-field">
            <span>UTC</span>
            <input type="number" step={0.5} min={-12} max={14} value={site.utc} onChange={(e) => setSite({ utc: Number(e.target.value) || 0, dst: 'none' }, false)} />
            <em>h</em>
          </label>
        </div>
      )}

      <div className="sun-north">
        <svg viewBox="-20 -20 40 40" width="44" height="44" aria-hidden="true">
          <circle r="18" fill="var(--panel)" stroke="var(--border)" />
          <g transform={`rotate(${-site.north})`}>
            <path d="M0 -15 L4 0 L0 -3 L-4 0 Z" fill="#d9534f" />
            <path d="M0 15 L4 0 L0 3 L-4 0 Z" fill="#9aa1a8" />
          </g>
        </svg>
        <label className="range-field">
          <span>Plan top faces</span>
          <input
            type="range"
            min={0}
            max={359}
            step={1}
            value={site.north}
            onPointerDown={() => useStore.getState().checkpoint()}
            onChange={(e) => setSite({ north: Number(e.target.value) }, false)}
          />
          <em>
            {compassName(site.north)} {site.north}°
          </em>
        </label>
      </div>

      <p className="muted small">
        {sun.altitude > 0
          ? `Sun ${Math.round(sun.altitude)}° high, from the ${compassName(sun.azimuth)}.`
          : 'The sun is down: lamps and ceiling lights are on.'}{' '}
        {times.rise !== null && times.set !== null && `Sunrise ${formatHour(times.rise)}, sunset ${formatHour(times.set)}.`}
      </p>
    </div>
  )
}
