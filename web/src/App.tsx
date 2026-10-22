import { useCallback, useEffect, useMemo, useState } from 'react'
import MapView from './map/MapView'
import type { MapLayersState } from './map/MapView'
import Sidebar from './components/Sidebar'
import DetailPanel from './components/DetailPanel'
import Ranking from './components/Ranking'
import SearchBar from './components/SearchBar'
import Methodology from './components/Methodology'
import Legend from './components/Legend'
import Compare from './components/Compare'
import { Router, travelToTarget } from './lib/routing'
import { DEFAULT_PREFS, SAFETY, components, estimatePrice, scoreColor, totalScore, fmtMin } from './lib/score'
import type { Components } from './lib/score'
import type { DesoProps, FC, Lens, Meta, Poi, PriceArea, Prefs, Transit } from './lib/types'

export interface Row {
  p: DesoProps
  price: number | null
  work: (number | null)[]
  workAvg: number | null
  comp: Components
  total: number
  overBudget: boolean
}

interface Data {
  deso: FC<DesoProps>
  regso: FC<{ id: string; name: string; kommunName: string; kommun: string }>
  kommuner: FC<{ id: string; name: string }>
  police: FC<{ name: string; cat: string; ort: string; lpo: string; since: string }>
  prices: Record<string, PriceArea>
  transit: Transit
  poi: Poi
  meta: Meta
}

const load = <T,>(f: string) => fetch(`./data/${f}`).then((r) => r.json() as Promise<T>)

function usePersisted<T>(key: string, init: T): [T, (v: T | ((p: T) => T)) => void] {
  const [v, setV] = useState<T>(() => {
    try {
      const s = localStorage.getItem(key)
      return s ? { ...init, ...JSON.parse(s) } : init
    } catch {
      return init
    }
  })
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(v))
    } catch {
      /* privat läge */
    }
  }, [key, v])
  return [v, setV]
}

export default function App() {
  const [data, setData] = useState<Data | null>(null)
  const [prefs, setPrefs] = usePersisted<Prefs>('boplats.prefs.v1', DEFAULT_PREFS)
  const [favs, setFavs] = usePersisted<{ ids: string[] }>('boplats.favs.v1', { ids: [] })
  const [lens, setLens] = useState<Lens>('score')
  const [layers, setLayers] = useState<MapLayersState>({ transit: true, police: true, groceries: true, schools: false, extrude: true })
  const [selected, setSelected] = useState<string | null>(null)
  const [point, setPoint] = useState<[number, number] | null>(null)
  const [flyTo, setFlyTo] = useState<{ center: [number, number]; zoom: number; key: number } | null>(null)
  const [hover, setHover] = useState<{ x: number; y: number; id: string } | null>(null)
  const [panel, setPanel] = useState<'filters' | 'ranking' | 'compare'>('filters')
  const [showMethod, setShowMethod] = useState(false)
  const [mobileSheet, setMobileSheet] = useState(false)
  // På mobil är vänsterpanelen hopfälld tills man trycker på en flik
  const [leftOpen, setLeftOpen] = useState(() => window.innerWidth > 860)
  const openTab = (t: typeof panel) => {
    setLeftOpen((o) => (t === panel ? !o || window.innerWidth > 860 : true))
    setPanel(t)
  }

  useEffect(() => {
    Promise.all([
      load<FC<DesoProps>>('deso.geojson'),
      load<Data['regso']>('regso.geojson'),
      load<Data['kommuner']>('kommuner.geojson'),
      load<Data['police']>('police.geojson'),
      load<Record<string, PriceArea>>('prices.json'),
      load<Transit>('transit.json'),
      load<Poi>('poi.json'),
      load<Meta>('meta.json'),
    ]).then(([deso, regso, kommuner, police, prices, transit, poi, meta]) =>
      setData({ deso, regso, kommuner, police, prices, transit, poi, meta }),
    )
  }, [])

  const router = useMemo(() => (data ? new Router(data.transit) : null), [data])

  // Restider från varje arbetsplats till alla stationer
  const workFields = useMemo(() => {
    if (!router) return []
    return prefs.workplaces.map((w) => (w ? { w, field: router.fromPoint(w.lon, w.lat) } : null))
  }, [router, prefs.workplaces])

  const rows = useMemo(() => {
    if (!data) return [] as Row[]
    return data.deso.features.map((f) => {
      const p = f.properties
      const price = estimatePrice(p, data.prices, prefs)
      const work = workFields.map((wf) => (wf ? travelToTarget(p.access, p.anchor, wf.field, wf.w) : null))
      const valid = work.filter((x): x is number => x != null && isFinite(x))
      const workAvg = valid.length ? Math.max(...valid) : null // den längsta pendlingen styr
      const comp = components(p, price, prefs, workAvg)
      const total = totalScore(comp, prefs, p.safetyClass)
      return { p, price, work, workAvg, comp, total, overBudget: price != null && price > prefs.budget * 1.15 }
    })
  }, [data, prefs, workFields])

  const rowById = useMemo(() => new Map(rows.map((r) => [r.p.id, r])), [rows])

  const colors = useMemo(() => {
    const m = new Map<string, { color: string; height: number; dim: boolean }>()
    for (const r of rows) {
      const excluded = prefs.excludeUtsatta && (r.p.safetyClass === 'sarskilt' || r.p.safetyClass === 'utsatt')
      let v: number | null
      let color: string
      switch (lens) {
        case 'safety':
          color = SAFETY[r.p.safetyClass].color
          v = SAFETY[r.p.safetyClass].score
          break
        case 'price':
          v = r.comp.price
          color = scoreColor(v)
          break
        case 'income':
          v = r.p.netIncome != null ? Math.max(0, Math.min(100, ((r.p.netIncome - 200) / 400) * 100)) : null
          color = scoreColor(v)
          break
        case 'score':
          v = r.total
          color = scoreColor(v)
          break
        default:
          v = r.comp[lens as keyof Components]
          color = scoreColor(v)
      }
      const dim = lens === 'safety' ? false : (lens === 'score' && (excluded || r.overBudget))
      m.set(r.p.id, { color, height: (v ?? 0) * 7 + 10, dim })
    }
    return m
  }, [rows, lens, prefs.excludeUtsatta])

  const onPick = useCallback((lngLat: [number, number], id: string | null) => {
    setPoint(lngLat)
    setSelected(id)
    setMobileSheet(true)
  }, [])

  const goTo = useCallback(
    (lon: number, lat: number, zoom = 14) => {
      setFlyTo({ center: [lon, lat], zoom, key: Date.now() })
      if (!data) return
      // Hitta DeSO som innehåller punkten
      const id = findDeso(data.deso, lon, lat)
      setPoint([lon, lat])
      setSelected(id)
      setMobileSheet(true)
    },
    [data],
  )

  if (!data) {
    return (
      <div className="loading">
        <div className="loading-mark" />
        <p>Laddar statistik för Stockholms län…</p>
      </div>
    )
  }

  const sel = selected ? rowById.get(selected) ?? null : null
  const hoverRow = hover ? rowById.get(hover.id) : null

  return (
    <div className="app">
      <MapView
        deso={data.deso}
        regso={data.regso}
        kommuner={data.kommuner}
        police={data.police}
        transit={data.transit}
        poi={data.poi}
        colors={colors}
        selectedId={selected}
        point={point}
        workplaces={prefs.workplaces}
        layers={layers}
        flyTo={flyTo}
        onPick={onPick}
        onHover={setHover}
      />

      <header className="topbar">
        <div className="brand">
          <svg viewBox="0 0 64 64" width="28" height="28" aria-hidden>
            <path d="M14 46V28l18-12 18 12v18" fill="none" stroke="#7dd3c0" strokeWidth="5" strokeLinejoin="round" />
            <circle cx="32" cy="36" r="6" fill="#f4b860" />
          </svg>
          <div>
            <h1>Boplats Stockholm</h1>
            <span>Beslutsstöd för bostadsköp · Stockholms län</span>
          </div>
        </div>
        <SearchBar onSelect={(r) => goTo(r.lon, r.lat, r.kind === 'road' || r.kind === 'house' ? 16 : 14)} />
        <button className="ghost-btn" onClick={() => setShowMethod(true)}>
          Källor & metod
        </button>
      </header>

      <aside className={`left ${leftOpen ? '' : 'collapsed'} ${sel ? 'has-detail' : ''}`}>
        <nav className="tabs">
          <button className={panel === 'filters' ? 'on' : ''} onClick={() => openTab('filters')}>
            Våra krav
          </button>
          <button className={panel === 'ranking' ? 'on' : ''} onClick={() => openTab('ranking')}>
            Topplista
          </button>
          <button className={panel === 'compare' ? 'on' : ''} onClick={() => openTab('compare')}>
            Jämför {favs.ids.length ? <b className="pill">{favs.ids.length}</b> : null}
          </button>
        </nav>
        <div className="left-body">
          {panel === 'filters' && (
            <Sidebar prefs={prefs} setPrefs={setPrefs} lens={lens} setLens={setLens} layers={layers} setLayers={setLayers} />
          )}
          {panel === 'ranking' && (
            <Ranking
              rows={rows}
              prefs={prefs}
              onPick={(r) => {
                setFlyTo({ center: r.p.anchor, zoom: 13.5, key: Date.now() })
                setSelected(r.p.id)
                setPoint(null)
                if (window.innerWidth <= 860) setLeftOpen(false)
              }}
            />
          )}
          {panel === 'compare' && (
            <Compare
              rows={favs.ids.map((id) => rowById.get(id)).filter((r): r is Row => !!r)}
              prices={data.prices}
              prefs={prefs}
              onRemove={(id) => setFavs((f) => ({ ids: f.ids.filter((x) => x !== id) }))}
              onPick={(r) => {
                setFlyTo({ center: r.p.anchor, zoom: 13.5, key: Date.now() })
                setSelected(r.p.id)
              }}
            />
          )}
        </div>
      </aside>

      <Legend lens={lens} hasWork={prefs.workplaces.some(Boolean)} />

      {sel && (
        <DetailPanel
          row={sel}
          point={point}
          data={data}
          prefs={prefs}
          router={router!}
          isFav={favs.ids.includes(sel.p.id)}
          toggleFav={() =>
            setFavs((f) => ({ ids: f.ids.includes(sel.p.id) ? f.ids.filter((x) => x !== sel.p.id) : [...f.ids, sel.p.id] }))
          }
          onClose={() => {
            setSelected(null)
            setPoint(null)
          }}
          open={mobileSheet}
          setOpen={setMobileSheet}
        />
      )}

      {hoverRow && hover && !('ontouchstart' in window) && (
        <div className="hover-card" style={{ left: hover.x + 16, top: hover.y + 16 }}>
          <strong>{hoverRow.p.regsoName}</strong>
          <span className="muted">{hoverRow.p.kommunName}</span>
          <div className="hover-grid">
            <span>Matchning</span>
            <b style={{ color: scoreColor(hoverRow.total) }}>{hoverRow.total}</b>
            <span>Trygghet</span>
            <b style={{ color: SAFETY[hoverRow.p.safetyClass].color }}>{SAFETY[hoverRow.p.safetyClass].short}</b>
            <span>Till City</span>
            <b>{fmtMin(hoverRow.p.toCity)}</b>
            {hoverRow.workAvg != null && (
              <>
                <span>Till jobben</span>
                <b>{fmtMin(hoverRow.workAvg)}</b>
              </>
            )}
          </div>
        </div>
      )}

      {showMethod && <Methodology meta={data.meta} prices={data.prices} onClose={() => setShowMethod(false)} />}
    </div>
  )
}

function findDeso(fc: FC<DesoProps>, lon: number, lat: number): string | null {
  for (const f of fc.features) {
    const g = f.geometry
    const polys = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : []
    for (const poly of polys) {
      if (inRing(poly[0] as number[][], lon, lat) && !poly.slice(1).some((h: unknown) => inRing(h as number[][], lon, lat))) return f.properties.id
    }
  }
  return null
}
function inRing(ring: number[][], x: number, y: number) {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]
    const [xj, yj] = ring[j]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}
