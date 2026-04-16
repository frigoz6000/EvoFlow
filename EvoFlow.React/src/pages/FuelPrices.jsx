import { useEffect, useState } from 'react'
import { useLanguage } from '../i18n/LanguageContext'
import { fuelGradePricesApi } from '../api/client'
import ErrorBoundary from '../components/ErrorBoundary'

function fmt(dt) {
  if (!dt) return '—'
  return new Date(dt).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

// Non-compliant: DtSentToGov is null OR DtSentToGov <= DtFuelChange
function isNonCompliant(r) {
  if (!r.dtFuelChange) return false
  if (!r.dtSentToGov) return true
  return new Date(r.dtSentToGov) <= new Date(r.dtFuelChange)
}

export default function FuelPrices() {
  const { t } = useLanguage()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [siteIdFilter, setSiteIdFilter] = useState('')
  const [siteNameFilter, setSiteNameFilter] = useState('')
  const [nonCompliantOnly, setNonCompliantOnly] = useState(false)

  function load(params = {}) {
    setLoading(true)
    fuelGradePricesApi.getAll(params)
      .then(d => setRows(d || []))
      .catch(console.error)
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  function handleSearch(e) {
    e.preventDefault()
    const params = {}
    if (siteIdFilter.trim()) params.siteId = siteIdFilter.trim()
    if (siteNameFilter.trim()) params.siteName = siteNameFilter.trim()
    load(params)
  }

  function handleClear() {
    setSiteIdFilter('')
    setSiteNameFilter('')
    setNonCompliantOnly(false)
    load()
  }

  const displayed = nonCompliantOnly ? rows.filter(isNonCompliant) : rows
  const nonCompliantCount = rows.filter(isNonCompliant).length

  return (
    <ErrorBoundary fallback="Fuel Prices page error.">
      <div className="page-header mb-4">
        <div>
          <div className="page-title">{t('page_title_fuel_prices')}</div>
          <div className="page-subtitle">{t('page_subtitle_fuel_prices')}</div>
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
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, paddingBottom: 2 }}>
              <input
                type="checkbox"
                id="nonCompliantOnly"
                checked={nonCompliantOnly}
                onChange={e => setNonCompliantOnly(e.target.checked)}
                style={{ cursor: 'pointer', width: 15, height: 15 }}
              />
              <label htmlFor="nonCompliantOnly" style={{ fontSize: 13, cursor: 'pointer', color: 'var(--text-primary)', userSelect: 'none' }}>
                Gov not notified only
                {nonCompliantCount > 0 && (
                  <span style={{
                    marginLeft: 6, background: '#ef4444', color: '#fff',
                    borderRadius: 10, padding: '1px 7px', fontSize: 11, fontWeight: 700
                  }}>{nonCompliantCount}</span>
                )}
              </label>
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
          <span className="card-title">Fuel Grade Prices — {displayed.length} record{displayed.length !== 1 ? 's' : ''}</span>
          {nonCompliantCount > 0 && !nonCompliantOnly && (
            <span style={{ fontSize: 12, color: '#ef4444', marginLeft: 12 }}>
              ⚠ {nonCompliantCount} record{nonCompliantCount !== 1 ? 's' : ''} not yet notified to Gov
            </span>
          )}
        </div>
        <div className="table-responsive">
          {loading ? (
            <div className="loading-state"><div className="spinner" />{t('loading_fuel_prices')}</div>
          ) : (
            <table className="evo-table">
              <thead>
                <tr>
                  <th>Site ID</th>
                  <th>Site Name</th>
                  <th>Grade</th>
                  <th>Short Code</th>
                  <th style={{ textAlign: 'right' }}>Unit Price (£)</th>
                  <th>Fuel Change Date</th>
                  <th>Date Sent to Gov</th>
                  <th>Date Last Received</th>
                </tr>
              </thead>
              <tbody>
                {displayed.length === 0 ? (
                  <tr><td colSpan={8}><div className="empty-state">No records found</div></td></tr>
                ) : displayed.map((r, i) => {
                  const alert = isNonCompliant(r)
                  return (
                    <tr key={i} style={alert ? { background: 'rgba(239,68,68,0.07)' } : undefined}>
                      <td className="font-mono" style={{ fontWeight: 700, color: 'var(--accent)' }}>{r.siteId}</td>
                      <td style={{ fontWeight: 600 }}>{r.siteName}</td>
                      <td>{r.gradeDescription}</td>
                      <td className="font-mono" style={{ fontSize: 12 }}>{r.gradeShortCode}</td>
                      <td style={{ textAlign: 'right', fontWeight: 700 }}>£{Number(r.gradeUnitPrice).toFixed(4)}</td>
                      <td style={{ fontSize: 12 }}>{fmt(r.dtFuelChange)}</td>
                      <td style={{ fontSize: 12, color: alert ? '#ef4444' : undefined, fontWeight: alert ? 700 : undefined }}>
                        {fmt(r.dtSentToGov)}
                        {alert && <span title="Gov not notified after fuel change" style={{ marginLeft: 4 }}>⚠</span>}
                      </td>
                      <td style={{ fontSize: 12 }}>{fmt(r.dtLastReceived)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </ErrorBoundary>
  )
}
