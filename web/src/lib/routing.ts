import type { Transit } from './types'

/** Gångtid eller anslutningsbuss till/från en station (samma modell som i datapipelinen). */
export function accessMinutes(meters: number): number {
  if (meters <= 1300) return (meters * 1.25) / 80
  return 8 + (meters * 1.3) / 300
}

export function distM(lon1: number, lat1: number, lon2: number, lat2: number): number {
  const k = 111320
  const dx = (lon2 - lon1) * k * Math.cos((((lat1 + lat2) / 2) * Math.PI) / 180)
  const dy = (lat2 - lat1) * 110540
  return Math.hypot(dx, dy)
}

type Adj = Map<number, [number, number][]>

/** Förbereder grannlistor för snabba sökningar i spårnätet. */
export class Router {
  private t: Transit
  private ride: Map<string, [string, number][]> = new Map()
  private hubLines: Map<number, Set<number>> = new Map()
  private walks: Adj = new Map()

  constructor(t: Transit) {
    this.t = t
    for (const [li, a, b, m] of t.edges) {
      const ka = `${a}:${li}`
      const kb = `${b}:${li}`
      if (!this.ride.has(ka)) this.ride.set(ka, [])
      if (!this.ride.has(kb)) this.ride.set(kb, [])
      this.ride.get(ka)!.push([kb, m])
      this.ride.get(kb)!.push([ka, m])
      for (const h of [a, b]) {
        if (!this.hubLines.has(h)) this.hubLines.set(h, new Set())
        this.hubLines.get(h)!.add(li)
      }
    }
    for (const [a, b, m] of t.transfers) {
      if (!this.walks.has(a)) this.walks.set(a, [])
      if (!this.walks.has(b)) this.walks.set(b, [])
      this.walks.get(a)!.push([b, m])
      this.walks.get(b)!.push([a, m])
    }
  }

  /** Restid (min) från en punkt till alla bytespunkter, inklusive anslutning och väntetid. */
  fromPoint(lon: number, lat: number): Float32Array {
    const { hubs, lines } = this.t
    const best = new Float32Array(hubs.length).fill(Infinity)
    const dist = new Map<string, number>()
    const heap = new MinHeap()
    hubs.forEach((h, i) => {
      const d = distM(lon, lat, h.lon, h.lat)
      if (d > 6000) return
      const acc = accessMinutes(d)
      for (const li of this.hubLines.get(i) ?? []) heap.push(acc + lines[li].wait, `${i}:${li}`)
    })
    while (heap.size) {
      const [d, s] = heap.pop()!
      if (dist.has(s)) continue
      dist.set(s, d)
      const [hs, ls] = s.split(':')
      const h = +hs
      const li = +ls
      if (d < best[h]) best[h] = d
      for (const [t, m] of this.ride.get(s) ?? []) if (!dist.has(t)) heap.push(d + m, t)
      for (const lj of this.hubLines.get(h) ?? []) {
        if (lj !== li) {
          const k = `${h}:${lj}`
          if (!dist.has(k)) heap.push(d + 2 + lines[lj].wait, k)
        }
      }
      for (const [h2, w] of this.walks.get(h) ?? []) {
        for (const lj of this.hubLines.get(h2) ?? []) {
          const k = `${h2}:${lj}`
          if (!dist.has(k)) heap.push(d + w + lines[lj].wait, k)
        }
      }
    }
    return best
  }
}

/** Restid från ett område (via dess förberäknade närmaste stationer) till en arbetsplats. */
export function travelToTarget(
  access: [number, number][],
  anchor: [number, number],
  fromTarget: Float32Array,
  target: { lon: number; lat: number },
): number {
  let best = Infinity
  for (const [hub, acc] of access) {
    const v = acc + fromTarget[hub]
    if (v < best) best = v
  }
  // Nära arbetsplatsen: gå/cykla direkt kan vara snabbare
  const direct = distM(anchor[0], anchor[1], target.lon, target.lat)
  const directMin = direct < 2500 ? (direct * 1.25) / 80 : direct < 8000 ? (direct * 1.3) / 250 + 2 : Infinity
  return Math.min(best, directMin)
}

class MinHeap {
  private a: [number, string][] = []
  get size() {
    return this.a.length
  }
  push(p: number, v: string) {
    const a = this.a
    a.push([p, v])
    let i = a.length - 1
    while (i > 0) {
      const j = (i - 1) >> 1
      if (a[j][0] <= a[i][0]) break
      ;[a[i], a[j]] = [a[j], a[i]]
      i = j
    }
  }
  pop(): [number, string] | undefined {
    const a = this.a
    if (!a.length) return undefined
    const top = a[0]
    const last = a.pop()!
    if (a.length) {
      a[0] = last
      let i = 0
      for (;;) {
        const l = 2 * i + 1
        const r = l + 1
        let m = i
        if (l < a.length && a[l][0] < a[m][0]) m = l
        if (r < a.length && a[r][0] < a[m][0]) m = r
        if (m === i) break
        ;[a[i], a[m]] = [a[m], a[i]]
        i = m
      }
    }
    return top
  }
}
