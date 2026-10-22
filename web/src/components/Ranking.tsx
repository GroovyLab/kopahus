import { useMemo, useState } from 'react'
import type { Row } from '../App'
import { SAFETY, fmtKr, fmtMin, scoreColor } from '../lib/score'
import type { Prefs } from '../lib/types'

interface Group {
  key: string
  name: string
  kommun: string
  score: number
  pop: number
  rep: Row
  price: number | null
  toCity: number | null
  work: number | null
  safety: Row['p']['safetyClass']
}

export default function Ranking({ rows, prefs, onPick }: { rows: Row[]; prefs: Prefs; onPick: (r: Row) => void }) {
  const [kommun, setKommun] = useState('alla')
  const [onlyBudget, setOnlyBudget] = useState(true)

  const groups = useMemo(() => {
    const m = new Map<string, Row[]>()
    for (const r of rows) {
      if (!m.has(r.p.regso)) m.set(r.p.regso, [])
      m.get(r.p.regso)!.push(r)
    }
    const out: Group[] = []
    for (const [key, rs] of m) {
      const pop = rs.reduce((a, r) => a + (r.p.pop ?? 0), 0) || 1
      const w = (f: (r: Row) => number | null) => {
        let s = 0
        let t = 0
        for (const r of rs) {
          const v = f(r)
          if (v == null || !isFinite(v)) continue
          s += v * (r.p.pop ?? 1)
          t += r.p.pop ?? 1
        }
        return t ? s / t : null
      }
      const rep = rs.reduce((a, b) => ((b.p.pop ?? 0) > (a.p.pop ?? 0) ? b : a))
      // Sämsta trygghetsklass i området styr (försiktighetsprincip)
      const order = ['sarskilt', 'utsatt', 'granslage', 'blandat', 'bra', 'bast', 'okand']
      const worstPop = rs.filter((r) => (r.p.pop ?? 0) > pop * 0.15)
      const safety = (worstPop.length ? worstPop : rs).map((r) => r.p.safetyClass).sort((a, b) => order.indexOf(a) - order.indexOf(b))[0]
      out.push({
        key,
        name: rep.p.regsoName,
        kommun: rep.p.kommunName,
        score: Math.round(w((r) => r.total) ?? 0),
        pop,
        rep,
        price: rep.price,
        toCity: w((r) => r.p.toCity),
        work: w((r) => r.workAvg),
        safety,
      })
    }
    return out.sort((a, b) => b.score - a.score)
  }, [rows])

  const kommuner = useMemo(() => [...new Set(groups.map((g) => g.kommun))].sort((a, b) => a.localeCompare(b, 'sv')), [groups])
  const list = groups
    .filter((g) => kommun === 'alla' || g.kommun === kommun)
    .filter((g) => !onlyBudget || g.price == null || g.price <= prefs.budget)
    .filter((g) => !prefs.excludeUtsatta || (g.safety !== 'sarskilt' && g.safety !== 'utsatt'))
    .slice(0, 60)

  return (
    <div className="ranking">
      <div className="rank-filters">
        <select value={kommun} onChange={(e) => setKommun(e.target.value)}>
          <option value="alla">Alla kommuner</option>
          {kommuner.map((k) => (
            <option key={k}>{k}</option>
          ))}
        </select>
        <label className="check">
          <input type="checkbox" checked={onlyBudget} onChange={(e) => setOnlyBudget(e.target.checked)} />
          <span>Bara inom budget</span>
        </label>
      </div>
      <p className="hint">Områden (SCB RegSO) sorterade efter er matchning. Klicka för att flyga dit.</p>
      <ol className="rank-list">
        {list.map((g, i) => (
          <li key={g.key}>
            <button onClick={() => onPick(g.rep)}>
              <span className="rank-n">{i + 1}</span>
              <span className="rank-main">
                <b>{g.name}</b>
                <em>
                  {g.kommun} · <i style={{ color: SAFETY[g.safety].color }}>{SAFETY[g.safety].short}</i>
                </em>
                <small>
                  {fmtKr(g.price)} · City {fmtMin(g.toCity)}
                  {g.work != null ? ` · Jobb ${fmtMin(g.work)}` : ''}
                </small>
              </span>
              <span className="rank-score" style={{ background: scoreColor(g.score) }}>
                {g.score}
              </span>
            </button>
          </li>
        ))}
      </ol>
      {!list.length && <p className="hint">Inga områden matchar. Prova att höja budgeten eller minska boytan.</p>}
    </div>
  )
}
