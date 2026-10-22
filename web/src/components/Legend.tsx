import { SAFETY, scoreColor } from '../lib/score'
import type { Lens, SafetyClass } from '../lib/types'

const TITLES: Record<Lens, [string, string, string]> = {
  score: ['Er matchning', 'Sämre', 'Bättre'],
  safety: ['Trygghet', '', ''],
  price: ['Pris mot budget', 'Över', 'Gott om marginal'],
  city: ['Restid till T-Centralen', '70 min', '15 min'],
  uppsala: ['Restid till Uppsala C', '130 min', '45 min'],
  work: ['Restid till jobben (längsta)', '80 min', '20 min'],
  metro: ['Avstånd till tunnelbana', '3 km', '400 m'],
  grocery: ['Avstånd till matbutik', '2 km', '300 m'],
  schools: ['Meritvärde närliggande skolor', '200', '290'],
  nature: ['Närhet till park & bad', 'Långt', 'Nära'],
  income: ['Nettoinkomst per person', '200 tkr', '600 tkr'],
}

export default function Legend({ lens, hasWork }: { lens: Lens; hasWork: boolean }) {
  const [title, lo, hi] = TITLES[lens]
  return (
    <div className="legend">
      <span className="legend-title">{title}</span>
      {lens === 'safety' ? (
        <div className="legend-cats">
          {(['bast', 'bra', 'blandat', 'granslage', 'utsatt', 'sarskilt'] as SafetyClass[]).map((c) => (
            <span key={c}>
              <i style={{ background: SAFETY[c].color }} />
              {SAFETY[c].short}
            </span>
          ))}
        </div>
      ) : (
        <>
          <div className="legend-bar" style={{ background: `linear-gradient(90deg, ${[0, 25, 50, 65, 80, 100].map((v) => scoreColor(v)).join(',')})` }} />
          <div className="legend-ends">
            <span>{lo}</span>
            <span>{hi}</span>
          </div>
        </>
      )}
      {lens === 'work' && !hasWork && <small className="muted">Ange arbetsplatser under "Våra krav"</small>}
    </div>
  )
}
