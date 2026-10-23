import { useMemo } from 'react'
import type { Row } from '../App'
import { useState } from 'react'
import { PERSON_COLORS, timeAgo } from '../lib/shared'
import { shareMine } from './Account'
import type { Activity, Member, Shared } from '../lib/shared'
import { SAFETY, fmtKr, scoreColor } from '../lib/score'

/** Fliken "Vårt": båda personernas favoriter och senaste historik. */
export default function Ours({
  shared,
  rowById,
  onPick,
  onSetup,
}: {
  shared: Shared
  rowById: Map<string, Row>
  onPick: (desoId: string, lonlat: [number, number] | null) => void
  onSetup: () => void
}) {
  const [msg, setMsg] = useState<string | null>(null)
  const favsBy = useMemo(() => {
    const m = new Map<string, Activity[]>()
    for (const a of shared.activity) {
      if (a.kind !== 'fav') continue
      const k = a.email.toLowerCase()
      if (!m.has(k)) m.set(k, [])
      m.get(k)!.push(a)
    }
    return m
  }, [shared.activity])

  // Senaste unika visningar (ett område per person visas en gång)
  const history = useMemo(() => {
    const seen = new Set<string>()
    const out: Activity[] = []
    for (const a of shared.activity) {
      if (a.kind !== 'view') continue
      const k = `${a.email.toLowerCase()}|${a.deso_id}`
      if (seen.has(k)) continue
      seen.add(k)
      out.push(a)
      if (out.length >= 40) break
    }
    return out
  }, [shared.activity])

  const shareBox = (
    <div className="share-box">
      {shared.me ? (
        <>
          <button className="primary-btn" onClick={async () => setMsg(await shareMine(shared))}>
            Dela mina favoriter med {shared.partner?.name ?? 'den andra'}
          </button>
          {msg && <span className="ok-msg small">{msg}</span>}
          <p className="hint">
            {shared.partner
              ? `${shared.partner.name}s data uppdaterades ${shared.partnerUpdated ? timeAgo(new Date(shared.partnerUpdated).toISOString()) : ''}. Be om en ny länk för att se det senaste.`
              : 'När den andra skickar sin länk och du öppnar den, syns hennes eller hans val här i sin färg.'}
          </p>
        </>
      ) : (
        <>
          <p className="hint">Välj namn och färg (blå eller rosa) så kan ni dela favoriter och historik med varandra via en länk.</p>
          <button className="primary-btn" onClick={onSetup}>
            Vem är du?
          </button>
        </>
      )}
    </div>
  )

  const people: Member[] = [shared.me, shared.partner].filter((m): m is Member => !!m)
  const both = new Set(
    [...(favsBy.get(people[0]?.email.toLowerCase() ?? '') ?? [])]
      .map((a) => a.deso_id)
      .filter((id) => (favsBy.get(people[1]?.email.toLowerCase() ?? '') ?? []).some((b) => b.deso_id === id)),
  )

  return (
    <div className="ours">
      {shareBox}
      {both.size > 0 && (
        <section>
          <h3>Ni båda gillar</h3>
          <ul className="ours-list">
            {[...both].map((id) => {
              const a = favsBy.get(people[0].email.toLowerCase())!.find((x) => x.deso_id === id)!
              return <Item key={id} a={a} row={rowById.get(id)} colors={people.map((p) => PERSON_COLORS[p.color])} onPick={onPick} />
            })}
          </ul>
        </section>
      )}
      {people.map((p) => {
        const list = favsBy.get(p.email.toLowerCase()) ?? []
        return (
          <section key={p.email}>
            <h3>
              <i className="person-dot" style={{ background: PERSON_COLORS[p.color] }} />
              {p.name}s favoriter <span className="count">{list.length}</span>
            </h3>
            {list.length ? (
              <ul className="ours-list">
                {list.map((a) => (
                  <Item key={a.id} a={a} row={rowById.get(a.deso_id)} colors={[PERSON_COLORS[p.color]]} onPick={onPick} />
                ))}
              </ul>
            ) : (
              <p className="hint">Inga favoriter än.</p>
            )}
          </section>
        )
      })}
      <section>
        <h3>Senast tittat på</h3>
        <ul className="ours-feed">
          {history.map((a) => {
            const m = shared.memberOf(a.email)
            const row = rowById.get(a.deso_id)
            return (
              <li key={a.id}>
                <button onClick={() => onPick(a.deso_id, a.lon != null && a.lat != null ? [a.lon, a.lat] : null)}>
                  <i className="person-dot" style={{ background: m ? PERSON_COLORS[m.color] : '#888' }} />
                  <span>
                    <b>{a.label ?? row?.p.regsoName ?? a.deso_id}</b>
                    <small>
                      {m?.name ?? a.email} · {timeAgo(a.created_at)}
                    </small>
                  </span>
                </button>
              </li>
            )
          })}
          {!history.length && <p className="hint">Ingen historik än. Klicka på områden på kartan.</p>}
        </ul>
      </section>
    </div>
  )
}

function Item({
  a,
  row,
  colors,
  onPick,
}: {
  a: Activity
  row?: Row
  colors: string[]
  onPick: (desoId: string, lonlat: [number, number] | null) => void
}) {
  return (
    <li>
      <button onClick={() => onPick(a.deso_id, a.lon != null && a.lat != null ? [a.lon, a.lat] : null)}>
        <span className="dots">
          {colors.map((c, i) => (
            <i key={i} className="person-dot" style={{ background: c }} />
          ))}
        </span>
        <span className="rank-main">
          <b>{a.label ?? row?.p.regsoName}</b>
          {row && (
            <small>
              {row.p.kommunName} · <i style={{ color: SAFETY[row.p.safetyClass].color, fontStyle: 'normal' }}>{SAFETY[row.p.safetyClass].short}</i> ·{' '}
              {fmtKr(row.price)}
            </small>
          )}
        </span>
        {row && (
          <span className="rank-score" style={{ background: scoreColor(row.total) }}>
            {row.total}
          </span>
        )}
      </button>
    </li>
  )
}
