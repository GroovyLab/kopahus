import { useEffect, useRef, useState } from 'react'
import { searchPlaces } from '../lib/geo'
import type { GeoResult } from '../lib/geo'

export default function SearchBar({ onSelect }: { onSelect: (r: GeoResult) => void }) {
  const [q, setQ] = useState('')
  const [res, setRes] = useState<GeoResult[]>([])
  const [open, setOpen] = useState(false)
  const ctrl = useRef<AbortController | null>(null)

  useEffect(() => {
    if (q.trim().length < 3) {
      setRes([])
      return
    }
    const t = setTimeout(async () => {
      ctrl.current?.abort()
      ctrl.current = new AbortController()
      try {
        setRes(await searchPlaces(q, ctrl.current.signal))
        setOpen(true)
      } catch {
        /* avbruten */
      }
    }, 400)
    return () => clearTimeout(t)
  }, [q])

  return (
    <div className="search">
      <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden>
        <circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" strokeWidth="2" />
        <path d="M20 20l-4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
      <input
        placeholder="Sök gata, adress eller område…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onFocus={() => res.length && setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 200)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && res[0]) {
            onSelect(res[0])
            setOpen(false)
          }
        }}
      />
      {open && res.length > 0 && (
        <ul className="dropdown">
          {res.map((r, i) => (
            <li key={i}>
              <button
                onMouseDown={() => {
                  onSelect(r)
                  setQ(r.label.split(',')[0])
                  setOpen(false)
                }}
              >
                <span>{r.label}</span>
                <em>{kindLabel(r.kind)}</em>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function kindLabel(k: string) {
  return (
    { road: 'Gata', house: 'Adress', building: 'Adress', suburb: 'Område', neighbourhood: 'Område', quarter: 'Område', city: 'Ort', town: 'Ort', municipality: 'Kommun', village: 'Ort' } as Record<string, string>
  )[k] ?? 'Plats'
}
