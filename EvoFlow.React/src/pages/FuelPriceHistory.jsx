import { useEffect, useState, useCallback } from 'react'
import { useLanguage } from '../i18n/LanguageContext'
import { fuelGradePriceHistoryApi } from '../api/client'
import ErrorBoundary from '../components/ErrorBoundary'

function fmt(dt) {
  if (!dt) return '—'
  return new Date(dt).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

// YYYY-MM-DD in local timezone — avoids UTC-edge-of-day issues
function localDateStr(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function defaultFrom() {
  return localDateStr(new Date())
}

function defaultTo() {
  return localDateStr(new Date())
}

export default function FuelPriceHistory() {
  const { t } = useLanguage()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [siteIdFilter, setSiteIdFilter] = useState('')
  const [siteNameFilter, setSiteNameFilter] = useState('')
  const [fromDate, setFromDate] = useState(defaultFrom)
  const [toDate, setToDate] = useState(defaultTo)

  const load = useCallback((params) => {
    setLoading(true)
    fuelGradePriceHistoryApi.getAll(params)
      .then(d => setRows(d || []))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    load({ fromDate: defaultFrom(), toDate: defaultTo() })
  }, [load])

  function buildParams(from, to, sid, sname) {
    // toDate is inclusive — pass next day so SQL < comparison includes the selected day
    const nextDay = new Date(to + 'T00:00:00')
    nextDay.setDate(nextDay.getDate() + 1)
    const params = { fromDate: from, toDate: localDateStr(nextDay) }
    if (sid.trim()) params.siteId = sid.trim()
    if (sname.trim()) params.siteName = sname.trim()
    return params
  }

  function handleSearch(e) {
    e.preventDefault()
    load(buildParams(fromDate, toDate, siteIdFilter, siteNameFilter))
  }

  function handleClear() {
    const from = defaultFrom()
    const to = defaultTo()
    setSiteIdFilter('')
    setSiteNameFilter('')
    setFromDate(from)
    setToDate(to)
    load(buildParams(from, to, '', ''))
  }

  return (
    <ErrorBoundary fallback="Fuel Price History page error.">
      <div className="page-header mb-4">
        <div>
          <div className="page-title">{t('page_title_price_history')}</div>
          <div className="page-subtitle">{t('page_subtitle_price_history')}</div>
        </div>
      </div>

      <div className="card mb-4">
        <div className="card-header"><span className="card-title">Filters</span></div>
        <div style={{ padding: '12px 16px' }}>
          <form onSubmit={handleSearch} style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div>
              <label style={{ display: 'block', fontSize: 12, marginBottom: 4, color: 'var(--text-secondary)' }}>Site ID</label>
              <input
                type="text"
                value={siteIdFilter}
                onChange={e => setSiteIdFilter(e.target.value)}
                placeholder="e.g. 3001"
                style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid var(--card-border)', background: 'var(--input-bg, var(--card-bg))', color: 'var(--text-primary)', fontSize: 13, width: 140 }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, marginBottom: 4, color: 'var(--text-secondary)' }}>Site Name</label>
              <input
                type="text"
                value={siteNameFilter}
                onChange={e => setSiteNameFilter(e.target.value)}
                placeholder="e.g. Site 001"
                style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid var(--card-border)', background: 'var(--input-bg, var(--card-bg))', color: 'var(--text-primary)', fontSize: 13, width: 180 }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, marginBottom: 4, color: 'var(--text-secondary)' }}>From Date</label>
              <input
                type="date"
                value={fromDate}
                onChange={e => setFromDate(e.target.value)}
                style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid var(--card-border)', background: 'var(--input-bg, var(--card-bg))', color: 'var(--text-primary)', fontSize: 13 }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, marginBottom: 4, color: 'var(--text-secondary)' }}>To Date</label>
              <input
                type="date"
                value={toDate}
                onChange={e => setToDate(e.target.value)}
                style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid var(--card-border)', background: 'var(--input-bg, var(--card-bg))', color: 'var(--text-primary)', fontSize: 13 }}
              />
            </div>
            <button type="submit" className="btn-primary" style={{
              padding: '8px 20px', fontSize: 13, borderRadius: 20,
              display: 'inline-flex', alignItems: 'center', gap: 6,
              boxShadow: '0 2px 8px rgba(74,124,247,0.25)',
              letterSpacing: '0.2px', fontWeight: 600
            }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
              Search
            </button>
            <button type="button" style={{
              padding: '8px 16px', fontSize: 13, borderRadius: 20,
              border: '1px solid var(--card-border)', background: 'transparent',
              color: 'var(--text-secondary)', cursor: 'pointer',
              display: 'inline-flex', alignItems: 'center', gap: 5,
              transition: 'all 0.15s', fontFamily: 'inherit', fontWeight: 500
            }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.color = 'var(--accent)' }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--card-border)'; e.currentTarget.style.color = 'var(--text-secondary)' }}
              onClick={handleClear}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
              Clear
            </button>
          </form>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <span className="card-title">Price History — {rows.length} record{rows.length !== 1 ? 's' : ''}</span>
        </div>
        <div className="table-responsive">
          {loading ? (
            <div className="loading-state"><div className="spinner" />{t('loading_price_history')}</div>
          ) : (
            <table className="evo-table">
              <thead>
                <tr>
                  <th>Site ID</th>
                  <th>Site Name</th>
                  <th>History Date</th>
                  <th>Grade</th>
                  <th>Short Code</th>
                  <th style={{ textAlign: 'right' }}>Unit Price (£)</th>
                  <th>Fuel Change Date</th>
                  <th>Date Sent to Gov</th>
                  <th>Date Last Received</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr><td colSpan={9}><div className="empty-state">No records found</div></td></tr>
                ) : rows.map((r, i) => (
                  <tr key={i}>
                    <td className="font-mono" style={{ fontWeight: 700, color: 'var(--accent)' }}>{r.siteId}</td>
                    <td style={{ fontWeight: 600 }}>{r.siteName}</td>
                    <td style={{ fontSize: 12 }}>{fmt(r.historyDate)}</td>
                    <td>{r.gradeDescription}</td>
                    <td className="font-mono" style={{ fontSize: 12 }}>{r.gradeShortCode}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700 }}>£{Number(r.gradeUnitPrice).toFixed(4)}</td>
                    <td style={{ fontSize: 12 }}>{fmt(r.dtFuelChange)}</td>
                    <td style={{ fontSize: 12 }}>{fmt(r.dtSentToGov)}</td>
                    <td style={{ fontSize: 12 }}>{fmt(r.dtLastReceived)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </ErrorBoundary>
  )
}
