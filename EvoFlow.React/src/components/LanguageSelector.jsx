import { useState, useRef, useEffect } from 'react'
import { useLanguage, LANGUAGES } from '../i18n/LanguageContext'
import { FlagGB, FlagFR, FlagES, FlagDE, FlagIT, FlagPT } from './FlagIcons'

const FLAG_COMPONENTS = { en: FlagGB, fr: FlagFR, es: FlagES, de: FlagDE, it: FlagIT, pt: FlagPT }

function LangFlag({ code, size = 22 }) {
  const Comp = FLAG_COMPONENTS[code]
  return Comp ? <Comp size={size} /> : null
}

export default function LanguageSelector() {
  const { lang, setLanguage } = useLanguage()
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  const current = LANGUAGES.find(l => l.code === lang) || LANGUAGES[0]

  useEffect(() => {
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        className="topbar-icon-btn"
        onClick={() => setOpen(o => !o)}
        title={current.label}
        style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 8px' }}
      >
        <LangFlag code={current.code} size={22} />
        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-primary)', letterSpacing: 0.5 }}>
          {current.code.toUpperCase()}
        </span>
        <svg width="8" height="8" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.8"
          style={{ transition: 'transform 0.15s', transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }}>
          <polyline points="1,3 5,7 9,3" />
        </svg>
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 9999,
          background: 'var(--card-bg)', border: '1px solid var(--card-border)',
          borderRadius: 8, boxShadow: 'var(--card-shadow)', overflow: 'hidden', minWidth: 155,
        }}>
          {LANGUAGES.map(l => (
            <button
              key={l.code}
              onClick={() => { setLanguage(l.code); setOpen(false) }}
              style={{
                display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                padding: '8px 12px', border: 'none', cursor: 'pointer', fontSize: 13,
                background: l.code === lang ? 'var(--accent-subtle, rgba(99,102,241,0.1))' : 'transparent',
                color: l.code === lang ? 'var(--accent)' : 'var(--text-primary)',
                fontWeight: l.code === lang ? 700 : 400,
                textAlign: 'left',
                borderBottom: '1px solid var(--table-border)',
              }}
              onMouseEnter={e => { if (l.code !== lang) e.currentTarget.style.background = 'var(--hover-bg, rgba(0,0,0,0.04))' }}
              onMouseLeave={e => { if (l.code !== lang) e.currentTarget.style.background = 'transparent' }}
            >
              {l.code === lang && <LangFlag code={l.code} size={22} />}
              <span style={{ paddingLeft: l.code === lang ? 0 : 32 }}>{l.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
