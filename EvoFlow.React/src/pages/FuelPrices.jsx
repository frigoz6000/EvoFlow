import { useEffect, useState } from 'react'
import { fuelGradePricesApi } from '../api/client'
import ErrorBoundary from '../components/ErrorBoundary'

function fmt(dt) {
  if (!dt) return '—'
  return new Date(dt).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export default function FuelPrices() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [siteIdFilter, setSiteIdFilter] = useState('')
  const [siteNameFilter, setSiteNameFilter] = useState('')

  function load() {
    setLoading(true)
    const params = {}
    if (siteIdFilter.trim()) params.siteId = siteIdFilter.trim()
    if (siteNameFilter.trim()) params.siteName = siteNameFilter.trim()
    fuelGradePricesApi.getAll(params)
      .then(d => setRows(d || []))
      .catch(console.error)
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  function handleSearch(e) {
    e.preventDefault()
    load()
  }

  return (
    <ErrorBoundary fallback="Fuel Prices page error.">
      <div className="page-header mb-4">
        <div>
          <div className="page-title">Fuel Prices</div>
          <div className="page-subtitle">Current fuel grade prices by site</div>
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
            <button type="submit" className="btn-primary" style={{ padding: '6px 16px', fontSize: 13 }}>Search</button>
            <button type="button" style={{ padding: '6px 16px', fontSize: 13, borderRadius: 6, border: '1px solid var(--card-border)', background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer' }}
              onClick={() => { setSiteIdFilter(''); setSiteNameFilter(''); setTimeout(() => fuelGradePricesApi.getAll().then(d => setRows(d || [])).catch(console.error), 0) }}>
              Clear
            </button>
          </form>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <span className="card-title">Fuel Grade Prices — {rows.length} record{rows.length !== 1 ? 's' : ''}</span>
        </div>
        <div className="table-responsive">
          {loading ? (
            <div className="loading-state"><div className="spinner" />Loading fuel prices...</div>
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
                {rows.length === 0 ? (
                  <tr><td colSpan={8}><div className="empty-state">No records found</div></td></tr>
                ) : rows.map((r, i) => (
                  <tr key={i}>
                    <td className="font-mono" style={{ fontWeight: 700, color: 'var(--accent)' }}>{r.siteId}</td>
                    <td style={{ fontWeight: 600 }}>{r.siteName}</td>
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
