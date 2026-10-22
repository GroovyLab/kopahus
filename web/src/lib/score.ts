import type { DesoProps, PriceArea, Prefs, SafetyClass, WeightKey } from './types'

export const SAFETY: Record<SafetyClass, { label: string; short: string; color: string; score: number; desc: string }> = {
  bast: {
    label: 'Mycket goda förutsättningar',
    short: 'Bäst',
    color: '#2bb673',
    score: 100,
    desc: 'SCB områdestyp 5: mycket goda socioekonomiska förutsättningar. Inte på polisens lista.',
  },
  bra: {
    label: 'Goda förutsättningar',
    short: 'Bra',
    color: '#8fd16a',
    score: 85,
    desc: 'SCB områdestyp 4: goda socioekonomiska förutsättningar. Inte på polisens lista.',
  },
  blandat: {
    label: 'Blandad socioekonomi',
    short: 'Okej',
    color: '#f2d15c',
    score: 62,
    desc: 'SCB områdestyp 3: blandade socioekonomiska förutsättningar. Inte på polisens lista.',
  },
  granslage: {
    label: 'På gränsen',
    short: 'På gränsen',
    color: '#f39a43',
    score: 35,
    desc: 'SCB områdestyp 1–2 (socioekonomiska utmaningar) och/eller inom 400 m från ett av polisens utsatta områden.',
  },
  utsatt: {
    label: 'Utsatt område (Polisen)',
    short: 'Utsatt',
    color: '#e5484d',
    score: 10,
    desc: 'Ligger till stor del inom ett område som Polisen klassar som utsatt (lägesbild 2025).',
  },
  sarskilt: {
    label: 'Särskilt utsatt område (Polisen)',
    short: 'Särskilt utsatt',
    color: '#a51d3c',
    score: 0,
    desc: 'Ligger till stor del inom ett område som Polisen klassar som särskilt utsatt (lägesbild 2025).',
  },
  okand: { label: 'Uppgift saknas', short: 'Okänt', color: '#6b7280', score: 50, desc: 'SCB redovisar inte områdestyp här.' },
}

export const WEIGHT_LABELS: Record<WeightKey, string> = {
  safety: 'Trygghet',
  price: 'Pris inom budget',
  metro: 'Nära tunnelbana',
  city: 'Restid till City',
  uppsala: 'Restid till Uppsala',
  work: 'Restid till jobben',
  grocery: 'Matbutik nära',
  schools: 'Skolor',
  nature: 'Natur & vatten',
  socio: 'Socioekonomi',
}

export const DEFAULT_PREFS: Prefs = {
  tenure: 'br',
  budget: 5_000_000,
  sqm: 65,
  excludeUtsatta: true,
  weights: { safety: 5, price: 4, metro: 3, city: 2, uppsala: 2, work: 4, grocery: 2, schools: 2, nature: 2, socio: 2 },
  workplaces: [null, null],
}

const clamp = (v: number) => Math.max(0, Math.min(100, v))
/** Linjär skala: bra -> 100, dålig -> 0 */
const lin = (v: number | null | undefined, good: number, bad: number) =>
  v == null || !isFinite(v) ? null : clamp(((bad - v) / (bad - good)) * 100)

export function estimatePrice(p: DesoProps, prices: Record<string, PriceArea>, prefs: Prefs): number | null {
  const area = prices[p.priceArea] ?? prices[kommunSlug(p)]
  if (!area) return null
  if (prefs.tenure === 'br') {
    const sqm = area.br3?.sqm ?? area.br12?.sqm
    return sqm ? sqm * prefs.sqm : null
  }
  // Villa: kommunens medelpris (stadsdelar saknar villastatistik)
  const v = area.villa3?.avgPrice ?? area.villa12?.avgPrice ?? prices[kommunSlug(p)]?.villa3?.avgPrice ?? null
  return v
}

function kommunSlug(p: DesoProps) {
  return p.kommun === '0180' ? 'stockholm' : p.priceArea
}

export interface Components {
  safety: number | null
  price: number | null
  metro: number | null
  city: number | null
  uppsala: number | null
  work: number | null
  grocery: number | null
  schools: number | null
  nature: number | null
  socio: number | null
}

export function components(p: DesoProps, price: number | null, prefs: Prefs, work: number | null): Components {
  const b = prefs.budget
  const nature = [lin(p.parkDist, 250, 2000), lin(p.bathDist, 800, 6000)].filter((x): x is number => x != null)
  const socio = [lin(p.lowEconPct, 3, 30), lin(p.employedPct, 92, 65), lin(p.eduPostSecPct, 70, 25)].filter(
    (x): x is number => x != null,
  )
  return {
    safety: SAFETY[p.safetyClass].score,
    price: price == null ? null : price <= b * 0.8 ? 100 : price <= b ? 100 - ((price - 0.8 * b) / (0.2 * b)) * 40 : clamp(60 - ((price - b) / (0.25 * b)) * 60),
    metro: lin(p.metroDist, 400, 3000),
    city: lin(p.toCity, 15, 70),
    uppsala: lin(p.toUppsala, 45, 130),
    work: lin(work, 20, 80),
    grocery: lin(p.groceryDist, 300, 2000),
    schools: lin(p.schoolMerit, 290, 200),
    nature: nature.length ? nature.reduce((a, c) => a + c, 0) / nature.length : null,
    socio: socio.length ? socio.reduce((a, c) => a + c, 0) / socio.length : null,
  }
}

/**
 * Trygghet fungerar som tak: bra pendling eller låga priser ska inte kunna lyfta ett av Polisens
 * utsatta områden till toppen. Taket gäller när trygghet har vikt 3 eller mer.
 */
export function safetyCap(cls: SafetyClass, prefs: Prefs): number {
  if (prefs.weights.safety < 3) return 100
  return { sarskilt: 15, utsatt: 30, granslage: 60, blandat: 100, bra: 100, bast: 100, okand: 100 }[cls]
}

export function totalScore(c: Components, prefs: Prefs, cls?: SafetyClass): number {
  let s = 0
  let w = 0
  for (const k of Object.keys(prefs.weights) as WeightKey[]) {
    const wt = prefs.weights[k]
    const v = c[k]
    if (!wt || v == null) continue
    s += v * wt
    w += wt
  }
  const raw = w ? Math.round(s / w) : 0
  return cls ? Math.min(raw, safetyCap(cls, prefs)) : raw
}

export const fmtKr = (v: number | null | undefined) =>
  v == null ? '–' : v >= 1e6 ? `${(v / 1e6).toLocaleString('sv-SE', { maximumFractionDigits: 2 })} mkr` : `${Math.round(v).toLocaleString('sv-SE')} kr`
export const fmtNum = (v: number | null | undefined, d = 0) => (v == null ? '–' : v.toLocaleString('sv-SE', { maximumFractionDigits: d }))
export const fmtDist = (m: number | null | undefined) =>
  m == null ? '–' : m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toLocaleString('sv-SE', { maximumFractionDigits: 1 })} km`
export const fmtMin = (m: number | null | undefined) => (m == null || !isFinite(m) ? '–' : `${Math.round(m)} min`)

/** Färgskala grön→gul→röd för 0–100 */
export function scoreColor(v: number | null): string {
  if (v == null) return '#3a4252'
  const stops: [number, [number, number, number]][] = [
    [0, [165, 29, 60]],
    [30, [229, 72, 77]],
    [50, [243, 154, 67]],
    [65, [242, 209, 92]],
    [80, [143, 209, 106]],
    [100, [43, 182, 115]],
  ]
  for (let i = 1; i < stops.length; i++) {
    if (v <= stops[i][0]) {
      const [a, ca] = stops[i - 1]
      const [b, cb] = stops[i]
      const t = (v - a) / (b - a)
      const c = ca.map((x, j) => Math.round(x + (cb[j] - x) * t))
      return `rgb(${c[0]},${c[1]},${c[2]})`
    }
  }
  return 'rgb(43,182,115)'
}
