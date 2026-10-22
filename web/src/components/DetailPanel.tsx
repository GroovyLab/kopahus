import { useEffect, useMemo, useState } from 'react'
import type { Row } from '../App'
import { booliForSaleUrl, booliSoldUrl, hemnetSoldUrl, reverse } from '../lib/geo'
import { Router, accessMinutes, distM } from '../lib/routing'
import { SAFETY, WEIGHT_LABELS, totalScore, fmtDist, fmtKr, fmtMin, fmtNum, scoreColor } from '../lib/score'
import type { DesoProps, FC, Poi, PriceArea, Prefs, Transit, WeightKey } from '../lib/types'
import Sparkline from './Sparkline'

interface Props {
  row: Row
  point: [number, number] | null
  data: { prices: Record<string, PriceArea>; transit: Transit; poi: Poi; deso: FC<DesoProps> }
  prefs: Prefs
  router: Router
  isFav: boolean
  toggleFav: () => void
  onClose: () => void
  open: boolean
  setOpen: (v: boolean) => void
}

const AREA_TYPE: Record<number, string> = {
  1: 'Stora socioekonomiska utmaningar',
  2: 'Socioekonomiska utmaningar',
  3: 'Blandade socioekonomiska förutsättningar',
  4: 'Goda socioekonomiska förutsättningar',
  5: 'Mycket goda socioekonomiska förutsättningar',
}

export default function DetailPanel({ row, point, data, prefs, router, isFav, toggleFav, onClose, open, setOpen }: Props) {
  const p = row.p
  const [addr, setAddr] = useState<{ street?: string; houseNumber?: string; suburb?: string; city?: string } | null>(null)
  const here: [number, number] = point ?? p.anchor

  useEffect(() => {
    setAddr(null)
    if (!point) return
    let alive = true
    reverse(point[0], point[1]).then((a) => alive && setAddr(a))
    return () => {
      alive = false
    }
  }, [point])

  const lanAvg = useMemo(() => {
    const avg = (k: keyof DesoProps) => {
      let s = 0
      let w = 0
      for (const f of data.deso.features) {
        const v = f.properties[k] as number | undefined
        const pop = f.properties.pop ?? 0
        if (v != null && pop) {
          s += v * pop
          w += pop
        }
      }
      return w ? s / w : null
    }
    return {
      netIncome: avg('netIncome'),
      eduPostSecPct: avg('eduPostSecPct'),
      employedPct: avg('employedPct'),
      lowEconPct: avg('lowEconPct'),
    }
  }, [data.deso])

  // Exakta restider från vald punkt (gatunivå)
  const travel = useMemo(() => {
    const field = router.fromPoint(here[0], here[1])
    const hubIdx = (name: string) => data.transit.hubs.findIndex((h) => h.name === name)
    const tc = hubIdx('T-Centralen')
    const up = hubIdx('Uppsala C')
    const work = prefs.workplaces.map((w) => {
      if (!w) return null
      const wf = router.fromPoint(w.lon, w.lat)
      let best = Infinity
      data.transit.hubs.forEach((h, i) => {
        const d = distM(here[0], here[1], h.lon, h.lat)
        if (d < 6000) best = Math.min(best, accessMinutes(d) + wf[i])
      })
      const direct = distM(here[0], here[1], w.lon, w.lat)
      const directMin = direct < 2500 ? (direct * 1.25) / 80 : Infinity
      return { w, min: Math.min(best, directMin) }
    })
    return { city: tc >= 0 ? field[tc] : null, uppsala: up >= 0 ? field[up] : null, work }
  }, [here, router, data.transit, prefs.workplaces])

  // Närmaste stationer från punkten
  const stations = useMemo(() => {
    return data.transit.hubs
      .map((h) => ({ h, d: distM(here[0], here[1], h.lon, h.lat) }))
      .sort((a, b) => a.d - b.d)
      .slice(0, 3)
  }, [here, data.transit])

  const nearest = <T,>(items: T[], ll: (t: T) => [number, number], n: number) =>
    items
      .map((t) => {
        const [lo, la] = ll(t)
        return { t, d: distM(here[0], here[1], lo, la) }
      })
      .sort((a, b) => a.d - b.d)
      .slice(0, n)

  const groceries = useMemo(() => nearest(data.poi.groceries, (g) => [g[0], g[1]], 40), [here, data.poi])
  const supers = groceries.filter((g) => g.t[3] === 1).slice(0, 3)
  const within1km = groceries.filter((g) => g.d <= 1000).length
  const schools = useMemo(() => nearest(data.poi.schools, (s) => [s.lon, s.lat], 5), [here, data.poi])
  const preschool = useMemo(() => nearest(data.poi.preschools, (s) => [s[0], s[1]], 1)[0], [here, data.poi])
  const park = useMemo(() => nearest(data.poi.parks, (s) => [s[0], s[1]], 2), [here, data.poi])
  const bath = useMemo(() => nearest(data.poi.baths, (s) => [s[0], s[1]], 1)[0], [here, data.poi])

  const pa = data.prices[p.priceArea]
  const kommunPa = data.prices[p.kommun === '0180' ? 'stockholm' : p.priceArea]
  const lineColor = (ref: string) => data.transit.lines.find((l) => l.ref === ref)?.color ?? '#888'
  const safety = SAFETY[p.safetyClass]
  const streetQ = addr?.street ? `${addr.street}, ${addr.city ?? p.kommunName}` : null
  const areaQ = `${p.regsoName}, ${p.kommunName}`

  return (
    <aside className={`detail ${open ? 'open' : ''}`}>
      <div className="sheet-handle" onClick={() => setOpen(!open)} />
      <header className="detail-head">
        <div>
          <span className="eyebrow">
            {p.kommunName} · DeSO {p.id}
          </span>
          <h2>{p.regsoName}</h2>
          {point && (
            <p className="street">
              {addr === null ? 'Hämtar adress…' : addr.street ? `${addr.street}${addr.houseNumber ? ' ' + addr.houseNumber : ''}${addr.suburb ? ', ' + addr.suburb : ''}` : 'Ingen gata hittades här'}
            </p>
          )}
        </div>
        <div className="head-actions">
          <button className={`fav ${isFav ? 'on' : ''}`} onClick={toggleFav} title="Spara för jämförelse">
            {isFav ? '★ Sparad' : '☆ Spara'}
          </button>
          <button className="x" onClick={onClose} aria-label="Stäng">
            ×
          </button>
        </div>
      </header>

      <div className="detail-body">
        <section className="score-card">
          <div className="ring" style={{ ['--v' as string]: row.total, ['--c' as string]: scoreColor(row.total) }}>
            <b>{row.total}</b>
            <span>matchning</span>
          </div>
          <div className="bars">
            {(Object.keys(WEIGHT_LABELS) as WeightKey[])
              .filter((k) => prefs.weights[k] > 0)
              .map((k) => {
                const v = row.comp[k]
                return (
                  <div key={k} className="bar">
                    <span>{WEIGHT_LABELS[k]}</span>
                    <div className="track">
                      <i style={{ width: `${v ?? 0}%`, background: scoreColor(v) }} />
                    </div>
                    <b>{v == null ? '–' : Math.round(v)}</b>
                  </div>
                )
              })}
          </div>
        </section>

        {row.total < totalScore(row.comp, prefs) && (
          <p className="cap-note">
            Matchningen är begränsad till {row.total} på grund av trygghetsklassningen. Övriga faktorer hade gett{' '}
            {totalScore(row.comp, prefs)}.
          </p>
        )}

        <section className="card">
          <h4>Trygghet</h4>
          <div className="safety-badge" style={{ ['--c' as string]: safety.color }}>
            <span className="dot" />
            <b>{safety.label}</b>
          </div>
          <p className="muted">{safety.desc}</p>
          <dl className="kv">
            {p.policeName && (
              <>
                <dt>Polisens område</dt>
                <dd>
                  {p.policeName} ({p.police === 'sarskilt' ? 'särskilt utsatt' : 'utsatt'}, {Math.round((p.policeShare ?? 0) * 100)} % av DeSO-ytan)
                </dd>
              </>
            )}
            {p.policeNear && !p.policeName && (
              <>
                <dt>Gränsar till</dt>
                <dd>{p.policeNear} (Polisens utsatta område, inom 400 m)</dd>
              </>
            )}
            <dt>SCB områdestyp</dt>
            <dd>{p.areaType ? `${p.areaType} – ${AREA_TYPE[p.areaType]}` : '–'}</dd>
            <dt>Socioekonomiskt index</dt>
            <dd>{fmtNum(p.socioIndex, 1)} (i länet ca 1–27, lägre är bättre)</dd>
            <dt>Bistånd eller långtidsarbetslös</dt>
            <dd>{p.welfareUnempPct != null ? `${fmtNum(p.welfareUnempPct, 1)} %` : '–'}</dd>
          </dl>
        </section>

        <section className="card">
          <h4>Priser {pa ? <span className="muted">· {pa.name}</span> : null}</h4>
          {pa?.br3 && (
            <div className="stat-row">
              <div>
                <span>Bostadsrätt kr/m²</span>
                <b>{fmtNum(pa.br3.sqm)}</b>
                <em className={(pa.br12?.change ?? 0) >= 0 ? 'up' : 'down'}>
                  {pa.br12?.change != null ? `${pa.br12.change > 0 ? '+' : ''}${pa.br12.change} % 12 mån` : ''}
                </em>
              </div>
              <div>
                <span>Snittpris BR</span>
                <b>{fmtKr(pa.br3.avgPrice)}</b>
                <em>{fmtNum(pa.br3.sold)} sålda / 3 mån</em>
              </div>
              <div>
                <span>Snittpris villa</span>
                <b>{fmtKr(kommunPa?.villa3?.avgPrice ?? pa.villa3?.avgPrice)}</b>
                <em>{kommunPa?.villa3 ? `${fmtNum(kommunPa.villa3.sold)} sålda · ${kommunPa.name}` : 'för få villor'}</em>
              </div>
            </div>
          )}
          {pa?.history?.br && <Sparkline labels={pa.history.br.labels} values={pa.history.br.values} suffix=" kr/m²" />}
          <div className={`estimate ${row.price != null && row.price > prefs.budget ? 'over' : 'ok'}`}>
            {prefs.tenure === 'br' ? `Uppskattat pris för ${prefs.sqm} m²:` : 'Typiskt villapris:'} <b>{fmtKr(row.price)}</b>
            <span>{row.price == null ? '' : row.price <= prefs.budget ? ` · inom budget (${fmtKr(prefs.budget)})` : ` · ${fmtKr(row.price - prefs.budget)} över budget`}</span>
          </div>
          <p className="muted small">
            Snitt för hela prisområdet enligt Svensk Mäklarstatistik ({pa?.updated}). Enskilda gator kan avvika mycket, så kolla
            slutpriserna nedan.
          </p>
          <div className="links">
            {streetQ && (
              <a href={booliSoldUrl(streetQ)} target="_blank" rel="noreferrer" className="link-btn primary">
                Slutpriser {addr?.street} på Booli ↗
              </a>
            )}
            <a href={booliSoldUrl(areaQ)} target="_blank" rel="noreferrer" className="link-btn">
              Slutpriser {p.regsoName} ↗
            </a>
            <a href={booliForSaleUrl(streetQ ?? areaQ)} target="_blank" rel="noreferrer" className="link-btn">
              Till salu ↗
            </a>
            <a href={hemnetSoldUrl(streetQ ?? areaQ)} target="_blank" rel="noreferrer" className="link-btn">
              Hemnet ↗
            </a>
            {pa && (
              <a href={pa.url} target="_blank" rel="noreferrer" className="link-btn">
                Mäklarstatistik ↗
              </a>
            )}
          </div>
        </section>

        <section className="card">
          <h4>Kollektivtrafik {point ? <span className="muted">· från vald punkt</span> : null}</h4>
          <ul className="stations">
            {stations.map(({ h, d }) => (
              <li key={h.name}>
                <div className="line-badges">
                  {h.lines.map((l) => (
                    <i key={l} style={{ background: lineColor(l) }}>
                      {l === '8XX' ? 'R' : l}
                    </i>
                  ))}
                </div>
                <span>{h.name}</span>
                <b>
                  {fmtDist(d)} · {fmtMin(accessMinutes(d))}
                </b>
              </li>
            ))}
          </ul>
          <div className="stat-row">
            <div>
              <span>Till T-Centralen</span>
              <b>{fmtMin(travel.city)}</b>
            </div>
            <div>
              <span>Till Uppsala C</span>
              <b>{fmtMin(travel.uppsala)}</b>
            </div>
            {travel.work.map(
              (w, i) =>
                w && (
                  <div key={i}>
                    <span>Till jobb {i + 1}</span>
                    <b>{fmtMin(w.min)}</b>
                  </div>
                ),
            )}
          </div>
          <p className="muted small">
            Restid dörr till dörr med spårtrafik i rusningstid, inklusive gång och genomsnittlig väntetid. Buss ingår bara som anslutning
            längre än 1,3 km, så verklig tid kan vara kortare där det går bra bussar.
          </p>
        </section>

        <section className="card">
          <h4>Service & natur</h4>
          <dl className="kv">
            <dt>Närmaste mataffär</dt>
            <dd>{supers[0] ? `${supers[0].t[2]} · ${fmtDist(supers[0].d)}` : '–'}</dd>
            {supers[1] && (
              <>
                <dt />
                <dd className="muted">
                  {supers[1].t[2]} · {fmtDist(supers[1].d)}
                  {supers[2] ? `, ${supers[2].t[2]} · ${fmtDist(supers[2].d)}` : ''}
                </dd>
              </>
            )}
            <dt>Butiker inom 1 km</dt>
            <dd>{within1km}</dd>
            <dt>Förskola</dt>
            <dd>{preschool ? `${preschool.t[2]} · ${fmtDist(preschool.d)}` : '–'}</dd>
            <dt>Park / natur</dt>
            <dd>{park.map((x) => `${x.t[2]} · ${fmtDist(x.d)}`).join(', ') || '–'}</dd>
            <dt>Badplats</dt>
            <dd>{bath ? `${bath.t[2] ?? 'Badplats'} · ${fmtDist(bath.d)}` : '–'}</dd>
          </dl>
        </section>

        <section className="card">
          <h4>Grundskolor i närheten</h4>
          <ul className="schools">
            {schools.map(({ t, d }) => (
              <li key={t.code}>
                <div>
                  <b>{t.name}</b>
                  <span className="muted">
                    {t.org} · åk {t.years ?? '?'} · {fmtDist(d)}
                  </span>
                </div>
                <div className="merit" style={{ color: t.merit ? scoreColor(((t.merit - 200) / 90) * 100) : undefined }}>
                  {t.merit ? fmtNum(t.merit, 0) : t.passed6 ? `${fmtNum(t.passed6)} %` : '–'}
                  <small>{t.merit ? 'meritvärde' : t.passed6 ? 'godkända åk 6' : 'ingen statistik'}</small>
                </div>
              </li>
            ))}
          </ul>
          <p className="muted small">Meritvärde åk 9 enligt Skolverket (max 340, rikssnitt runt 230).</p>
        </section>

        <section className="card">
          <h4>Vilka bor här? <span className="muted">· SCB</span></h4>
          <Compare label="Nettoinkomst (tkr/år)" v={p.netIncome} avg={lanAvg.netIncome} d={0} />
          <Compare label="Eftergymnasial utbildning" v={p.eduPostSecPct} avg={lanAvg.eduPostSecPct} unit="%" />
          <Compare label="Sysselsatta 20–64 år" v={p.employedPct} avg={lanAvg.employedPct} unit="%" />
          <Compare label="Låg ekonomisk standard" v={p.lowEconPct} avg={lanAvg.lowEconPct} unit="%" invert />
          <dl className="kv">
            <dt>Invånare</dt>
            <dd>
              {fmtNum(p.pop)} ({fmtNum(p.density)} per km²)
            </dd>
            <dt>Boendeform</dt>
            <dd>
              {fmtNum(p.condoPct)} % bostadsrätt · {fmtNum(p.ownedPct)} % äganderätt · {fmtNum(p.rentalPct)} % hyresrätt
            </dd>
          </dl>
        </section>
      </div>
    </aside>
  )
}

function Compare({ label, v, avg, unit = '', d = 1, invert = false }: { label: string; v?: number; avg: number | null; unit?: string; d?: number; invert?: boolean }) {
  if (v == null || avg == null) return null
  const max = Math.max(v, avg) * 1.15 || 1
  const better = invert ? v <= avg : v >= avg
  return (
    <div className="cmp">
      <div className="cmp-head">
        <span>{label}</span>
        <b className={better ? 'up' : 'down'}>
          {fmtNum(v, d)}
          {unit}
        </b>
      </div>
      <div className="cmp-track">
        <i style={{ width: `${(v / max) * 100}%` }} className={better ? 'up' : 'down'} />
        <s style={{ left: `${(avg / max) * 100}%` }} title={`Länssnitt ${fmtNum(avg, d)}${unit}`} />
      </div>
      <small className="muted">
        Länssnitt {fmtNum(avg, d)}
        {unit}
      </small>
    </div>
  )
}
