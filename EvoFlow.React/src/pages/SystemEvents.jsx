import { useEffect, useState, useMemo, Fragment } from 'react'
import { useLanguage } from '../i18n/LanguageContext'
import { useNavigate } from 'react-router-dom'
import { sitesApi } from '../api/client'
import api from '../api/client'
import ErrorBoundary from '../components/ErrorBoundary'

const systemEventsApi = {
  getAll: (params = {}) => api.get('/systemevents', { params }).then(r => r.data),
  getCategories: () => api.get('/systemevents/categories').then(r => r.data),
}

function isoDaysAgo(days) {
  const d = new Date()
  d.setDate(d.getDate() - days)
  return d.toISOString().slice(0, 10)
}

const defaultDateTo = isoDaysAgo(0)
const defaultDateFrom = isoDaysAgo(7)

function SortIcon({ col, sortCol, sortDir }) {
  if (sortCol !== col) return <span style={{ color: 'var(--text-muted)', marginLeft: 3, fontSize: 10 }}>⇅</span>
  return <span style={{ marginLeft: 3, fontSize: 10 }}>{sortDir === 'asc' ? '↑' : '↓'}</span>
}

function categoryBadgeClass(category) {
  if (category.startsWith('Fuelling Point Error') || category.startsWith('Tank Gauge Alarm')) return 'badge-red'
  if (category.includes('Offline')) return 'badge-orange'
  if (category.includes('Online') || category === 'Fuelling Point Error Cleared') return 'badge-green'
  if (category.startsWith('Other')) return 'badge-gray'
  return 'badge-blue'
}

const COLUMNS = [
  ['eventDateTime', 'Date / Time', r => r.eventDateTime],
  ['siteId', 'Site ID', r => r.siteId],
  ['siteName', 'Site Name', r => r.siteName],
  ['eventCategory', 'Category', r => r.eventCategory],
  ['deviceId', 'Device', r => r.deviceId],
  ['userName', 'User', r => r.userName],
  ['ipAddress', 'IP Address', r => r.ipAddress],
  ['eventText', 'Text', r => r.eventText],
]

export default function SystemEvents() {
  const navigate = useNavigate()
  const { t } = useLanguage()
  const [rows, setRows] = useState([])
  const [sites, setSites] = useState([])
  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [filters, setFilters] = useState({ siteId: '', dateFrom: defaultDateFrom, dateTo: defaultDateTo, category: '' })
  const [search, setSearch] = useState('')
  const [sortCol, setSortCol] = useState('eventDateTime')
  const [sortDir, setSortDir] = useState('desc')
  const [page, setPage] = useState(1)
  const [expandedId, setExpandedId] = useState(null)
  const PAGE_SIZE = 100

  useEffect(() => {
    sitesApi.getAll().then(s => setSites(s || [])).catch(console.error)
    systemEventsApi.getCategories().then(c => setCategories(c || [])).catch(console.error)
    loadData(filters, search)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function loadData(f, searchText) {
    setLoading(true)
    setError(null)
    const params = {}
    if (f.siteId) params.siteId = f.siteId
    if (f.dateFrom) params.dateFrom = f.dateFrom
    if (f.dateTo) params.dateTo = f.dateTo
    if (f.category) params.category = f.category
    if (searchText && searchText.trim()) params.search = searchText.trim()
    systemEventsApi.getAll(params)
      .then(r => {
        if (!Array.isArray(r)) {
          console.error('Expected an array from /systemevents, got:', r)
          setRows([])
          setError('Unexpected response from the server — has the SystemEvents table been created and the API restarted?')
          return
        }
        setRows(r)
        setPage(1)
      })
      .catch(e => {
        console.error(e)
        setError('Failed to load — has CreateSystemEventsTable.sql been run and the API restarted?')
      })
      .finally(() => setLoading(false))
  }

  function handleSearch() { loadData(filters, search) }
  function handleClear() {
    const reset = { siteId: '', dateFrom: defaultDateFrom, dateTo: defaultDateTo, category: '' }
    setFilters(reset)
    setSearch('')
    loadData(reset, '')
  }

  function handleSort(col) {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortCol(col); setSortDir('asc') }
    setPage(1)
  }

  const categoryCounts = useMemo(() => {
    const m = new Map()
    rows.forEach(r => m.set(r.eventCategory, (m.get(r.eventCategory) || 0) + 1))
    return m
  }, [rows])
  const topCategory = useMemo(() => {
    let best = null
    categoryCounts.forEach((count, cat) => { if (!best || count > best.count) best = { cat, count } })
    return best
  }, [categoryCounts])

  const displayRows = useMemo(() => {
    let result = rows
    if (sortCol) {
      const col = COLUMNS.find(c => c[0] === sortCol)
      const getVal = col ? col[2] : (r) => r[sortCol]
      result = [...result].sort((a, b) => {
        let av = getVal(a), bv = getVal(b)
        av = av ?? ''
        bv = bv ?? ''
        const cmp = typeof av === 'number' && typeof bv === 'number'
          ? av - bv : String(av).localeCompare(String(bv), undefined, { numeric: true })
        return sortDir === 'asc' ? cmp : -cmp
      })
    }
    return result
  }, [rows, sortCol, sortDir])

  const totalPages = Math.max(1, Math.ceil(displayRows.length / PAGE_SIZE))
  const pageRows = displayRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  return (
    <ErrorBoundary fallback="System Events page error.">
      <div className="page-header mb-4">
        <div>
          <div className="page-title">System Events</div>
          <div className="page-subtitle">POS/fuelling point/terminal status, logins, grade availability, price changes, tank alarms &amp; more</div>
        </div>
      </div>

      <div className="stat-cards-row mb-5" style={{ gridTemplateColumns: 'repeat(3,1fr)' }}>
        <div className="stat-card">
          <div className="stat-card-label">Events</div>
          <div className="stat-card-value">{rows.length.toLocaleString()}</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-label">Categories Present</div>
          <div className="stat-card-value">{categoryCounts.size.toLocaleString()}</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-label">Most Common</div>
          <div className="stat-card-value" style={{ fontSize: 15, lineHeight: 1.3 }}>
            {topCategory ? `${topCategory.cat} (${topCategory.count})` : '—'}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <span className="card-title">System Events — {displayRows.length.toLocaleString()} rows (page {page} of {totalPages})</span>
        </div>

        <div className="filters-bar">
          <select className="filter-select" value={filters.siteId}
            onChange={e => setFilters(f => ({ ...f, siteId: e.target.value }))}>
            <option value="">{t('all_sites')}</option>
            {sites.map(s => <option key={s.siteId} value={s.siteId}>{s.siteName}</option>)}
          </select>
          <select className="filter-select" value={filters.category}
            onChange={e => setFilters(f => ({ ...f, category: e.target.value }))}>
            <option value="">All Categories</option>
            {categories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <label style={{ fontSize: 12, color: 'var(--text-secondary)' }}>From</label>
          <input type="date" className="filter-search" style={{ minWidth: 130 }} value={filters.dateFrom}
            onChange={e => setFilters(f => ({ ...f, dateFrom: e.target.value }))} />
          <label style={{ fontSize: 12, color: 'var(--text-secondary)' }}>To</label>
          <input type="date" className="filter-search" style={{ minWidth: 130 }} value={filters.dateTo}
            onChange={e => setFilters(f => ({ ...f, dateTo: e.target.value }))} />
          <button className="btn btn-primary btn-sm" onClick={handleSearch}>Search</button>
          <button className="btn btn-outline btn-sm" onClick={handleClear}>Clear</button>
          <input
            type="text"
            className="filter-search"
            placeholder="Search text / device / user…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleSearch() }}
            style={{ minWidth: 200 }}
          />
        </div>

        <div className="table-responsive">
          {loading ? (
            <div className="loading-state"><div className="spinner" />Loading System Events...</div>
          ) : error ? (
            <div className="empty-state" style={{ color: '#dc2626' }}>{error}</div>
          ) : (
            <table className="evo-table">
              <thead>
                <tr>
                  {COLUMNS.map(([col, label]) => (
                    <th key={col} onClick={() => handleSort(col)} style={{ cursor: 'pointer', userSelect: 'none' }}>
                      {label}<SortIcon col={col} sortCol={sortCol} sortDir={sortDir} />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {displayRows.length === 0 ? (
                  <tr><td colSpan={COLUMNS.length}><div className="empty-state">No events found for selected filters</div></td></tr>
                ) : pageRows.map((r) => (
                  <Fragment key={r.systemEventId}>
                    <tr
                      style={{ cursor: 'pointer' }}
                      onClick={() => setExpandedId(id => id === r.systemEventId ? null : r.systemEventId)}
                    >
                      <td style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{r.eventDateTime?.replace('T', ' ')}</td>
                      <td><span className="badge badge-blue" style={{ cursor: 'pointer' }} onClick={e => { e.stopPropagation(); navigate(`/sites/${r.siteId}`) }}>{r.siteId}</span></td>
                      <td style={{ color: 'var(--text-secondary)' }}>{r.siteName}</td>
                      <td><span className={`badge ${categoryBadgeClass(r.eventCategory)}`}>{r.eventCategory}</span></td>
                      <td style={{ fontWeight: 700 }}>{r.deviceId ? <span className="site-id-link">{r.deviceId}</span> : <span style={{ color: 'var(--text-muted)' }}>—</span>}</td>
                      <td style={{ color: 'var(--text-secondary)' }}>{r.userName || '—'}</td>
                      <td style={{ color: 'var(--text-secondary)' }}>{r.ipAddress || '—'}</td>
                      <td style={{ color: 'var(--text-secondary)', maxWidth: 360, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.eventText}</td>
                    </tr>
                    {expandedId === r.systemEventId && (
                      <tr>
                        <td colSpan={COLUMNS.length} style={{ background: 'var(--surface)' }}>
                          <pre style={{
                            margin: 0, fontSize: 11, fontFamily: 'monospace', whiteSpace: 'pre-wrap',
                            color: 'var(--text-secondary)', maxHeight: 260, overflowY: 'auto',
                          }}>
                            {r.rawXml}
                          </pre>
                        </td>
                      </tr>
                    )}
                  </Fragment>
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
