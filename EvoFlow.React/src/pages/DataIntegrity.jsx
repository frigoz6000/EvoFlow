import { useEffect, useState, useMemo } from 'react'
import api from '../api/client'
import ErrorBoundary from '../components/ErrorBoundary'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell
} from 'recharts'

const dataIntegrityApi = {
  getSummary: (params = {}) => api.get('/dataintegrity/summary', { params }).then(r => r.data),
  getMissing: (params = {}) => api.get('/dataintegrity/missing', { params }).then(r => r.data),
}

const PAGE_SIZE = 50

function getLast7Days() {
  const to = new Date()
  const from = new Date()
  from.setDate(to.getDate() - 6)
  const fmt = d => d.toISOString().slice(0, 10)
  return { dateFrom: fmt(from), dateTo: fmt(to) }
}

export default function DataIntegrity() {
  const [filters, setFilters]       = useState(getLast7Days)
  const [summary, setSummary]       = useState([])
  const [missing, setMissing]       = useState([])
  const [loading, setLoading]       = useState(false)
  const [siteFilter, setSiteFilter] = useState('')
  const [dateFilter, setDateFilter] = useState(null)  // null = all dates
  const [page, setPage]             = useState(1)

  useEffect(() => { loadData(filters) }, [])

  function loadData(f) {
    setLoading(true)
    const params = {}
    if (f.dateFrom) params.dateFrom = f.dateFrom
    if (f.dateTo)   params.dateTo   = f.dateTo
    Promise.all([
      dataIntegrityApi.getSummary(params),
      dataIntegrityApi.getMissing(params),
    ])
      .then(([s, m]) => {
        setSummary(s || [])
        setMissing(m || [])
        setSiteFilter('')
        setDateFilter(null)
        setPage(1)
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }

  function handleSearch() { setPage(1); setDateFilter(null); loadData(filters) }
  function handleClear() {
    const reset = getLast7Days()
    setFilters(reset)
    setDateFilter(null)
    loadData(reset)
  }

  // Derive the unique dates from summary, sorted ascending
  const dates = useMemo(() => summary.map(r => r.checkDate).sort(), [summary])

  // Build per-site missing map: { siteId -> Set<date> }
  const missingBySite = useMemo(() => {
    const map = {}
    for (const r of missing) {
      if (!map[r.siteId]) map[r.siteId] = { siteName: r.siteName, missingDates: new Set() }
      map[r.siteId].missingDates.add(r.missingDate)
    }
    return map
  }, [missing])

  // Unique sites that have at least one missing date
  const missingSites = useMemo(() => {
    const sites = Object.entries(missingBySite).map(([siteId, v]) => ({
      siteId,
      siteName: v.siteName,
      missingDates: v.missingDates,
      missingCount: v.missingDates.size,
    }))
    sites.sort((a, b) => b.missingCount - a.missingCount || a.siteId.localeCompare(b.siteId))
    return sites
  }, [missingBySite])

  // Missing count per date (for filter button badges)
  const missingCountByDate = useMemo(() => {
    const counts = {}
    for (const r of missing) {
      counts[r.missingDate] = (counts[r.missingDate] || 0) + 1
    }
    return counts
  }, [missing])

  // Apply site text filter + date filter
  const filteredSites = useMemo(() => {
    let result = missingSites
    if (dateFilter) {
      result = result.filter(s => s.missingDates.has(dateFilter))
    }
    if (siteFilter.trim()) {
      const q = siteFilter.trim().toLowerCase()
      result = result.filter(s =>
        s.siteId.toLowerCase().includes(q) || s.siteName.toLowerCase().includes(q)
      )
    }
    return result
  }, [missingSites, siteFilter, dateFilter])

  const totalPages = Math.max(1, Math.ceil(filteredSites.length / PAGE_SIZE))
  const pageRows   = filteredSites.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  // Summary stats
  const totalMissing   = summary.reduce((s, r) => s + r.missingSites, 0)
  const totalExpected  = summary.reduce((s, r) => s + r.totalSites, 0)
  const totalPresent   = summary.reduce((s, r) => s + r.sitesWithData, 0)
  const coveragePct    = totalExpected > 0 ? ((totalPresent / totalExpected) * 100).toFixed(1) : '—'

  // Chart data
  const chartData = summary.map(r => ({
    date: r.checkDate,
    Present: r.sitesWithData,
    Missing: r.missingSites,
  }))

  return (
    <ErrorBoundary fallback="Data Integrity page error.">
      <div className="page-header mb-4">
        <div>
          <div className="page-title">Data Integrity</div>
          <div className="page-subtitle">Check for missing site data across date range</div>
        </div>
      </div>

      {/* Filter bar */}
      <div className="card mb-4">
        <div className="card-header">
          <span className="card-title">Date Range</span>
        </div>
        <div className="filters-bar" style={{ borderTop: 'none', paddingTop: 12 }}>
          <label style={{ fontSize: 12, color: 'var(--text-secondary)' }}>From</label>
          <input
            type="date" className="filter-search" style={{ minWidth: 130 }}
            value={filters.dateFrom}
            onChange={e => setFilters(f => ({ ...f, dateFrom: e.target.value }))}
          />
          <label style={{ fontSize: 12, color: 'var(--text-secondary)' }}>To</label>
          <input
            type="date" className="filter-search" style={{ minWidth: 130 }}
            value={filters.dateTo}
            onChange={e => setFilters(f => ({ ...f, dateTo: e.target.value }))}
          />
          <button className="btn btn-primary btn-sm" onClick={handleSearch}>Check</button>
          <button className="btn btn-outline btn-sm" onClick={handleClear}>Reset</button>
        </div>
      </div>

      {loading ? (
        <div className="loading-state"><div className="spinner" />Checking data integrity…</div>
      ) : (
        <>
          {/* Stat cards */}
          <div className="stat-cards-row mb-5" style={{ gridTemplateColumns: 'repeat(4,1fr)' }}>
            <div className="stat-card">
              <div className="stat-card-label">Dates Checked</div>
              <div className="stat-card-value">{dates.length}</div>
            </div>
            <div className="stat-card">
              <div className="stat-card-label">Expected Records</div>
              <div className="stat-card-value">{totalExpected.toLocaleString()}</div>
            </div>
            <div className="stat-card">
              <div className="stat-card-label">Coverage</div>
              <div className="stat-card-value" style={{ color: totalMissing === 0 ? 'var(--green)' : 'var(--red)' }}>
                {coveragePct}%
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-card-label">Missing Records</div>
              <div className="stat-card-value" style={{ color: totalMissing > 0 ? 'var(--red)' : 'var(--green)' }}>
                {totalMissing.toLocaleString()}
              </div>
            </div>
          </div>

          {/* Chart */}
          {chartData.length > 0 && (
            <div className="card mb-5">
              <div className="card-header">
                <span className="card-title">Site Coverage per Date</span>
              </div>
              <div style={{ padding: '16px 16px 8px' }}>
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={chartData} margin={{ top: 4, right: 24, left: 0, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="date" tick={{ fontSize: 12, fill: 'var(--text-secondary)' }} />
                    <YAxis tick={{ fontSize: 12, fill: 'var(--text-secondary)' }} />
                    <Tooltip
                      contentStyle={{
                        background: 'var(--bg-card)',
                        border: '1px solid var(--border)',
                        borderRadius: 8,
                        fontSize: 13,
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar dataKey="Present" stackId="a" fill="#22c55e" radius={[0, 0, 0, 0]} />
                    <Bar dataKey="Missing" stackId="a" fill="#ef4444" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Date filter buttons */}
          {dates.length > 0 && missingSites.length > 0 && (
            <div className="card mb-4">
              <div className="card-header">
                <span className="card-title">Filter by Date</span>
                <span style={{ fontSize: 12, color: 'var(--text-secondary)', marginLeft: 8 }}>
                  Click a date to show only sites missing on that day
                </span>
              </div>
              <div style={{ padding: '12px 16px', display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                <button
                  onClick={() => { setDateFilter(null); setPage(1) }}
                  style={{
                    padding: '5px 14px',
                    borderRadius: 6,
                    border: '1px solid var(--border)',
                    background: dateFilter === null ? 'var(--accent)' : 'var(--bg-card)',
                    color: dateFilter === null ? '#fff' : 'var(--text-primary)',
                    cursor: 'pointer',
                    fontSize: 13,
                    fontWeight: 500,
                  }}
                >
                  All dates
                </button>
                {dates.map(d => {
                  const count = missingCountByDate[d] || 0
                  const isActive = dateFilter === d
                  return (
                    <button
                      key={d}
                      onClick={() => { setDateFilter(isActive ? null : d); setPage(1) }}
                      style={{
                        padding: '5px 14px',
                        borderRadius: 6,
                        border: `1px solid ${count > 0 ? '#ef4444' : 'var(--border)'}`,
                        background: isActive ? '#ef4444' : 'var(--bg-card)',
                        color: isActive ? '#fff' : count > 0 ? '#ef4444' : 'var(--text-muted)',
                        cursor: 'pointer',
                        fontSize: 13,
                        fontWeight: 500,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                      }}
                    >
                      {d}
                      {count > 0 && (
                        <span style={{
                          background: isActive ? 'rgba(255,255,255,0.3)' : '#fef2f2',
                          color: isActive ? '#fff' : '#ef4444',
                          borderRadius: 10,
                          padding: '1px 6px',
                          fontSize: 11,
                          fontWeight: 700,
                        }}>
                          {count}
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* Missing sites grid */}
          <div className="card">
            <div className="card-header" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span className="card-title">
                Missing Data{dateFilter ? ` — ${dateFilter}` : ''} — {filteredSites.length} site{filteredSites.length !== 1 ? 's' : ''} affected
              </span>
              {missingSites.length === 0 && (
                <span style={{ fontSize: 12, color: 'var(--green)', fontWeight: 600 }}>
                  ✓ All sites have data for every date in range
                </span>
              )}
            </div>

            {missingSites.length > 0 && (
              <div className="filters-bar" style={{ borderBottom: '1px solid var(--border)' }}>
                <input
                  type="text"
                  className="filter-search"
                  placeholder="Filter site ID / name…"
                  style={{ minWidth: 220 }}
                  value={siteFilter}
                  onChange={e => { setSiteFilter(e.target.value); setPage(1) }}
                />
                {siteFilter && (
                  <button
                    onClick={() => { setSiteFilter(''); setPage(1) }}
                    style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 12 }}
                  >
                    ✕
                  </button>
                )}
              </div>
            )}

            <div className="table-responsive">
              <table className="evo-table">
                <thead>
                  <tr>
                    <th>Site ID</th>
                    <th>Site Name</th>
                    <th style={{ textAlign: 'center' }}>Missing Count</th>
                    {dates.map(d => (
                      <th key={d} style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>{d}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredSites.length === 0 ? (
                    <tr>
                      <td colSpan={3 + dates.length}>
                        <div className="empty-state">
                          {missingSites.length === 0
                            ? 'No missing data — all sites are complete for this date range.'
                            : 'No sites match the filter.'}
                        </div>
                      </td>
                    </tr>
                  ) : pageRows.map(site => (
                    <tr key={site.siteId}>
                      <td><span className="badge badge-blue">{site.siteId}</span></td>
                      <td style={{ color: 'var(--text-secondary)' }}>{site.siteName}</td>
                      <td style={{ textAlign: 'center' }}>
                        <span className="badge badge-red">{site.missingCount}</span>
                      </td>
                      {dates.map(d => {
                        const isMissing = site.missingDates.has(d)
                        return (
                          <td key={d} style={{ textAlign: 'center', padding: '6px 8px' }}>
                            {isMissing ? (
                              <span
                                title={`${site.siteName} — missing ${d}`}
                                style={{
                                  display: 'inline-block',
                                  width: 20, height: 20,
                                  borderRadius: 4,
                                  background: '#ef4444',
                                  verticalAlign: 'middle',
                                }}
                              />
                            ) : (
                              <span
                                title={`${site.siteName} — data present ${d}`}
                                style={{
                                  display: 'inline-block',
                                  width: 20, height: 20,
                                  borderRadius: 4,
                                  background: '#22c55e',
                                  verticalAlign: 'middle',
                                }}
                              />
                            )}
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {filteredSites.length > PAGE_SIZE && (
              <div className="pagination">
                <span className="pagination-info">
                  {filteredSites.length} sites · page {page} of {totalPages}
                </span>
                <button className="page-btn" disabled={page <= 1} onClick={() => setPage(1)}>«</button>
                <button className="page-btn" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>‹</button>
                <button className="page-btn active">{page}</button>
                <button className="page-btn" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>›</button>
                <button className="page-btn" disabled={page >= totalPages} onClick={() => setPage(totalPages)}>»</button>
              </div>
            )}
          </div>
        </>
      )}
    </ErrorBoundary>
  )
}
