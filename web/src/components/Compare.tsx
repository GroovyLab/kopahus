import type { Row } from '../App'
import { SAFETY, fmtDist, fmtKr, fmtMin, fmtNum, scoreColor } from '../lib/score'
import type { PriceArea, Prefs } from '../lib/types'

export default function Compare({
  rows,
  prices,
  prefs,
  onRemove,
  onPick,
}: {
  rows: Row[]
  prices: Record<string, PriceArea>
  prefs: Prefs
  onRemove: (id: string) => void
  onPick: (r: Row) => void
}) {
  if (!rows.length) {
    return (
      <p className="hint">
        Klicka på ett område på kartan och tryck på <b>☆ Spara</b> för att lägga det här. Sparade områden ligger kvar i den här webbläsaren.
      </p>
    )
  }
  const lines: [string, (r: Row) => React.ReactNode][] = [
    ['Matchning', (r) => <b style={{ color: scoreColor(r.total) }}>{r.total}</b>],
    ['Trygghet', (r) => <span style={{ color: SAFETY[r.p.safetyClass].color }}>{SAFETY[r.p.safetyClass].short}</span>],
    [prefs.tenure === 'br' ? `Pris ${prefs.sqm} m²` : 'Villapris', (r) => fmtKr(r.price)],
    ['Kr/m² BR', (r) => fmtNum(prices[r.p.priceArea]?.br3?.sqm)],
    ['Till City', (r) => fmtMin(r.p.toCity)],
    ['Till Uppsala', (r) => fmtMin(r.p.toUppsala)],
    ...prefs.workplaces.map(
      (w, i) => [`Jobb ${i + 1}`, (r: Row) => (w ? fmtMin(r.work[i]) : '–')] as [string, (r: Row) => React.ReactNode],
    ),
    ['Tunnelbana', (r) => fmtDist(r.p.metroDist)],
    ['Mataffär', (r) => fmtDist(r.p.groceryDist)],
    ['Skolor (merit)', (r) => fmtNum(r.p.schoolMerit)],
    ['Inkomst tkr', (r) => fmtNum(r.p.netIncome)],
    ['Park', (r) => fmtDist(r.p.parkDist)],
    ['Badplats', (r) => fmtDist(r.p.bathDist)],
  ]
  return (
    <div className="compare">
      <div className="compare-scroll">
        <table>
          <thead>
            <tr>
              <th />
              {rows.map((r) => (
                <th key={r.p.id}>
                  <button className="link" onClick={() => onPick(r)}>
                    {r.p.regsoName}
                  </button>
                  <small>{r.p.kommunName}</small>
                  <button className="x small" onClick={() => onRemove(r.p.id)} aria-label="Ta bort">
                    ×
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {lines.map(([label, f]) => (
              <tr key={label}>
                <td>{label}</td>
                {rows.map((r) => (
                  <td key={r.p.id}>{f(r)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
