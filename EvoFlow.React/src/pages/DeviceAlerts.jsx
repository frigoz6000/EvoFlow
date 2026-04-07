import { useEffect, useState } from 'react'
import { sitesApi } from '../api/client'
import api from '../api/client'
import ErrorBoundary from '../components/ErrorBoundary'

const deviceAlertsApi = {
  getAll: (params = {}) => api.get('/devicealerts', { params }).then(r => r.data),
}

const defaultDate = '2026-02-18'

export default function DeviceAlerts() {
  const [rows, setRows] = useState([])
  const [sites, setSites] = useState([])
  const [loading, setLoading] = useState(false)
  const [filters, setFilters] = useState({ siteId: '', dateFrom: defaultDate, dateTo: defaultDate, stateFilter: '' })
  const [page, setPage] = useState(1)
  const PAGE_SIZE = 100

  useEffect(() => {
    sitesApi.getAll().then(s => setSites(s || [])).catch(console.error)
    loadData({ siteId: '', dateFrom: defaultDate, dateTo: defaultDate, stateFilter: '' })
  }, [])

  function loadData(f) {
    setLoading(true)
    const params = {}
    if (f.siteId) params.siteId = f.siteId
    if (f.dateFrom) params.dateFrom = f.dateFrom
    if (f.dateTo) params.dateTo = f.dateTo
    deviceAlertsApi.getAll(params)
      .then(r => {
        let data = r || []
        if (f.stateFilter) data = data.filter(row => row.state === f.stateFilter)
        setRows(data)
        setPage(1)
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }

  function handleSearch() { loadData(filters) }
  function handleClear() {
    const reset = { siteId: '', dateFrom: defaultDate, dateTo: defaultDate, stateFilter: '' }
    setFilters(reset)
    loadData(reset)
  }

  const offlineCount = rows.filter(r => !r.online).length
  const uniqueStates = [...new Set(rows.map(r => r.state))].sort()

  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE))
  const pageRows = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  return (
    <ErrorBoundary fallback="Device Alerts page error.">
      <div className="page-header mb-4">
        <div>
          <div className="page-title">Device Alerts</div>
          <div className="page-subtitle">Pump device status log — states and error bit flags</div>
        </div>
      </div>

      <div className="stat-cards-row mb-5" style={{ gridTemplateColumns: 'repeat(3,1fr)' }}>
        <div className="stat-card">
          <div className="stat-card-label">Total Records</div>
          <div className="stat-card-value">{rows.length.toLocaleString()}</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-label">Offline Devices</div>
          <div className="stat-card-value" style={{ color: offlineCount > 0 ? 'var(--red)' : 'var(--green)' }}>
            {offlineCount}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-card-label">Distinct States</div>
          <div className="stat-card-value">{uniqueStates.length}</div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <span className="card-title">Device Alerts — {rows.length.toLocaleString()} rows (page {page} of {totalPages})</span>
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
          <select className="filter-select" value={filters.stateFilter}
            onChange={e => setFilters(f => ({ ...f, stateFilter: e.target.value }))}>
            <option value="">All States</option>
            {uniqueStates.map(st => <option key={st} value={st}>{st}</option>)}
          </select>
          <button className="btn btn-primary btn-sm" onClick={handleSearch}>Search</button>
          <button className="btn btn-outline btn-sm" onClick={handleClear}>Clear</button>
        </div>

        <div className="table-responsive">
          {loading ? (
            <div className="loading-state"><div className="spinner" />Loading Device Alerts...</div>
          ) : (
            <table className="evo-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Site ID</th>
                  <th>Site Name</th>
                  <th>Device</th>
                  <th>Online</th>
                  <th>Offline Count</th>
                  <th>Snapshot UTC</th>
                  <th>State</th>
                  <th>Sub State Bits</th>
                  <th>Sub State 2 Bits</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr><td colSpan={10}><div className="empty-state">No data for selected filters</div></td></tr>
                ) : pageRows.map((r, i) => (
                  <tr key={i}>
                    <td style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{r.businessDate}</td>
                    <td><span className="badge badge-blue">{r.siteId}</span></td>
                    <td style={{ color: 'var(--text-secondary)' }}>{r.siteName}</td>
                    <td style={{ fontWeight: 700 }}><span className="site-id-link">{r.deviceId}</span></td>
                    <td>
                      <span className={`badge ${r.online ? 'badge-green' : 'badge-red'}`}>
                        {r.online ? 'Online' : 'Offline'}
                      </span>
                    </td>
                    <td>
                      {r.offlineCount > 0
                        ? <span className="badge badge-orange">{r.offlineCount}x</span>
                        : <span style={{ color: 'var(--text-muted)' }}>0</span>}
                    </td>
                    <td style={{ fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                      {r.snapshotUtc ? new Date(r.snapshotUtc).toLocaleString() : '—'}
                    </td>
                    <td>
                      <span className={`badge ${r.state === 'idle' ? 'badge-gray' : r.state === 'dispensing' ? 'badge-green' : 'badge-orange'}`}>
                        {r.state}
                      </span>
                    </td>
                    <td style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--text-muted)' }}>
                      {r.subStateBits || '—'}
                    </td>
                    <td style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--text-muted)' }}>
                      {r.subState2Bits || '—'}
                    </td>
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
