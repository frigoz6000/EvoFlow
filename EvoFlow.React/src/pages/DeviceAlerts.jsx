import { useEffect, useState, useMemo } from 'react'
import { useLanguage } from '../i18n/LanguageContext'
import { useNavigate } from 'react-router-dom'
import { sitesApi } from '../api/client'
import api from '../api/client'
import ErrorBoundary from '../components/ErrorBoundary'

const deviceAlertsApi = {
  getAll: (params = {}) => api.get('/devicealerts', { params }).then(r => r.data),
}

const defaultDate = new Date().toISOString().slice(0, 10)

function SortIcon({ col, sortCol, sortDir }) {
  if (sortCol !== col) return <span style={{ color: 'var(--text-muted)', marginLeft: 3, fontSize: 10 }}>⇅</span>
  return <span style={{ marginLeft: 3, fontSize: 10 }}>{sortDir === 'asc' ? '↑' : '↓'}</span>
}

export default function DeviceAlerts() {
  const navigate = useNavigate()
  const { t } = useLanguage()
  const [rows, setRows] = useState([])
  const [sites, setSites] = useState([])
  const [loading, setLoading] = useState(false)
  const [filters, setFilters] = useState({ siteId: '', dateFrom: defaultDate, dateTo: defaultDate, stateFilter: '' })
  const [siteSearch, setSiteSearch] = useState('')
  const [sortCol, setSortCol] = useState(null)
  const [sortDir, setSortDir] = useState('asc')
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
    setSiteSearch('')
    loadData(reset)
  }

  function handleSort(col) {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortCol(col); setSortDir('asc') }
    setPage(1)
  }

  const offlineCount = rows.filter(r => !r.online).length
  const uniqueStates = [...new Set(rows.map(r => r.state))].sort()

  const displayRows = useMemo(() => {
    let result = rows
    if (siteSearch.trim()) {
      const q = siteSearch.trim().toLowerCase()
      result = result.filter(r =>
        (r.siteId || '').toLowerCase().includes(q) ||
        (r.siteName || '').toLowerCase().includes(q)
      )
    }
    if (sortCol) {
      result = [...result].sort((a, b) => {
        const av = a[sortCol] ?? '', bv = b[sortCol] ?? ''
        const cmp = typeof av === 'number' && typeof bv === 'number'
          ? av - bv : String(av).localeCompare(String(bv), undefined, { numeric: true })
        return sortDir === 'asc' ? cmp : -cmp
      })
    }
    return result
  }, [rows, siteSearch, sortCol, sortDir])

  const totalPages = Math.max(1, Math.ceil(displayRows.length / PAGE_SIZE))
  const pageRows = displayRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  return (
    <ErrorBoundary fallback="Device Alerts page error.">
      <div className="page-header mb-4">
        <div>
          <div className="page-title">{t('page_title_device_alerts')}</div>
          <div className="page-subtitle">Pump device status log — states and error bit flags</div>
        </div>
      </div>

      <div className="stat-cards-row mb-5" style={{ gridTemplateColumns: 'repeat(3,1fr)' }}>
        <div className="stat-card">
          <div className="stat-card-label">{t('stat_total_records')}</div>
          <div className="stat-card-value">{rows.length.toLocaleString()}</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-label">{t('stat_offline_devices')}</div>
          <div className="stat-card-value" style={{ color: offlineCount > 0 ? 'var(--red)' : 'var(--green)' }}>
            {offlineCount}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-card-label">{t('stat_distinct_states')}</div>
          <div className="stat-card-value">{uniqueStates.length}</div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <span className="card-title">Device Alerts — {displayRows.length.toLocaleString()} rows (page {page} of {totalPages})</span>
        </div>

        <div className="filters-bar">
          <select className="filter-select" value={filters.siteId}
            onChange={e => setFilters(f => ({ ...f, siteId: e.target.value }))}>
            <option value="">{t('all_sites')}</option>
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
            <option value="">{t('all_states')}</option>
            {uniqueStates.map(st => <option key={st} value={st}>{st}</option>)}
          </select>
          <button className="btn btn-primary btn-sm" onClick={handleSearch}>Search</button>
          <button className="btn btn-outline btn-sm" onClick={handleClear}>Clear</button>
          <input
            type="text"
            className="filter-search"
            placeholder="Filter site ID / name…"
            value={siteSearch}
            onChange={e => { setSiteSearch(e.target.value); setPage(1) }}
            style={{ minWidth: 160 }}
          />
        </div>

        <div className="table-responsive">
          {loading ? (
            <div className="loading-state"><div className="spinner" />{t('loading_device_alerts')}</div>
          ) : (
            <table className="evo-table">
              <thead>
                <tr>
                  {[['businessDate','Date'],['siteId','Site ID'],['siteName','Site Name'],['deviceId','Device'],['online','Online'],['offlineCount','Offline Count'],['snapshotUtc','Snapshot UTC'],['state','State'],['subStateBits','Sub State Bits'],['subState2Bits','Sub State 2 Bits']].map(([col, label]) => (
                    <th key={col} onClick={() => handleSort(col)} style={{ cursor: 'pointer', userSelect: 'none' }}>
                      {label}<SortIcon col={col} sortCol={sortCol} sortDir={sortDir} />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr><td colSpan={10}><div className="empty-state">No data for selected filters</div></td></tr>
                ) : pageRows.map((r, i) => (
                  <tr key={i}>
                    <td style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{r.businessDate}</td>
                    <td><span className="badge badge-blue" style={{ cursor: 'pointer' }} onClick={() => navigate(`/sites/${r.siteId}`)}>{r.siteId}</span></td>
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
            {displayRows.length.toLocaleString()} total rows · showing {Math.min((page - 1) * PAGE_SIZE + 1, displayRows.length)}–{Math.min(page * PAGE_SIZE, displayRows.length)}
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
