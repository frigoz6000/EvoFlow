import { useEffect, useState } from 'react'
import { sitesApi } from '../api/client'
import api from '../api/client'
import ErrorBoundary from '../components/ErrorBoundary'

const domsInfoApi = {
  getAll: (params = {}) => api.get('/domsinfosnapshot', { params }).then(r => r.data),
  populate: () => api.post('/domsinfosnapshot/populate').then(r => r.data),
}

export default function DomsInfo() {
  const [rows, setRows] = useState([])
  const [sites, setSites] = useState([])
  const [loading, setLoading] = useState(false)
  const [pushing, setPushing] = useState(false)
  const [pushMsg, setPushMsg] = useState('')
  const [populating, setPopulating] = useState(false)
  const [populateMsg, setPopulateMsg] = useState('')

  function handlePopulate() {
    setPopulating(true)
    setPopulateMsg('')
    domsInfoApi.populate()
      .then(r => {
        setPopulateMsg(`Snapshot updated: ${r.rowsInserted} rows`)
        loadData(filters)
      })
      .catch(e => setPopulateMsg(e.response?.data?.message || 'Populate failed'))
      .finally(() => setPopulating(false))
  }

  function handleGitPush() {
    setPushing(true)
    setPushMsg('')
    api.post('/git/push')
      .then(r => setPushMsg(r.data?.message || 'Pushed to GitHub'))
      .catch(e => setPushMsg(e.response?.data?.message || 'Push failed'))
      .finally(() => setPushing(false))
  }

  const defaultDate = '2026-02-18'
  const [filters, setFilters] = useState({ siteId: '', dateFrom: defaultDate, dateTo: defaultDate })

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
    domsInfoApi.getAll(params)
      .then(r => setRows(r || []))
      .catch(console.error)
      .finally(() => setLoading(false))
  }

  function handleSearch() { setPage(1); loadData(filters) }
  function handleClear() {
    const reset = { siteId: '', dateFrom: defaultDate, dateTo: defaultDate }
    setFilters(reset)
    setPage(1)
    loadData(reset)
  }

  const [page, setPage] = useState(1)
  const PAGE_SIZE = 100

  const totalTransactions = rows.reduce((s, r) => s + (r.transactions || 0), 0)
  const onlineDevices = new Set(rows.filter(r => r.deviceStatus === 'Online').map(r => r.device)).size
  const totalDevices = new Set(rows.map(r => r.device)).size

  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE))
  const pageRows = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  return (
    <ErrorBoundary fallback="Doms Info page error.">
      <div className="page-header mb-4" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div className="page-title">Doms Info</div>
          <div className="page-subtitle">Pump monitoring overview — all sites</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={handlePopulate}
              disabled={populating}
              title="Refresh snapshot from source tables"
              style={{
                background: 'none',
                border: '1px solid var(--border)',
                borderRadius: 6,
                padding: '6px 10px',
                cursor: populating ? 'not-allowed' : 'pointer',
                color: 'var(--text-secondary)',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                fontSize: 13,
                opacity: populating ? 0.6 : 1,
              }}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="1 4 1 10 7 10"/>
                <path d="M3.51 15a9 9 0 1 0 .49-3.51"/>
              </svg>
              {populating ? 'Refreshing…' : 'Refresh Snapshot'}
            </button>
            <button
              onClick={handleGitPush}
              disabled={pushing}
              title="Push to GitHub"
              style={{
                background: 'none',
                border: '1px solid var(--border)',
                borderRadius: 6,
                padding: '6px 10px',
                cursor: pushing ? 'not-allowed' : 'pointer',
                color: 'var(--text-secondary)',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                fontSize: 13,
                opacity: pushing ? 0.6 : 1,
              }}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="17 8 12 3 7 8"/>
                <line x1="12" y1="3" x2="12" y2="15"/>
              </svg>
              {pushing ? 'Pushing…' : 'Push to GitHub'}
            </button>
          </div>
          {(pushMsg || populateMsg) && (
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{populateMsg || pushMsg}</span>
          )}
        </div>
      </div>

      <div className="stat-cards-row mb-5" style={{ gridTemplateColumns: 'repeat(4,1fr)' }}>
        <div className="stat-card">
          <div className="stat-card-label">Rows</div>
          <div className="stat-card-value">{rows.length}</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-label">Devices</div>
          <div className="stat-card-value">{totalDevices}</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-label">Online</div>
          <div className="stat-card-value" style={{ color: 'var(--green)' }}>{onlineDevices}</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-label">Total Transactions</div>
          <div className="stat-card-value">{totalTransactions.toLocaleString()}</div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <span className="card-title">Doms Info — {rows.length.toLocaleString()} rows (page {page} of {totalPages})</span>
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
            <div className="loading-state"><div className="spinner" />Loading Doms Info...</div>
          ) : (
            <table className="evo-table">
              <thead>
                <tr>
                  <th>DOMS Date</th>
                  <th>Site ID</th>
                  <th>Name</th>
                  <th>Device</th>
                  <th>Device Status</th>
                  <th>Offline Count</th>
                  <th>Error Type</th>
                  <th>Error Text</th>
                  <th>Error Date</th>
                  <th>Lifetime Vol (L)</th>
                  <th>Grade ID</th>
                  <th>Grade Option</th>
                  <th>Grade Description</th>
                  <th>Transactions</th>
                  <th>Peak Flow</th>
                  <th>Uptime (min)</th>
                  <th>Zero Trans</th>
                  <th>Tank ID</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr><td colSpan={18}><div className="empty-state">No data for selected filters</div></td></tr>
                ) : pageRows.map((r, i) => (
                  <tr key={i}>
                    <td style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{r.domsDate}</td>
                    <td><span className="badge badge-blue">{r.siteId}</span></td>
                    <td style={{ color: 'var(--text-secondary)' }}>{r.name}</td>
                    <td style={{ fontWeight: 700 }}><span className="site-id-link">{r.device}</span></td>
                    <td>
                      <span className={`badge ${r.deviceStatus === 'Online' ? 'badge-green' : 'badge-red'}`}>
                        {r.deviceStatus}
                      </span>
                    </td>
                    <td>
                      {r.deviceOfflineCount > 0
                        ? <span className="badge badge-orange">{r.deviceOfflineCount}x</span>
                        : <span style={{ color: 'var(--text-muted)' }}>0</span>}
                    </td>
                    <td style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                      {r.deviceErrorType || '—'}
                    </td>
                    <td>
                      {r.deviceErrorText
                        ? <span className="badge badge-gray">{r.deviceErrorText}</span>
                        : '—'}
                    </td>
                    <td style={{ fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                      {r.deviceErrorDate ? new Date(r.deviceErrorDate).toLocaleDateString() : '—'}
                    </td>
                    <td style={{ color: 'var(--accent)', fontWeight: 600 }}>
                      {r.deviceLifetimeVolume != null
                        ? Number(r.deviceLifetimeVolume).toLocaleString(undefined, { maximumFractionDigits: 0 })
                        : '—'}
                    </td>
                    <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{r.gradeId || '—'}</td>
                    <td style={{ color: 'var(--text-muted)' }}>{r.gradeOption}</td>
                    <td style={{ color: 'var(--text-secondary)' }}>{r.gradeDescription || '—'}</td>
                    <td style={{ fontWeight: 600 }}>{(r.transactions || 0).toLocaleString()}</td>
                    <td style={{ color: 'var(--text-secondary)' }}>
                      {r.peakFlow != null ? Number(r.peakFlow).toFixed(2) : '—'}
                    </td>
                    <td style={{ color: 'var(--text-secondary)' }}>{r.uptime.toLocaleString()}</td>
                    <td style={{ color: r.numberZeroTransactions > 0 ? 'var(--red)' : 'var(--text-muted)' }}>
                      {r.numberZeroTransactions}
                    </td>
                    <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{r.tankId || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="pagination">
          <span className="pagination-info">
            {rows.length.toLocaleString()} total rows · showing {((page - 1) * PAGE_SIZE) + 1}–{Math.min(page * PAGE_SIZE, rows.length)}
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
