import { useEffect, useRef, useState } from 'react'
import { searchPlaces } from '../lib/geo'
import type { GeoResult } from '../lib/geo'
import type { Workplace } from '../lib/types'

export default function WorkplaceInput({
  index,
  value,
  onChange,
}: {
  index: number
  value: Workplace | null
  onChange: (w: Workplace | null) => void
}) {
  const [q, setQ] = useState('')
  const [res, setRes] = useState<GeoResult[]>([])
  const [busy, setBusy] = useState(false)
  const ctrl = useRef<AbortController | null>(null)

  useEffect(() => {
    if (q.trim().length < 3) {
      setRes([])
      return
    }
    const t = setTimeout(async () => {
      ctrl.current?.abort()
      ctrl.current = new AbortController()
      setBusy(true)
      try {
        setRes(await searchPlaces(q, ctrl.current.signal))
      } catch {
        /* avbruten */
      } finally {
        setBusy(false)
      }
    }, 450)
    return () => clearTimeout(t)
  }, [q])

  if (value) {
    return (
      <div className="workplace set">
        <span className="pin-work small">{index + 1}</span>
        <span className="wp-label">{value.label}</span>
        <button className="x" onClick={() => onChange(null)} aria-label="Ta bort">
          ×
        </button>
      </div>
    )
  }
  return (
    <div className="workplace">
      <span className="pin-work small dim">{index + 1}</span>
      <div className="wp-search">
        <input placeholder={index === 0 ? 'Jobb 1, t.ex. Sveavägen 44' : 'Jobb 2, t.ex. Solna strand'} value={q} onChange={(e) => setQ(e.target.value)} />
        {busy && <span className="spinner" />}
        {res.length > 0 && (
          <ul className="dropdown">
            {res.map((r, i) => (
              <li key={i}>
                <button
                  onClick={() => {
                    onChange({ label: r.label, lon: r.lon, lat: r.lat })
                    setQ('')
                    setRes([])
                  }}
                >
                  {r.label}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
