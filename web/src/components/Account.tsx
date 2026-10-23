import { useState } from 'react'
import { PERSON_COLORS } from '../lib/shared'
import type { Shared } from '../lib/shared'

/** Delar mina favoriter och min historik som en länk (Messenger/SMS på mobil, urklipp på dator). */
export async function shareMine(shared: Shared): Promise<string> {
  const url = shared.shareUrl()
  if (!url) return 'Välj först vem du är.'
  const text = `${shared.me!.name}s favoriter och historik i Boplats Stockholm`
  if (navigator.share && /Mobi|Android|iPhone/i.test(navigator.userAgent)) {
    try {
      await navigator.share({ title: 'Boplats Stockholm', text, url })
      return 'Delat!'
    } catch {
      /* avbrutet, fall tillbaka på urklipp */
    }
  }
  try {
    await navigator.clipboard.writeText(url)
    return 'Länken är kopierad. Klistra in den i ett meddelande.'
  } catch {
    window.prompt('Kopiera länken:', url)
    return 'Kopiera länken och skicka den.'
  }
}

export function AccountButton({ shared, onSetup }: { shared: Shared; onSetup: () => void }) {
  const [menu, setMenu] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  if (!shared.me) {
    return (
      <button className="ghost-btn account" onClick={onSetup}>
        Vem är du?
      </button>
    )
  }
  const other = shared.partner?.name ?? 'den andra'
  return (
    <div className="account-wrap">
      <button className="ghost-btn account" onClick={() => setMenu(!menu)}>
        <i className="person-dot" style={{ background: PERSON_COLORS[shared.me.color] }} />
        {shared.me.name}
      </button>
      {menu && (
        <div className="account-menu">
          <button className="primary-btn" onClick={async () => setMsg(await shareMine(shared))}>
            Dela med {other}
          </button>
          {msg && <span className="ok-msg small">{msg}</span>}
          <button
            onClick={() => {
              setMenu(false)
              onSetup()
            }}
          >
            Ändra namn eller färg
          </button>
          {shared.partner && (
            <button
              onClick={() => {
                if (confirm(`Ta bort ${shared.partner!.name}s favoriter och historik från den här enheten?`)) shared.removePartner()
              }}
            >
              Ta bort {shared.partner.name}s data
            </button>
          )}
        </div>
      )}
    </div>
  )
}

export function ProfileModal({ shared, onClose }: { shared: Shared; onClose: () => void }) {
  const [name, setName] = useState(shared.me?.name ?? '')
  const [color, setColor] = useState<'blue' | 'pink'>(shared.me?.color ?? (shared.partner?.color === 'blue' ? 'pink' : 'blue'))
  return (
    <div className="modal-back" onClick={onClose}>
      <form
        className="modal login"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault()
          if (!name.trim()) return
          shared.setupMe(name, color)
          onClose()
        }}
      >
        <button type="button" className="x modal-x" onClick={onClose} aria-label="Stäng">
          ×
        </button>
        <h2>Vem är du?</h2>
        <p className="muted">
          Dina favoriter och områden du tittat på sparas på den här enheten. Med "Dela" skickar du dem som en länk till den andra, och
          då syns de i din färg hos henne eller honom.
        </p>
        <input required autoFocus placeholder="Ditt namn" value={name} onChange={(e) => setName(e.target.value)} />
        <div className="seg">
          {(['blue', 'pink'] as const).map((c) => (
            <button type="button" key={c} className={color === c ? 'on' : ''} onClick={() => setColor(c)}>
              <i className="person-dot" style={{ background: PERSON_COLORS[c] }} />
              {c === 'blue' ? 'Blå' : 'Rosa'}
            </button>
          ))}
        </div>
        <button className="primary-btn">Spara</button>
      </form>
    </div>
  )
}
