import { useEffect, useState, useMemo } from 'react'
import { sitesApi } from '../api/client'
import api from '../api/client'
import ErrorBoundary from '../components/ErrorBoundary'

const flowRatesApi = {
  getAll: (params = {}) => api.get('/flowrates', { params }).then(r => r.data),
}

const defaultDate = '2026-04-10'

// Outlier thresholds (L/min)
const AVG_HIGH_THRESHOLD = 30
const AVG_LOW_THRESHOLD = 15
const PEAK_HIGH_THRESHOLD = 70
const PEAK_LOW_THRESHOLD = 15
const LOW_TRANS_THRESHOLD = 10

const QUICK_FILTERS = [
  {
    key: 'avgHigh',
    label: `High Avg Flow (>${AVG_HIGH_THRESHOLD})`,
    title: 'Avg flow rate above normal — possible high-demand pumps',
    fn: r => r.avgFlowRate != null && r.avgFlowRate > AVG_HIGH_THRESHOLD,
    bg: '#2563eb',      // blue
    bgLight: '#dbeafe',
    textLight: '#1d4ed8',
  },
  {
    key: 'avgLow',
    label: `Low Avg Flow (<${AVG_LOW_THRESHOLD})`,
    title: 'Avg flow rate below normal — possible underperforming pumps',
    fn: r => r.avgFlowRate != null && r.avgFlowRate < AVG_LOW_THRESHOLD,
    bg: '#f59e0b',      // amber
    bgLight: '#fef3c7',
    textLight: '#b45309',
  },
  {
    key: 'peakHigh',
    label: `High Peak Flow (>${PEAK_HIGH_THRESHOLD})`,
    title: 'Peak flow well above average — possible burst demand or anomalous reading',
    fn: r => r.peakFlowRate != null && r.peakFlowRate > PEAK_HIGH_THRESHOLD,
    bg: '#16a34a',      // green
    bgLight: '#dcfce7',
    textLight: '#15803d',
  },
  {
    key: 'peakLow',
    label: `Low Peak Flow (<${PEAK_LOW_THRESHOLD})`,
    title: 'Peak flow very low — possible flow restriction or meter issue',
    fn: r => r.peakFlowRate != null && r.peakFlowRate < PEAK_LOW_THRESHOLD,
    bg: '#dc2626',      // red
    bgLight: '#fee2e2',
    textLight: '#b91c1c',
  },
  {
    key: 'lowTrans',
    label: `Low Transactions (<${LOW_TRANS_THRESHOLD})`,
    title: 'Very few pump transactions — possible inactive or faulty pump',
    fn: r => r.totalPumpTrans < LOW_TRANS_THRESHOLD,
    bg: '#7c3aed',      // purple
    bgLight: '#ede9fe',
    textLight: '#6d28d9',
  },
  {
    key: 'noData',
    label: 'Missing Flow Data',
    title: 'Rows where avg or peak flow rate is missing',
    fn: r => r.avgFlowRate == null || r.peakFlowRate == null,
    bg: '#475569',      // slate
    bgLight: '#f1f5f9',
    textLight: '#334155',
  },
]

export default function FlowRates() {
  const [rows, setRows] = useState([])
  const [sites, setSites] = useState([])
  const [loading, setLoading] = useState(false)
  const [filters, setFilters] = useState({ siteId: '', dateFrom: defaultDate, dateTo: defaultDate })
  const [activeQuickFilter, setActiveQuickFilter] = useState(null)
  const [page, setPage] = useState(1)
  const PAGE_SIZE = 100

  useEffect(() => {
    sitesApi.getAll().then(s => setSites(s || [])).catch(console.error)
    loadData({ siteId: '', dateFrom: defaultDate, dateTo: defaultDate })
  }, [])

  function loadData(f) {
    setLoading(true)
    setActiveQuickFilter(null)
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

  function toggleQuickFilter(key) {
    setActiveQuickFilter(prev => prev === key ? null : key)
    setPage(1)
  }

  const displayRows = useMemo(() => {
    if (!activeQuickFilter) return rows
    const qf = QUICK_FILTERS.find(f => f.key === activeQuickFilter)
    return qf ? rows.filter(qf.fn) : rows
  }, [rows, activeQuickFilter])

  const withData = rows.filter(r => r.peakFlowRate != null)
  const avgPeak = withData.length ? (withData.reduce((s, r) => s + r.peakFlowRate, 0) / withData.length).toFixed(2) : '—'
  const maxPeak = withData.length ? Math.max(...withData.map(r => r.peakFlowRate)).toFixed(2) : '—'
  const outlierCount = rows.filter(r =>
    (r.avgFlowRate != null && (r.avgFlowRate > AVG_HIGH_THRESHOLD || r.avgFlowRate < AVG_LOW_THRESHOLD)) ||
    (r.peakFlowRate != null && (r.peakFlowRate > PEAK_HIGH_THRESHOLD || r.peakFlowRate < PEAK_LOW_THRESHOLD))
  ).length

  const totalPages = Math.max(1, Math.ceil(displayRows.length / PAGE_SIZE))
  const pageRows = displayRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  return (
    <ErrorBoundary fallback="Flow Rates page error.">
      <div className="page-header mb-4">
        <div>
          <div className="page-title">Flow Rates</div>
          <div className="page-subtitle">Pump flow metrics — nominal, average and peak rates</div>
        </div>
      </div>

      <div className="stat-cards-row mb-5" style={{ gridTemplateColumns: 'repeat(4,1fr)' }}>
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
        <div className="stat-card">
          <div className="stat-card-label">Flow Outliers</div>
          <div className="stat-card-value" style={{ color: outlierCount > 0 ? 'var(--orange)' : 'var(--text-secondary)' }}>
            {outlierCount.toLocaleString()}
          </div>
        </div>
      </div>

      {/* Outlier quick-filter buttons */}
      <div className="card mb-4" style={{ padding: '12px 16px' }}>
        <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-secondary)', marginBottom: 10 }}>
          Quick Filters — Outliers
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {QUICK_FILTERS.map(qf => {
            const count = rows.filter(qf.fn).length
            const isActive = activeQuickFilter === qf.key
            return (
              <button
                key={qf.key}
                title={qf.title}
                onClick={() => toggleQuickFilter(qf.key)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '6px 13px',
                  borderRadius: 6,
                  border: isActive ? `2px solid ${qf.bg}` : `1.5px solid ${qf.bg}`,
                  background: isActive ? qf.bg : qf.bgLight,
                  color: isActive ? '#fff' : qf.textLight,
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                  boxShadow: isActive ? `0 2px 8px ${qf.bg}55` : 'none',
                }}
              >
                <span>{qf.label}</span>
                <span style={{
                  background: isActive ? 'rgba(255,255,255,0.25)' : qf.bg,
                  color: '#fff',
                  borderRadius: 10,
                  padding: '1px 7px',
                  fontSize: 11,
                  fontWeight: 700,
                  minWidth: 24,
                  textAlign: 'center',
                }}>
                  {count}
                </span>
              </button>
            )
          })}
          {activeQuickFilter && (
            <button
              onClick={() => { setActiveQuickFilter(null); setPage(1) }}
              style={{
                padding: '5px 12px',
                borderRadius: 6,
                border: '1px solid var(--border)',
                background: 'transparent',
                color: 'var(--text-secondary)',
                fontSize: 12,
                cursor: 'pointer',
              }}
            >
              ✕ Clear filter
            </button>
          )}
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <span className="card-title">
            Flow Rates —{' '}
            {activeQuickFilter
              ? `${displayRows.length.toLocaleString()} matching rows (filtered from ${rows.length.toLocaleString()})`
              : `${rows.length.toLocaleString()} rows`
            }
            {' '}· page {page} of {totalPages}
          </span>
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
                {displayRows.length === 0 ? (
                  <tr><td colSpan={14}><div className="empty-state">No data for selected filters</div></td></tr>
                ) : pageRows.map((r, i) => {
                  const avgOutlier = r.avgFlowRate != null && (r.avgFlowRate > AVG_HIGH_THRESHOLD || r.avgFlowRate < AVG_LOW_THRESHOLD)
                  const peakOutlier = r.peakFlowRate != null && (r.peakFlowRate > PEAK_HIGH_THRESHOLD || r.peakFlowRate < PEAK_LOW_THRESHOLD)
                  return (
                    <tr key={i}>
                      <td style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{r.businessDate}</td>
                      <td><span className="badge badge-blue">{r.siteId}</span></td>
                      <td style={{ color: 'var(--text-secondary)' }}>{r.siteName}</td>
                      <td style={{ fontWeight: 700 }}><span className="site-id-link">{r.deviceId}</span></td>
                      <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{r.gradeOption}</td>
                      <td style={{ color: 'var(--text-secondary)' }}>{r.gradeDescription || r.gradeId || '—'}</td>
                      <td style={{ fontWeight: 600, color: r.totalPumpTrans < LOW_TRANS_THRESHOLD ? 'var(--orange)' : undefined }}>
                        {r.totalPumpTrans.toLocaleString()}
                      </td>
                      <td style={{ color: 'var(--text-muted)' }}>{r.nominalFlowRate != null ? Number(r.nominalFlowRate).toFixed(2) : '—'}</td>
                      <td style={{ color: avgOutlier ? 'var(--orange)' : 'var(--accent)', fontWeight: avgOutlier ? 700 : undefined }}>
                        {r.avgFlowRate != null ? Number(r.avgFlowRate).toFixed(2) : '—'}
                      </td>
                      <td style={{ color: peakOutlier ? 'var(--orange)' : 'var(--green)', fontWeight: peakOutlier ? 700 : 600 }}>
                        {r.peakFlowRate != null ? Number(r.peakFlowRate).toFixed(2) : '—'}
                      </td>
                      <td style={{ color: 'var(--text-secondary)' }}>{r.avgTimeToFlow ?? '—'}</td>
                      <td style={{ color: 'var(--text-secondary)' }}>{r.maxTimeToFlow ?? '—'}</td>
                      <td style={{ color: 'var(--text-secondary)' }}>{r.avgTimeToPeakFlow ?? '—'}</td>
                      <td style={{ color: 'var(--text-secondary)' }}>{r.maxTimeToPeakFlow ?? '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>

        <div className="pagination">
          <span className="pagination-info">
            {displayRows.length.toLocaleString()} rows · showing {Math.min((page - 1) * PAGE_SIZE + 1, displayRows.length)}–{Math.min(page * PAGE_SIZE, displayRows.length)}
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
