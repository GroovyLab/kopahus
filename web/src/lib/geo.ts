/** Geokodning via OpenStreetMap Nominatim (gratis, max ~1 anrop/s). */
const VIEWBOX = '17.2,60.2,19.4,58.7'

export interface GeoResult {
  label: string
  lon: number
  lat: number
  street?: string
  kind: string
}

let last = 0
async function throttle() {
  const wait = Math.max(0, last + 1100 - Date.now())
  last = Date.now() + wait
  if (wait) await new Promise((r) => setTimeout(r, wait))
}

export async function searchPlaces(q: string, signal?: AbortSignal): Promise<GeoResult[]> {
  await throttle()
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=7&countrycodes=se&viewbox=${VIEWBOX}&bounded=1&accept-language=sv&q=${encodeURIComponent(q)}`
  const r = await fetch(url, { signal })
  if (!r.ok) return []
  const js = (await r.json()) as {
    display_name: string
    lon: string
    lat: string
    type: string
    addresstype?: string
    address?: Record<string, string>
  }[]
  return js.map((x) => ({
    label: niceLabel(x.display_name, x.address),
    lon: +x.lon,
    lat: +x.lat,
    street: x.address?.road,
    kind: x.addresstype ?? x.type,
  }))
}

function niceLabel(display: string, a?: Record<string, string>) {
  if (!a) return display.split(',').slice(0, 3).join(',')
  const place = a.suburb ?? a.quarter ?? a.city_district ?? a.neighbourhood
  const town = a.city ?? a.town ?? a.village ?? a.municipality
  const head = a.road ? `${a.road}${a.house_number ? ' ' + a.house_number : ''}` : display.split(',')[0]
  return [head, place, town].filter((x, i, arr) => x && arr.indexOf(x) === i).join(', ')
}

export async function reverse(lon: number, lat: number): Promise<{ street?: string; houseNumber?: string; suburb?: string; city?: string } | null> {
  await throttle()
  try {
    const r = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=17&accept-language=sv&lat=${lat}&lon=${lon}`,
    )
    if (!r.ok) return null
    const js = (await r.json()) as { address?: Record<string, string> }
    const a = js.address ?? {}
    return {
      street: a.road ?? a.pedestrian ?? a.footway,
      houseNumber: a.house_number,
      suburb: a.suburb ?? a.quarter ?? a.neighbourhood ?? a.city_district,
      city: a.city ?? a.town ?? a.village ?? a.municipality,
    }
  } catch {
    return null
  }
}

/**
 * Booli och Hemnet saknar öppna API:er och deras sök-URL:er kräver interna område-ID:n, så vi
 * länkar via en riktad webbsökning som landar på respektive sajts sida för gatan/området.
 */
const siteSearch = (site: string, q: string) => `https://www.google.com/search?q=${encodeURIComponent(`site:${site} ${q}`)}`
export function booliSoldUrl(q: string) {
  return siteSearch('booli.se', `slutpriser ${q}`)
}
export function booliForSaleUrl(q: string) {
  return siteSearch('booli.se', `till salu ${q}`)
}
export function hemnetSoldUrl(q: string) {
  return siteSearch('hemnet.se', `sålda ${q}`)
}
