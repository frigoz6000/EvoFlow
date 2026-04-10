import { useEffect, useState } from 'react'
import { sitesApi } from '../api/client'
import api from '../api/client'
import ErrorBoundary from '../components/ErrorBoundary'

const flowRatesApi = {
  getAll: (params = {}) => api.get('/flowrates', { params }).then(r => r.data),
}

const defaultDate = '2026-04-10'

export default function FlowRates() {
  const [rows, setRows] = useState([])
  const [sites, setSites] = useState([])
  const [loading, setLoading] = useState(false)
  const [filters, setFilters] = useState({ siteId: '', dateFrom: defaultDate, dateTo: defaultDate })
  const [page, setPage] = useState(1)
  const PAGE_SIZE = 100

  useEffect(() => {
    sitesApi.getAll().then(s => setSites(s || [])).catch(console.error)
    loadData({ siteId: '', dateFrom: defaultDate, dateTo: defaultDate })
  }, [])

  function loadData(f) {
    setLoading(true)
    const params = {}
    if (f.siteId) params.siteId = f.siteId
    if (f.dateFrom) params.dateFrom = f.dateFrom
    if (f.dateTo) params.dateTo = f.dateTo
    flowRatesApi.getAll(params)
      .then(r => { setRows(r || []); setPage(1) })
      .catch(console.error)
      .finally(() => setLoading(false))
  }

  function handleSearch() { loadData(filters) }
  function handleClear() {
    const reset = { siteId: '', dateFrom: defaultDate, dateTo: defaultDate }
    setFilters(reset)
    loadData(reset)
  }

  const withData = rows.filter(r => r.peakFlowRate != null)
  const avgPeak = withData.length ? (withData.reduce((s, r) => s + r.peakFlowRate, 0) / withData.length).toFixed(2) : '—'
  const maxPeak = withData.length ? Math.max(...withData.map(r => r.peakFlowRate)).toFixed(2) : '—'

  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE))
  const pageRows = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  return (
    <ErrorBoundary fallback="Flow Rates page error.">
      <div className="page-header mb-4">
        <div>
          <div className="page-title">Flow Rates</div>
          <div className="page-subtitle">Pump flow metrics — nominal, average and peak rates</div>
        </div>
      </div>

      <div className="stat-cards-row mb-5" style={{ gridTemplateColumns: 'repeat(3,1fr)' }}>
        <div className="stat-card">
          <div className="stat-card-label">Rows</div>
          <div className="stat-card-value">{rows.length.toLocaleString()}</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-label">Avg Peak Flow (L/min)</div>
          <div className="stat-card-value" style={{ color: 'var(--accent)' }}>{avgPeak}</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-label">Max Peak Flow (L/min)</div>
          <div className="stat-card-value" style={{ color: 'var(--green)' }}>{maxPeak}</div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <span className="card-title">Flow Rates — {rows.length.toLocaleString()} rows (page {page} of {totalPages})</span>
        </div>

        <div className="filters-bar">
          <select className="filter-select" value={filters.siteId}
            onChange={e => setFilters(f => ({ ...f, siteId: e.target.value }))}>
            <option value="">All Sites</option>
            {sites.map(s => <option key={s.siteId} value={s.siteId}>{s.siteName}</option>)}
          </select>
          <label style={{ fontSize: 12, color: 'var(--text-secondary)' }}>From</label>
          <input type="date" className="filter-search" style={{ minWidth: 130 }} value={filters.dateFrom}
            onChange={e => setFilters(f => ({ ...f, dateFrom: e.target.value }))} />
          <label style={{ fontSize: 12, color: 'var(--text-secondary)' }}>To</label>
          <input type="date" className="filter-search" style={{ minWidth: 130 }} value={filters.dateTo}
            onChange={e => setFilters(f => ({ ...f, dateTo: e.target.value }))} />
          <button className="btn btn-primary btn-sm" onClick={handleSearch}>Search</button>
          <button className="btn btn-outline btn-sm" onClick={handleClear}>Clear</button>
        </div>

        <div className="table-responsive">
          {loading ? (
            <div className="loading-state"><div className="spinner" />Loading Flow Rates...</div>
          ) : (
            <table className="evo-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Site ID</th>
                  <th>Site Name</th>
                  <th>Device</th>
                  <th>Grade</th>
                  <th>Fuel</th>
                  <th>Flow Type</th>
                  <th>Transactions</th>
                  <th>Nominal (L/min)</th>
                  <th>Avg (L/min)</th>
                  <th>Peak (L/min)</th>
                  <th>Avg Time to Flow (s)</th>
                  <th>Max Time to Flow (s)</th>
                  <th>Avg Time to Peak (s)</th>
                  <th>Max Time to Peak (s)</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr><td colSpan={15}><div className="empty-state">No data for selected filters</div></td></tr>
                ) : pageRows.map((r, i) => (
                  <tr key={i}>
                    <td style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{r.businessDate}</td>
                    <td><span className="badge badge-blue">{r.siteId}</span></td>
                    <td style={{ color: 'var(--text-secondary)' }}>{r.siteName}</td>
                    <td style={{ fontWeight: 700 }}><span className="site-id-link">{r.deviceId}</span></td>
                    <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{r.gradeOption}</td>
                    <td style={{ color: 'var(--text-secondary)' }}>{r.gradeDescription || r.gradeId || '—'}</td>
                    <td>
                      <span className={`badge ${r.flowType === 'high_speed' ? 'badge-orange' : 'badge-blue'}`}>
                        {r.flowType}
                      </span>
                    </td>
                    <td style={{ fontWeight: 600 }}>{r.totalPumpTrans.toLocaleString()}</td>
                    <td style={{ color: 'var(--text-muted)' }}>{r.nominalFlowRate != null ? Number(r.nominalFlowRate).toFixed(2) : '—'}</td>
                    <td style={{ color: 'var(--accent)' }}>{r.avgFlowRate != null ? Number(r.avgFlowRate).toFixed(2) : '—'}</td>
                    <td style={{ color: 'var(--green)', fontWeight: 600 }}>{r.peakFlowRate != null ? Number(r.peakFlowRate).toFixed(2) : '—'}</td>
                    <td style={{ color: 'var(--text-secondary)' }}>{r.avgTimeToFlow ?? '—'}</td>
                    <td style={{ color: 'var(--text-secondary)' }}>{r.maxTimeToFlow ?? '—'}</td>
                    <td style={{ color: 'var(--text-secondary)' }}>{r.avgTimeToPeakFlow ?? '—'}</td>
                    <td style={{ color: 'var(--text-secondary)' }}>{r.maxTimeToPeakFlow ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="pagination">
          <span className="pagination-info">
            {rows.length.toLocaleString()} total rows · showing {Math.min((page - 1) * PAGE_SIZE + 1, rows.length)}–{Math.min(page * PAGE_SIZE, rows.length)}
          </span>
          <button className="page-btn" disabled={page <= 1} onClick={() => setPage(1)}>«</button>
          <button className="page-btn" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>‹</button>
          <button className="page-btn active">{page}</button>
          <button className="page-btn" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>›</button>
          <button className="page-btn" disabled={page >= totalPages} onClick={() => setPage(totalPages)}>»</button>
        </div>
      </div>
    </ErrorBoundary>
  )
}
