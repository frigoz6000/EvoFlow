import { useEffect, useState, useMemo } from 'react'
import { sitesApi } from '../api/client'
import api from '../api/client'
import ErrorBoundary from '../components/ErrorBoundary'
import * as XLSX from 'xlsx'

const domsInfoApi = {
  getAll: (params = {}) => api.get('/domsinfosnapshot', { params }).then(r => r.data),
  populate: () => api.post('/domsinfosnapshot/populate').then(r => r.data),
}

const FAULT_KEYWORDS = ['fault', 'error', 'fail', 'alarm', 'critical', 'warning']

function isFault(errorText) {
  if (!errorText) return false
  const lower = errorText.toLowerCase()
  return FAULT_KEYWORDS.some(k => lower.includes(k))
}

const COLUMNS = [
  { key: 'domsDate',              label: 'DOMS Date' },
  { key: 'siteId',                label: 'Site ID' },
  { key: 'name',                  label: 'Name' },
  { key: 'device',                label: 'Device' },
  { key: 'deviceStatus',          label: 'Device Status' },
  { key: 'deviceOfflineCount',    label: 'Offline Count' },
  { key: 'deviceErrorType',       label: 'Error Type' },
  { key: 'deviceErrorText',       label: 'Error Text' },
  { key: 'deviceErrorDate',       label: 'Error Date' },
  { key: 'deviceLifetimeVolume',  label: 'Lifetime Vol (L)' },
  { key: 'gradeId',               label: 'Grade ID' },
  { key: 'gradeOption',           label: 'Grade Option' },
  { key: 'gradeDescription',      label: 'Grade Description' },
  { key: 'transactions',          label: 'Transactions' },
  { key: 'peakFlow',              label: 'Peak Flow' },
  { key: 'uptime',                label: 'Uptime (min)' },
  { key: 'numberZeroTransactions',label: 'Zero Trans' },
  { key: 'tankId',                label: 'Tank ID' },
]

function SortIcon({ dir }) {
  if (!dir) return <span style={{ opacity: 0.25, fontSize: 10, marginLeft: 3 }}>⇅</span>
  return <span style={{ fontSize: 10, marginLeft: 3 }}>{dir === 'asc' ? '↑' : '↓'}</span>
}

export default function DomsInfo() {
  const [rows, setRows] = useState([])
  const [sites, setSites] = useState([])
  const [loading, setLoading] = useState(false)
  const [pushing, setPushing] = useState(false)
  const [pushMsg, setPushMsg] = useState('')
  const [populating, setPopulating] = useState(false)
  const [populateMsg, setPopulateMsg] = useState('')
  const [quickFilter, setQuickFilter] = useState('')
  const [siteSearch, setSiteSearch] = useState('')
  const [sortCol, setSortCol] = useState(null)
  const [sortDir, setSortDir] = useState('asc')

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

  const defaultDate = '2026-04-10'
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
      .then(r => { setRows(r || []); setQuickFilter(''); setSiteSearch(''); setSortCol(null) })
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

  function toggleQuickFilter(f) {
    setQuickFilter(q => q === f ? '' : f)
    setPage(1)
  }

  function handleSort(key) {
    if (sortCol === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortCol(key)
      setSortDir('asc')
    }
    setPage(1)
  }

  // Apply filters then sort
  const displayRows = useMemo(() => {
    let result = rows

    // Quick filter
    if (quickFilter === 'offline') result = result.filter(r => r.deviceStatus !== 'Online')
    else if (quickFilter === 'fault') result = result.filter(r => isFault(r.deviceErrorText))

    // Site text search
    if (siteSearch.trim()) {
      const q = siteSearch.trim().toLowerCase()
      result = result.filter(r =>
        (r.siteId || '').toLowerCase().includes(q) ||
        (r.name || '').toLowerCase().includes(q)
      )
    }

    // Column sort
    if (sortCol) {
      result = [...result].sort((a, b) => {
        const av = a[sortCol] ?? ''
        const bv = b[sortCol] ?? ''
        const cmp = typeof av === 'number' && typeof bv === 'number'
          ? av - bv
          : String(av).localeCompare(String(bv), undefined, { numeric: true })
        return sortDir === 'asc' ? cmp : -cmp
      })
    }

    return result
  }, [rows, quickFilter, siteSearch, sortCol, sortDir])

  function handleExportExcel() {
    const exportRows = displayRows.map(r => ({
      'DOMS Date': r.domsDate,
      'Site ID': r.siteId,
      'Name': r.name,
      'Device': r.device,
      'Device Status': r.deviceStatus,
      'Offline Count': r.deviceOfflineCount,
      'Error Type': r.deviceErrorType || '',
      'Error Text': r.deviceErrorText || '',
      'Error Date': r.deviceErrorDate ? new Date(r.deviceErrorDate).toLocaleDateString() : '',
      'Lifetime Vol (L)': r.deviceLifetimeVolume,
      'Grade ID': r.gradeId || '',
      'Grade Option': r.gradeOption,
      'Grade Description': r.gradeDescription || '',
      'Transactions': r.transactions || 0,
      'Peak Flow': r.peakFlow != null ? Number(r.peakFlow) : '',
      'Uptime (min)': r.uptime,
      'Zero Transactions': r.numberZeroTransactions,
      'Tank ID': r.tankId || '',
    }))
    const ws = XLSX.utils.json_to_sheet(exportRows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Doms Info')
    const suffix = quickFilter ? `_${quickFilter}` : ''
    XLSX.writeFile(wb, `DomsInfo_${filters.dateFrom || 'all'}_to_${filters.dateTo || 'all'}${suffix}.xlsx`)
  }

  const [page, setPage] = useState(1)
  const PAGE_SIZE = 100

  const totalTransactions = rows.reduce((s, r) => s + (r.transactions || 0), 0)
  const onlineDevices = new Set(rows.filter(r => r.deviceStatus === 'Online').map(r => r.device)).size
  const totalDevices = new Set(rows.map(r => r.device)).size
  const offlineCount = rows.filter(r => r.deviceStatus !== 'Online').length
  const faultCount = rows.filter(r => isFault(r.deviceErrorText)).length

  const totalPages = Math.max(1, Math.ceil(displayRows.length / PAGE_SIZE))
  const pageRows = displayRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

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
                background: 'none', border: '1px solid var(--border)', borderRadius: 6,
                padding: '6px 10px', cursor: populating ? 'not-allowed' : 'pointer',
                color: 'var(--text-secondary)', display: 'flex', alignItems: 'center',
                gap: 6, fontSize: 13, opacity: populating ? 0.6 : 1,
              }}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-3.51"/>
              </svg>
              {populating ? 'Refreshing…' : 'Refresh Snapshot'}
            </button>
            <button
              onClick={handleGitPush}
              disabled={pushing}
              title="Push to GitHub"
              style={{
                background: 'none', border: '1px solid var(--border)', borderRadius: 6,
                padding: '6px 10px', cursor: pushing ? 'not-allowed' : 'pointer',
                color: 'var(--text-secondary)', display: 'flex', alignItems: 'center',
                gap: 6, fontSize: 13, opacity: pushing ? 0.6 : 1,
              }}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
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
          <span className="card-title">Doms Info — {displayRows.length.toLocaleString()} rows (page {page} of {totalPages})</span>
        </div>

        {/* Filters bar: date/site search + quick filters + export */}
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

          <div style={{ width: 1, height: 20, background: 'var(--border)', margin: '0 4px' }} />

          {/* Site ID / Name text search */}
          <input
            type="text"
            className="filter-search"
            placeholder="Filter site ID / name…"
            style={{ minWidth: 170 }}
            value={siteSearch}
            onChange={e => { setSiteSearch(e.target.value); setPage(1) }}
          />

          <div style={{ width: 1, height: 20, background: 'var(--border)', margin: '0 4px' }} />

          <button
            onClick={() => toggleQuickFilter('offline')}
            style={{
              border: '1px solid #dc2626',
              borderRadius: 6, padding: '5px 12px', cursor: 'pointer',
              background: quickFilter === 'offline' ? '#dc2626' : 'rgba(220,38,38,0.08)',
              color: quickFilter === 'offline' ? '#fff' : '#dc2626',
              fontSize: 12, fontWeight: 600,
              display: 'flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap',
              transition: 'background 0.15s, color 0.15s',
            }}
          >
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: quickFilter === 'offline' ? '#fff' : '#dc2626', display: 'inline-block' }} />
            Offline ({offlineCount})
          </button>
          <button
            onClick={() => toggleQuickFilter('fault')}
            style={{
              border: '1px solid #ea580c',
              borderRadius: 6, padding: '5px 12px', cursor: 'pointer',
              background: quickFilter === 'fault' ? '#ea580c' : 'rgba(234,88,12,0.08)',
              color: quickFilter === 'fault' ? '#fff' : '#ea580c',
              fontSize: 12, fontWeight: 600,
              display: 'flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap',
              transition: 'background 0.15s, color 0.15s',
            }}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
              <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
            Has Fault ({faultCount})
          </button>
          {(quickFilter || siteSearch) && (
            <button
              onClick={() => { setQuickFilter(''); setSiteSearch(''); setPage(1) }}
              style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 12, padding: '4px 6px' }}
            >
              ✕
            </button>
          )}

          <div style={{ flex: 1 }} />

          <button
            onClick={handleExportExcel}
            disabled={displayRows.length === 0}
            title="Export to Excel"
            style={{
              background: displayRows.length === 0 ? 'none' : '#16a34a',
              border: '1px solid ' + (displayRows.length === 0 ? 'var(--border)' : '#16a34a'),
              borderRadius: 6, padding: '5px 12px',
              cursor: displayRows.length === 0 ? 'not-allowed' : 'pointer',
              color: displayRows.length === 0 ? 'var(--text-muted)' : '#fff',
              display: 'flex', alignItems: 'center', gap: 6,
              fontSize: 12, fontWeight: 600,
              opacity: displayRows.length === 0 ? 0.4 : 1, whiteSpace: 'nowrap',
            }}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
              <line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
              <polyline points="10 9 9 9 8 9"/>
            </svg>
            Export Excel
          </button>
        </div>

        <div className="table-responsive">
          {loading ? (
            <div className="loading-state"><div className="spinner" />Loading Doms Info...</div>
          ) : (
            <table className="evo-table">
              <thead>
                <tr>
                  {COLUMNS.map(col => (
                    <th
                      key={col.key}
                      onClick={() => handleSort(col.key)}
                      style={{ cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }}
                    >
                      {col.label}
                      <SortIcon dir={sortCol === col.key ? sortDir : null} />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {displayRows.length === 0 ? (
                  <tr><td colSpan={COLUMNS.length}><div className="empty-state">No data for selected filters</div></td></tr>
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
                        ? <span className={`badge ${isFault(r.deviceErrorText) ? 'badge-orange' : 'badge-gray'}`}>{r.deviceErrorText}</span>
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
            {displayRows.length.toLocaleString()} total rows · showing {((page - 1) * PAGE_SIZE) + 1}–{Math.min(page * PAGE_SIZE, displayRows.length)}
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
