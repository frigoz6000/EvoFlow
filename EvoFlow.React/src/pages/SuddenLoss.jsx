import { useEffect, useState, useMemo, Fragment } from 'react'
import { useLanguage } from '../i18n/LanguageContext'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { sitesApi } from '../api/client'
import api from '../api/client'
import ErrorBoundary from '../components/ErrorBoundary'

const suddenLossApi = {
  getAll: (params = {}) => api.get('/suddenloss', { params }).then(r => r.data),
}

function isoDaysAgo(days) {
  const d = new Date()
  d.setDate(d.getDate() - days)
  return d.toISOString().slice(0, 10)
}

const defaultDateTo = isoDaysAgo(0)
const defaultDateFrom = isoDaysAgo(30)

function SortIcon({ col, sortCol, sortDir }) {
  if (sortCol !== col) return <span style={{ color: 'var(--text-muted)', marginLeft: 3, fontSize: 10 }}>⇅</span>
  return <span style={{ marginLeft: 3, fontSize: 10 }}>{sortDir === 'asc' ? '↑' : '↓'}</span>
}

function fmtDuration(seconds) {
  if (seconds === null || seconds === undefined) return '—'
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}m ${s}s`
}

const COLUMNS = [
  ['eventDateTime', 'Date / Time', r => r.eventDateTime],
  ['siteId', 'Site ID', r => r.siteId],
  ['siteName', 'Site Name', r => r.siteName],
  ['tankId', 'Tank', r => r.tankId],
  ['isPossible', 'Type', r => r.isPossible],
  ['volumeLostLitres', 'Volume Lost (L)', r => r.volumeLostLitres],
  ['durationSeconds', 'Duration', r => r.durationSeconds],
  ['consumptionRate', 'Cons. Rate', r => r.consumptionRate],
  ['maxRateLPerMin', 'Max Rate (L/min)', r => r.maxRateLPerMin],
  ['eventText', 'Text', r => r.eventText],
]

export default function SuddenLoss() {
  const navigate = useNavigate()
  const { t } = useLanguage()
  const [searchParams] = useSearchParams()

  // Support deep-linking from Volume Discrepancies: /sudden-loss?siteId=X&dateFrom=Y&dateTo=Y
  const initialFilters = {
    siteId: searchParams.get('siteId') || '',
    dateFrom: searchParams.get('dateFrom') || defaultDateFrom,
    dateTo: searchParams.get('dateTo') || defaultDateTo,
    type: '',
  }

  const [rows, setRows] = useState([])
  const [sites, setSites] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [filters, setFilters] = useState(initialFilters)
  const [search, setSearch] = useState('')
  const [sortCol, setSortCol] = useState('eventDateTime')
  const [sortDir, setSortDir] = useState('desc')
  const [page, setPage] = useState(1)
  const [expandedId, setExpandedId] = useState(null)
  const PAGE_SIZE = 100

  useEffect(() => {
    sitesApi.getAll().then(s => setSites(s || [])).catch(console.error)
    loadData(initialFilters, search)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function loadData(f, searchText) {
    setLoading(true)
    setError(null)
    const params = {}
    if (f.siteId) params.siteId = f.siteId
    if (f.dateFrom) params.dateFrom = f.dateFrom
    if (f.dateTo) params.dateTo = f.dateTo
    if (f.type === 'confirmed') params.isPossible = false
    if (f.type === 'possible') params.isPossible = true
    if (searchText && searchText.trim()) params.search = searchText.trim()
    suddenLossApi.getAll(params)
      .then(r => {
        if (!Array.isArray(r)) {
          console.error('Expected an array from /suddenloss, got:', r)
          setRows([])
          setError('Unexpected response from the server — has the SuddenLossEvents table been created and the API restarted?')
          return
        }
        setRows(r)
        setPage(1)
      })
      .catch(e => {
        console.error(e)
        setError('Failed to load — has CreateSuddenLossTable.sql been run and the API restarted?')
      })
      .finally(() => setLoading(false))
  }

  function handleSearch() { loadData(filters, search) }
  function handleClear() {
    const reset = { siteId: '', dateFrom: defaultDateFrom, dateTo: defaultDateTo, type: '' }
    setFilters(reset)
    setSearch('')
    loadData(reset, '')
  }

  function handleSort(col) {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortCol(col); setSortDir('asc') }
    setPage(1)
  }

  const sitesAffected = useMemo(() => new Set(rows.map(r => r.siteId)).size, [rows])
  const totalVolumeLost = useMemo(() => rows.reduce((s, r) => s + (r.volumeLostLitres || 0), 0), [rows])
  const confirmedCount = useMemo(() => rows.filter(r => !r.isPossible).length, [rows])

  const displayRows = useMemo(() => {
    let result = rows
    if (sortCol) {
      const col = COLUMNS.find(c => c[0] === sortCol)
      const getVal = col ? col[2] : (r) => r[sortCol]
      result = [...result].sort((a, b) => {
        let av = getVal(a), bv = getVal(b)
        av = av ?? -Infinity
        bv = bv ?? -Infinity
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
    <ErrorBoundary fallback="Sudden Loss page error.">
      <div className="page-header mb-4">
        <div>
          <div className="page-title">Sudden Loss</div>
          <div className="page-subtitle">Tank gauge "Sudden Loss" &amp; "possible Sudden Loss" alarms</div>
        </div>
      </div>

      <div className="stat-cards-row mb-5" style={{ gridTemplateColumns: 'repeat(4,1fr)' }}>
        <div className="stat-card">
          <div className="stat-card-label">Events</div>
          <div className="stat-card-value" style={{ color: rows.length > 0 ? '#dc2626' : 'var(--green)' }}>
            {rows.length.toLocaleString()}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-card-label">Confirmed / Possible</div>
          <div className="stat-card-value" style={{ fontSize: 18 }}>
            {confirmedCount.toLocaleString()} / {(rows.length - confirmedCount).toLocaleString()}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-card-label">Sites Affected</div>
          <div className="stat-card-value">{sitesAffected.toLocaleString()}</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-label">Total Volume Lost (L)</div>
          <div className="stat-card-value" style={{ color: 'var(--accent)' }}>
            {totalVolumeLost.toLocaleString(undefined, { maximumFractionDigits: 0 })}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <span className="card-title">Sudden Loss — {displayRows.length.toLocaleString()} rows (page {page} of {totalPages})</span>
        </div>

        <div className="filters-bar">
          <select className="filter-select" value={filters.siteId}
            onChange={e => setFilters(f => ({ ...f, siteId: e.target.value }))}>
            <option value="">{t('all_sites')}</option>
            {sites.map(s => <option key={s.siteId} value={s.siteId}>{s.siteName}</option>)}
          </select>
          <select className="filter-select" value={filters.type}
            onChange={e => setFilters(f => ({ ...f, type: e.target.value }))}>
            <option value="">All Types</option>
            <option value="confirmed">Confirmed Only</option>
            <option value="possible">Possible Only</option>
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
            placeholder="Search text / tank…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleSearch() }}
            style={{ minWidth: 200 }}
          />
        </div>

        <div className="table-responsive">
          {loading ? (
            <div className="loading-state"><div className="spinner" />Loading Sudden Loss events...</div>
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
                  <tr><td colSpan={COLUMNS.length}><div className="empty-state">No sudden loss events found for selected filters</div></td></tr>
                ) : pageRows.map((r) => (
                  <Fragment key={r.suddenLossEventId}>
                    <tr
                      style={{ cursor: 'pointer' }}
                      onClick={() => setExpandedId(id => id === r.suddenLossEventId ? null : r.suddenLossEventId)}
                    >
                      <td style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{r.eventDateTime?.replace('T', ' ')}</td>
                      <td><span className="badge badge-blue" style={{ cursor: 'pointer' }} onClick={e => { e.stopPropagation(); navigate(`/sites/${r.siteId}`) }}>{r.siteId}</span></td>
                      <td style={{ color: 'var(--text-secondary)' }}>{r.siteName}</td>
                      <td style={{ fontWeight: 700 }}><span className="site-id-link">{r.tankId}</span></td>
                      <td><span className={`badge ${r.isPossible ? 'badge-orange' : 'badge-red'}`}>{r.isPossible ? 'Possible' : 'Confirmed'}</span></td>
                      <td style={{ color: '#dc2626', fontWeight: 700 }}>{r.volumeLostLitres ?? '—'}</td>
                      <td style={{ color: 'var(--text-secondary)' }}>{fmtDuration(r.durationSeconds)}</td>
                      <td style={{ color: 'var(--text-secondary)' }}>{r.consumptionRate ?? '—'}</td>
                      <td style={{ color: 'var(--text-secondary)' }}>{r.maxRateLPerMin ?? '—'}</td>
                      <td style={{ color: 'var(--text-secondary)', maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.eventText}</td>
                    </tr>
                    {expandedId === r.suddenLossEventId && (
                      <tr>
                        <td colSpan={COLUMNS.length} style={{ background: 'var(--surface)' }}>
                          <div style={{ fontSize: 12, color: 'var(--text-secondary)', padding: '4px 0' }}>{r.eventText}</div>
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
