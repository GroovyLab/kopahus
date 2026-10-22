import type { MapLayersState } from '../map/MapView'
import { WEIGHT_LABELS, fmtKr } from '../lib/score'
import type { Lens, Prefs, WeightKey } from '../lib/types'
import WorkplaceInput from './WorkplaceInput'

const LENSES: { id: Lens; label: string }[] = [
  { id: 'score', label: 'Vår matchning' },
  { id: 'safety', label: 'Trygghet' },
  { id: 'price', label: 'Pris vs budget' },
  { id: 'work', label: 'Restid jobb' },
  { id: 'city', label: 'Restid City' },
  { id: 'uppsala', label: 'Restid Uppsala' },
  { id: 'metro', label: 'Tunnelbana' },
  { id: 'grocery', label: 'Matbutik' },
  { id: 'schools', label: 'Skolor' },
  { id: 'nature', label: 'Natur' },
  { id: 'income', label: 'Inkomst' },
]

interface Props {
  prefs: Prefs
  setPrefs: (f: (p: Prefs) => Prefs) => void
  lens: Lens
  setLens: (l: Lens) => void
  layers: MapLayersState
  setLayers: (f: (l: MapLayersState) => MapLayersState) => void
}

export default function Sidebar({ prefs, setPrefs, lens, setLens, layers, setLayers }: Props) {
  const set = <K extends keyof Prefs>(k: K, v: Prefs[K]) => setPrefs((p) => ({ ...p, [k]: v }))
  return (
    <div className="sidebar">
      <section>
        <h3>Kartan visar</h3>
        <div className="chips">
          {LENSES.map((l) => (
            <button key={l.id} className={`chip ${lens === l.id ? 'on' : ''}`} onClick={() => setLens(l.id)}>
              {l.label}
            </button>
          ))}
        </div>
      </section>

      <section>
        <h3>Boende & budget</h3>
        <div className="seg">
          <button className={prefs.tenure === 'br' ? 'on' : ''} onClick={() => set('tenure', 'br')}>
            Bostadsrätt
          </button>
          <button className={prefs.tenure === 'villa' ? 'on' : ''} onClick={() => set('tenure', 'villa')}>
            Villa
          </button>
        </div>
        <label className="field">
          <span>
            Maxpris <b>{fmtKr(prefs.budget)}</b>
          </span>
          <input
            type="range"
            min={1_500_000}
            max={20_000_000}
            step={250_000}
            value={prefs.budget}
            onChange={(e) => set('budget', +e.target.value)}
          />
        </label>
        {prefs.tenure === 'br' && (
          <label className="field">
            <span>
              Boyta <b>{prefs.sqm} m²</b>
            </span>
            <input type="range" min={25} max={160} step={5} value={prefs.sqm} onChange={(e) => set('sqm', +e.target.value)} />
          </label>
        )}
        <label className="check">
          <input type="checkbox" checked={prefs.excludeUtsatta} onChange={(e) => set('excludeUtsatta', e.target.checked)} />
          <span>Tona ned Polisens utsatta områden och områden över budget</span>
        </label>
      </section>

      <section>
        <h3>Våra arbetsplatser</h3>
        <p className="hint">Ange adress så räknas restiden med kollektivtrafik ut för hela länet.</p>
        {prefs.workplaces.map((w, i) => (
          <WorkplaceInput
            key={i}
            index={i}
            value={w}
            onChange={(v) =>
              setPrefs((p) => {
                const ws = [...p.workplaces]
                ws[i] = v
                return { ...p, workplaces: ws }
              })
            }
          />
        ))}
      </section>

      <section>
        <h3>Vad är viktigast?</h3>
        <p className="hint">0 = spelar ingen roll · 5 = avgörande</p>
        {(Object.keys(WEIGHT_LABELS) as WeightKey[]).map((k) => (
          <label key={k} className="weight">
            <span>{WEIGHT_LABELS[k]}</span>
            <input
              type="range"
              min={0}
              max={5}
              step={1}
              value={prefs.weights[k]}
              onChange={(e) => setPrefs((p) => ({ ...p, weights: { ...p.weights, [k]: +e.target.value } }))}
            />
            <b>{prefs.weights[k]}</b>
          </label>
        ))}
      </section>

      <section>
        <h3>Lager</h3>
        <div className="toggles">
          {(
            [
              ['extrude', '3D-höjd'],
              ['transit', 'Spårtrafik 3D'],
              ['police', 'Polisens gränser'],
              ['groceries', 'Matbutiker'],
              ['schools', 'Skolor'],
            ] as [keyof MapLayersState, string][]
          ).map(([k, label]) => (
            <label key={k} className="toggle">
              <input type="checkbox" checked={layers[k]} onChange={(e) => setLayers((l) => ({ ...l, [k]: e.target.checked }))} />
              <i />
              <span>{label}</span>
            </label>
          ))}
        </div>
      </section>
    </div>
  )
}
