import { useCallback, useEffect, useMemo, useState } from 'react'

/**
 * Delning utan server: varje person sparar sina favoriter och sin historik i webbläsaren och skickar en
 * länk till den andra. Datan ligger efter "#" i länken, och den delen skickas aldrig till någon server.
 */

export interface Member {
  /** 'me' eller 'partner' */
  email: string
  name: string
  color: 'blue' | 'pink'
}

export interface Activity {
  id: number
  email: string
  kind: 'fav' | 'view'
  deso_id: string
  label: string | null
  lon: number | null
  lat: number | null
  created_at: string
}

export const PERSON_COLORS = { blue: '#4da3ff', pink: '#ff6fb5' } as const

interface Entry {
  id: string
  label: string
  lon: number
  lat: number
  at: number
}
interface PersonData {
  name: string
  color: 'blue' | 'pink'
  favs: Entry[]
  views: Entry[]
  updated?: number
}
interface Store {
  me: PersonData | null
  partner: PersonData | null
}

const KEY = 'boplats.people.v1'
const HISTORY_LIMIT = 150
const VIEW_DEDUPE_MS = 15 * 60 * 1000

function loadStore(): Store {
  try {
    const s = localStorage.getItem(KEY)
    if (s) return JSON.parse(s) as Store
  } catch {
    /* privat läge */
  }
  return { me: null, partner: null }
}

// Kompakt format i länken: [namn, färg, favoriter, visningar], där varje post är [id, etikett, lon, lat, minut]
type Packed = [string, 'b' | 'p', [string, string, number, number, number][], [string, string, number, number, number][]]

function pack(d: PersonData): string {
  const e = (x: Entry): [string, string, number, number, number] => [x.id, x.label, +x.lon.toFixed(5), +x.lat.toFixed(5), Math.round(x.at / 60000)]
  const p: Packed = [d.name, d.color === 'blue' ? 'b' : 'p', d.favs.map(e), d.views.slice(0, 60).map(e)]
  const bytes = new TextEncoder().encode(JSON.stringify(p))
  let bin = ''
  bytes.forEach((b) => (bin += String.fromCharCode(b)))
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function unpack(s: string): PersonData | null {
  try {
    const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'))
    const p = JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)))) as Packed
    const valid = (x: unknown[]) => typeof x[0] === 'string' && /^[0-9]{4}[A-C][0-9]{4}$/.test(x[0] as string)
    const e = (x: [string, string, number, number, number]): Entry => ({
      id: x[0],
      label: String(x[1]).slice(0, 120),
      lon: +x[2],
      lat: +x[3],
      at: +x[4] * 60000,
    })
    return {
      name: String(p[0]).slice(0, 40),
      color: p[1] === 'b' ? 'blue' : 'pink',
      favs: p[2].filter(valid).map(e),
      views: p[3].filter(valid).map(e),
      updated: Date.now(),
    }
  } catch {
    return null
  }
}

export interface Shared {
  me: Member | null
  partner: Member | null
  members: Member[]
  activity: Activity[]
  setupMe: (name: string, color: 'blue' | 'pink') => void
  toggleFav: (desoId: string, label: string, lonlat: [number, number]) => void
  logView: (desoId: string, label: string, lonlat: [number, number]) => void
  memberOf: (email: string) => Member | undefined
  shareUrl: () => string | null
  partnerUpdated: number | null
  /** Satt direkt efter att en delningslänk öppnats */
  imported: string | null
  dismissImported: () => void
  removePartner: () => void
}

export function useShared(): Shared {
  const [store, setStore] = useState<Store>(loadStore)
  const [imported, setImported] = useState<string | null>(null)

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(store))
    } catch {
      /* privat läge */
    }
  }, [store])

  // Läs in en delningslänk (#dela=...) och spara som den andra personens data
  useEffect(() => {
    const read = () => {
      const m = window.location.hash.match(/dela=([A-Za-z0-9_-]+)/)
      if (!m) return
      const d = unpack(m[1])
      history.replaceState(null, '', window.location.pathname + window.location.search)
      if (!d) return
      setStore((s) => {
        // Öppnar man sin egen länk ska den inte bli "den andra"
        if (s.me && s.me.name === d.name && s.me.color === d.color) return s
        return { ...s, partner: d }
      })
      setImported(d.name)
    }
    read()
    window.addEventListener('hashchange', read)
    return () => window.removeEventListener('hashchange', read)
  }, [])

  const me = useMemo<Member | null>(() => (store.me ? { email: 'me', name: store.me.name, color: store.me.color } : null), [store.me])
  const partner = useMemo<Member | null>(
    () => (store.partner ? { email: 'partner', name: store.partner.name, color: store.partner.color } : null),
    [store.partner],
  )
  const members = useMemo(() => [me, partner].filter((m): m is Member => !!m), [me, partner])

  const activity = useMemo(() => {
    const out: Activity[] = []
    let n = 0
    const add = (who: string, kind: 'fav' | 'view', list: Entry[]) => {
      for (const e of list)
        out.push({ id: n++, email: who, kind, deso_id: e.id, label: e.label, lon: e.lon, lat: e.lat, created_at: new Date(e.at).toISOString() })
    }
    if (store.me) {
      add('me', 'fav', store.me.favs)
      add('me', 'view', store.me.views)
    }
    if (store.partner) {
      add('partner', 'fav', store.partner.favs)
      add('partner', 'view', store.partner.views)
    }
    return out.sort((a, b) => b.created_at.localeCompare(a.created_at))
  }, [store])

  const setupMe = useCallback((name: string, color: 'blue' | 'pink') => {
    setStore((s) => ({ ...s, me: { favs: [], views: [], ...s.me, name: name.trim().slice(0, 40), color } }))
  }, [])

  const toggleFav = useCallback((id: string, label: string, [lon, lat]: [number, number]) => {
    setStore((s) => {
      if (!s.me) return s
      const has = s.me.favs.some((f) => f.id === id)
      const favs = has ? s.me.favs.filter((f) => f.id !== id) : [{ id, label, lon, lat, at: Date.now() }, ...s.me.favs]
      return { ...s, me: { ...s.me, favs } }
    })
  }, [])

  const logView = useCallback((id: string, label: string, [lon, lat]: [number, number]) => {
    setStore((s) => {
      if (!s.me) return s
      const now = Date.now()
      const last = s.me.views.find((v) => v.id === id)
      if (last && now - last.at < VIEW_DEDUPE_MS) return s
      const views = [{ id, label, lon, lat, at: now }, ...s.me.views.filter((v) => v.id !== id)].slice(0, HISTORY_LIMIT)
      return { ...s, me: { ...s.me, views } }
    })
  }, [])

  const memberOf = useCallback((email: string) => members.find((m) => m.email === email), [members])

  const shareUrl = useCallback(() => {
    if (!store.me) return null
    return `${window.location.origin}${window.location.pathname}#dela=${pack(store.me)}`
  }, [store.me])

  return {
    me,
    partner,
    members,
    activity,
    setupMe,
    toggleFav,
    logView,
    memberOf,
    shareUrl,
    partnerUpdated: store.partner?.updated ?? null,
    imported,
    dismissImported: () => setImported(null),
    removePartner: () => setStore((s) => ({ ...s, partner: null })),
  }
}

export function timeAgo(iso: string): string {
  const s = (Date.now() - new Date(iso).getTime()) / 1000
  if (s < 60) return 'nyss'
  if (s < 3600) return `${Math.round(s / 60)} min sedan`
  if (s < 86400) return `${Math.round(s / 3600)} tim sedan`
  if (s < 86400 * 7) return `${Math.round(s / 86400)} d sedan`
  return new Date(iso).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' })
}
