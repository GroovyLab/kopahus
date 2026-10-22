export type SafetyClass = 'sarskilt' | 'utsatt' | 'granslage' | 'blandat' | 'bra' | 'bast' | 'okand'

export interface DesoProps {
  id: string
  regso: string
  regsoName: string
  kommun: string
  kommunName: string
  areaKm2: number
  density: number
  pop?: number
  netIncome?: number
  lowEconPct?: number
  highEconPct?: number
  eduHighPct?: number
  eduPostSecPct?: number
  eduLowPct?: number
  employedPct?: number
  unemployedPct?: number
  ownedPct?: number
  condoPct?: number
  rentalPct?: number
  socioIndex?: number
  areaType?: number
  welfareUnempPct?: number
  police: 'sarskilt' | 'utsatt' | null
  policeName: string | null
  policeShare: number | null
  policeNear: string | null
  hubName: string
  hubDist: number
  hubLines: string[]
  metroDist: number | null
  toCity: number | null
  toUppsala: number | null
  groceryDist: number
  groceryAnyDist: number
  groceries1km: number
  parkDist: number
  bathDist: number
  preschoolDist: number
  schoolMerit: number | null
  schools2km: number
  priceArea: string
  anchor: [number, number]
  access: [number, number][]
  safetyClass: SafetyClass
}

export interface Feature<P> {
  type: 'Feature'
  id?: number
  properties: P
  geometry: GeoJSON.Geometry
}
export interface FC<P> {
  type: 'FeatureCollection'
  features: Feature<P>[]
}

export interface PriceBox {
  sqm: number | null
  avgPrice: number | null
  sold: number | null
  change: number | null
}
export interface PriceArea {
  name: string
  url: string
  updated: string
  br3?: PriceBox
  br12?: PriceBox
  villa3?: PriceBox
  villa12?: PriceBox
  history: { br?: { labels: string[]; values: (number | null)[] }; villa?: { labels: string[]; values: (number | null)[] } }
}

export interface Hub {
  name: string
  lon: number
  lat: number
  lines: string[]
}
export interface Line {
  ref: string
  mode: string
  label: string
  color: string
  wait: number
  hubs: number[]
}
export interface Transit {
  hubs: Hub[]
  lines: Line[]
  edges: [number, number, number, number][]
  transfers: [number, number, number][]
}

export interface School {
  code: string
  name: string
  lon: number
  lat: number
  org: string
  years: string | null
  merit: number | null
  meritPeriod: string | null
  passed9: number | null
  passed6: number | null
  certifiedTeachers: number | null
  pupils: number | null
}

export interface Poi {
  groceries: [number, number, string, number][]
  parks: [number, number, string, string][]
  baths: [number, number, string | null][]
  preschools: [number, number, string][]
  schools: School[]
}

export interface Meta {
  built: string
  sources: Record<string, string>
}

export interface Workplace {
  label: string
  lon: number
  lat: number
}

export interface Prefs {
  tenure: 'br' | 'villa'
  budget: number // kr
  sqm: number // önskad boyta för bostadsrätt
  excludeUtsatta: boolean
  weights: Record<WeightKey, number>
  workplaces: (Workplace | null)[]
}

export type WeightKey =
  | 'safety'
  | 'price'
  | 'metro'
  | 'city'
  | 'uppsala'
  | 'work'
  | 'grocery'
  | 'schools'
  | 'nature'
  | 'socio'

export type Lens = 'score' | 'safety' | 'price' | 'city' | 'uppsala' | 'work' | 'metro' | 'grocery' | 'schools' | 'nature' | 'income'
