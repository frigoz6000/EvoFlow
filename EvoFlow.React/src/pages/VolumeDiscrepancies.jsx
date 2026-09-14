import { useEffect, useState, useMemo } from 'react'
import { useLanguage } from '../i18n/LanguageContext'
import { useNavigate } from 'react-router-dom'
import { sitesApi } from '../api/client'
import api from '../api/client'
import ErrorBoundary from '../components/ErrorBoundary'

const volumeDiscrepanciesApi = {
  getAll: (params = {}) => api.get('/volumediscrepancies', { params }).then(r => r.data),
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

function fmtNum(v, digits = 1) {
  if (v === null || v === undefined) return '—'
  return Number(v).toLocaleString(undefined, { maximumFractionDigits: digits })
}

function fmtMoney(v) {
  if (v === null || v === undefined) return '—'
  return `£${Number(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

const COLUMNS = [
  ['activityDate', 'Activity Date', r => r.activityDate],
  ['siteId', 'Site ID', r => r.siteId],
  ['siteName', 'Site Name', r => r.siteName],
  ['fuellingPointId', 'Device', r => r.fuellingPointId],
  ['gradeDescription', 'Grade', r => r.gradeDescription || r.gradeId],
  ['tankIds', 'Tank(s)', r => r.tankIds],
  ['physicalPumpVolume', 'Pump Vol (L)', r => r.physicalPumpVolume],
  ['recordedFpVolume', 'FP Vol (L)', r => r.recordedFpVolume],
  ['missingVolume', 'Missing Vol (L)', r => r.missingVolume],
  ['physicalPumpMoney', 'Pump Money (£)', r => r.physicalPumpMoney],
  ['recordedFpMoney', 'FP Money (£)', r => r.recordedFpMoney],
  ['missingMoney', 'Missing Money (£)', r => r.missingMoney],
  ['suddenLossCount', 'Sudden Loss', r => r.suddenLossCount],
]

export default function VolumeDiscrepancies() {
  const navigate = useNavigate()
  const { t } = useLanguage()
  const [rows, setRows] = useState([])
  const [sites, setSites] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [filters, setFilters] = useState({ siteId: '', dateFrom: defaultDateFrom, dateTo: defaultDateTo, threshold: 0.01 })
  const [siteSearch, setSiteSearch] = useState('')
  const [sortCol, setSortCol] = useState('missingVolume')
  const [sortDir, setSortDir] = useState('desc')
  const [page, setPage] = useState(1)
  const PAGE_SIZE = 100

  useEffect(() => {
    sitesApi.getAll().then(s => setSites(s || [])).catch(console.error)
    loadData(filters)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function loadData(f) {
    setLoading(true)
    setError(null)
    const params = {}
    if (f.siteId) params.siteId = f.siteId
    if (f.dateFrom) params.dateFrom = f.dateFrom
    if (f.dateTo) params.dateTo = f.dateTo
    if (f.threshold !== '' && f.threshold !== null && f.threshold !== undefined) params.threshold = f.threshold
    volumeDiscrepanciesApi.getAll(params)
      .then(r => {
        if (!Array.isArray(r)) {
          console.error('Expected an array from /volumediscrepancies, got:', r)
          setRows([])
          setError('Unexpected response from the server — the API may need restarting, or the GetVolumeDiscrepancies stored procedure may be missing.')
          return
        }
        setRows(r)
        setPage(1)
      })
      .catch(e => { console.error(e); setError('Failed to load — has the GetVolumeDiscrepancies stored procedure been created?') })
      .finally(() => setLoading(false))
  }

  function handleSearch() { loadData(filters) }
  function handleClear() {
    const reset = { siteId: '', dateFrom: defaultDateFrom, dateTo: defaultDateTo, threshold: 0.01 }
    setFilters(reset)
    setSiteSearch('')
    loadData(reset)
  }

  function handleSort(col) {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortCol(col); setSortDir('asc') }
    setPage(1)
  }

  const sitesAffected = useMemo(() => new Set(rows.map(r => r.siteId)).size, [rows])
  const totalMissingVolume = useMemo(() => rows.reduce((s, r) => s + Math.abs(r.missingVolume || 0), 0), [rows])
  const totalMissingMoney = useMemo(() => rows.reduce((s, r) => s + Math.abs(r.missingMoney || 0), 0), [rows])
  const suddenLossOverlapCount = useMemo(() => rows.filter(r => r.suddenLossCount > 0).length, [rows])

  const displayRows = useMemo(() => {
    let result = rows
    if (siteSearch.trim()) {
      const q = siteSearch.trim().toLowerCase()
      result = result.filter(r =>
        (r.siteId || '').toLowerCase().includes(q) ||
        (r.siteName || '').toLowerCase().includes(q) ||
        (r.fuellingPointId || '').toLowerCase().includes(q) ||
        (r.gradeDescription || '').toLowerCase().includes(q)
      )
    }
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
  }, [rows, siteSearch, sortCol, sortDir])

  const totalPages = Math.max(1, Math.ceil(displayRows.length / PAGE_SIZE))
  const pageRows = displayRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  function diffCell(diff, isMoney) {
    if (diff === null || diff === undefined) return <td style={{ color: 'var(--text-muted)' }}>—</td>
    return (
      <td style={{ color: '#dc2626', fontWeight: 700 }}>
        {isMoney ? fmtMoney(diff) : fmtNum(diff)}
      </td>
    )
  }

  return (
    <ErrorBoundary fallback="Volume Discrepancies page error.">
      <div className="page-header mb-4">
        <div>
          <div className="page-title">Volume Discrepancies</div>
          <div className="page-subtitle">Pump vs FP volume, matched by site &amp; device &amp; grade — flagged lines only</div>
        </div>
      </div>

      <div className="stat-cards-row mb-5" style={{ gridTemplateColumns: 'repeat(5,1fr)' }}>
        <div className="stat-card">
          <div className="stat-card-label">Flagged Lines</div>
          <div className="stat-card-value" style={{ color: rows.length > 0 ? '#dc2626' : 'var(--green)' }}>
            {rows.length.toLocaleString()}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-card-label">Sites Affected</div>
          <div className="stat-card-value">{sitesAffected.toLocaleString()}</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-label">Total |Missing Volume| (L)</div>
          <div className="stat-card-value" style={{ color: 'var(--accent)' }}>
            {totalMissingVolume.toLocaleString(undefined, { maximumFractionDigits: 0 })}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-card-label">Total |Missing Money| (£)</div>
          <div className="stat-card-value" style={{ color: 'var(--green)' }}>
            £{totalMissingMoney.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-card-label">With Sudden Loss Same Day</div>
          <div className="stat-card-value" style={{ color: suddenLossOverlapCount > 0 ? '#dc2626' : 'var(--green)' }}>
            {suddenLossOverlapCount.toLocaleString()}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <span className="card-title">Volume Discrepancies — {displayRows.length.toLocaleString()} rows (page {page} of {totalPages})</span>
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
          <label style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Tolerance (L)</label>
          <input type="number" step="0.01" min="0" className="filter-search" style={{ minWidth: 90 }}
            value={filters.threshold} onChange={e => setFilters(f => ({ ...f, threshold: e.target.value === '' ? '' : Number(e.target.value) }))} />
          <button className="btn btn-primary btn-sm" onClick={handleSearch}>Search</button>
          <button className="btn btn-outline btn-sm" onClick={handleClear}>Clear</button>
          <input
            type="text"
            className="filter-search"
            placeholder="Filter site / device / grade…"
            value={siteSearch}
            onChange={e => { setSiteSearch(e.target.value); setPage(1) }}
            style={{ minWidth: 180 }}
          />
        </div>

        <div className="table-responsive">
          {loading ? (
            <div className="loading-state"><div className="spinner" />Loading Volume Discrepancies...</div>
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
                  <tr><td colSpan={COLUMNS.length}><div className="empty-state">No discrepancies found for selected filters</div></td></tr>
                ) : pageRows.map((r, i) => (
                  <tr key={i}>
                    <td style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{r.activityDate}</td>
                    <td><span className="badge badge-blue" style={{ cursor: 'pointer' }} onClick={() => navigate(`/sites/${r.siteId}`)}>{r.siteId}</span></td>
                    <td style={{ color: 'var(--text-secondary)' }}>{r.siteName}</td>
                    <td style={{ fontWeight: 700 }}><span className="site-id-link">{r.fuellingPointId}</span></td>
                    <td style={{ color: 'var(--text-secondary)' }}>{r.gradeDescription || r.gradeId}</td>
                    <td style={{ color: 'var(--text-secondary)' }}>{r.tankIds || '—'}</td>
                    <td style={{ color: 'var(--text-secondary)' }}>{fmtNum(r.physicalPumpVolume)}</td>
                    <td style={{ color: 'var(--text-secondary)' }}>{fmtNum(r.recordedFpVolume)}</td>
                    {diffCell(r.missingVolume, false)}
                    <td style={{ color: 'var(--text-secondary)' }}>{fmtMoney(r.physicalPumpMoney)}</td>
                    <td style={{ color: 'var(--text-secondary)' }}>{fmtMoney(r.recordedFpMoney)}</td>
                    {diffCell(r.missingMoney, true)}
                    <td>
                      {r.suddenLossCount > 0 ? (
                        <span
                          className="badge badge-red"
                          style={{ cursor: 'pointer' }}
                          title="View matching Sudden Loss events for this site & date"
                          onClick={() => navigate(`/sudden-loss?siteId=${r.siteId}&dateFrom=${r.activityDate}&dateTo=${r.activityDate}`)}
                        >
                          {r.suddenLossCount} event{r.suddenLossCount > 1 ? 's' : ''}
                          {r.suddenLossVolumeL != null ? ` · ${fmtNum(r.suddenLossVolumeL)}L` : ''}
                        </span>
                      ) : (
                        <span style={{ color: 'var(--text-muted)' }}>—</span>
                      )}
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
