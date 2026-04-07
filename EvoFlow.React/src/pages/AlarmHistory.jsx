import { useState, useMemo } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts'
import ErrorBoundary from '../components/ErrorBoundary'

const GROUPS = ['Northern', 'Southern', 'Eastern', 'Western', 'Central']
const SITES = ['Site Alpha', 'Site Beta', 'Site Gamma', 'Site Delta', 'Site Echo',
  'Site Foxtrot', 'Site Golf', 'Site Hotel', 'Site India', 'Site Juliet']
const SEVERITIES = ['Critical', 'High', 'Medium', 'Low']
const MALFUNCTIONS = ['Pump Failure', 'Sensor Error', 'Comms Loss', 'Power Fault',
  'Flow Deviation', 'Pressure Alert', 'Temperature High', 'Calibration Drift',
  'Valve Stuck', 'Overfill Risk']
const CATEGORIES = ['Mechanical', 'Electrical', 'Network', 'Safety', 'Operational']
const EQUIPMENT = ['Pump Unit', 'Flow Meter', 'Control Panel', 'Pressure Valve', 'Sensor Array']
const PARAMETERS = ['Flow Rate', 'Pressure', 'Temperature', 'Voltage', 'Signal Strength']
const PRODUCTS = ['Diesel', 'Petrol', 'LPG', 'AdBlue', 'Kerosene']
const RESOLUTIONS = ['Resolved', 'Auto-Closed', 'Manually Closed', 'Escalated & Resolved']

function rnd(arr) { return arr[Math.floor(Math.random() * arr.length)] }
function rndBetween(a, b) { return a + Math.floor(Math.random() * (b - a + 1)) }

// 150 historical alarm records across Jan–Mar 2026
const HISTORY = Array.from({ length: 150 }, (_, i) => {
  const month = rndBetween(1, 3)
  const day = rndBetween(1, 28)
  const openDate = `2026-0${month}-${String(day).padStart(2, '0')}`
  const closeDays = rndBetween(1, 14)
  const closeDate = new Date(2026, month - 1, day + closeDays).toISOString().split('T')[0]
  return {
    id: i + 1,
    group: rnd(GROUPS),
    site: rnd(SITES),
    severity: SEVERITIES[Math.floor(Math.random() * 4)],
    malfunction: rnd(MALFUNCTIONS),
    openingDate: openDate,
    closingDate: closeDate,
    durationDays: closeDays,
    category: rnd(CATEGORIES),
    equipment: rnd(EQUIPMENT),
    parameter: rnd(PARAMETERS),
    product: rnd(PRODUCTS),
    resolution: rnd(RESOLUTIONS),
  }
})


const SEV_BADGE = {
  Critical: 'badge-red', High: 'badge-orange', Medium: 'badge-yellow', Low: 'badge-green',
}

const SEV_COLORS = { Critical: '#dc2626', High: '#ea580c', Medium: '#d97706', Low: '#16a34a' }
const CAT_COLORS = {
  Mechanical: '#6366f1', Electrical: '#0ea5e9', Network: '#8b5cf6',
  Safety: '#f43f5e', Operational: '#14b8a6',
}

// Build chart data grouped by either severity or category, bucketed by week
function buildChartDataBy(rows, groupBy) {
  const keys = groupBy === 'severity' ? SEVERITIES : CATEGORIES
  const weeks = {}
  rows.forEach(r => {
    const d = new Date(r.openingDate)
    const weekStart = new Date(d)
    weekStart.setDate(d.getDate() - d.getDay())
    const key = weekStart.toISOString().split('T')[0]
    if (!weeks[key]) {
      weeks[key] = { week: key }
      keys.forEach(k => { weeks[key][k] = 0 })
    }
    weeks[key][r[groupBy]]++
  })
  return Object.values(weeks).sort((a, b) => a.week.localeCompare(b.week))
}

const PAGE_SIZE = 20

export default function AlarmHistory() {
  const [filters, setFilters] = useState({
    dateFrom: '2026-01-01',
    dateTo: '2026-03-31',
    severity: '',
    group: '',
    site: '',
    category: '',
  })
  const [page, setPage] = useState(1)
  const [chartGroupBy, setChartGroupBy] = useState('severity')

  const filtered = useMemo(() => {
    return HISTORY.filter(a =>
      (!filters.severity || a.severity === filters.severity) &&
      (!filters.group || a.group === filters.group) &&
      (!filters.site || a.site === filters.site) &&
      (!filters.category || a.category === filters.category) &&
      (!filters.dateFrom || a.openingDate >= filters.dateFrom) &&
      (!filters.dateTo || a.openingDate <= filters.dateTo)
    )
  }, [filters])

  const chartData = useMemo(() => buildChartDataBy(filtered, chartGroupBy), [filtered, chartGroupBy])
  const chartKeys = chartGroupBy === 'severity' ? SEVERITIES : CATEGORIES
  const chartColors = chartGroupBy === 'severity' ? SEV_COLORS : CAT_COLORS

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const pageRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  function set(key, val) { setFilters(f => ({ ...f, [key]: val })); setPage(1) }
  function handleClear() {
    setFilters({ dateFrom: '2026-01-01', dateTo: '2026-03-31', severity: '', group: '', site: '', category: '' })
    setPage(1)
  }

  const totalDuration = filtered.reduce((s, r) => s + r.durationDays, 0)
  const avgDuration = filtered.length ? (totalDuration / filtered.length).toFixed(1) : 0

  return (
    <ErrorBoundary fallback="Alarm History page error.">
      <div className="page-header mb-4">
        <div>
          <div className="page-title">Alarm History</div>
          <div className="page-subtitle">Historical alarm records with trend analysis</div>
        </div>
      </div>

      {/* Summary stats */}
      <div className="stat-cards-row mb-5" style={{ gridTemplateColumns: 'repeat(4,1fr)' }}>
        {SEVERITIES.map(sev => (
          <div className="stat-card" key={sev}>
            <div className="stat-card-label">{sev}</div>
            <div className="stat-card-value" style={{ color: SEV_COLORS[sev] }}>
              {filtered.filter(a => a.severity === sev).length}
            </div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="card mb-4">
        <div className="card-header"><span className="card-title">Filters</span></div>
        <div className="filters-bar" style={{ flexWrap: 'wrap', gap: 8, padding: '12px 16px' }}>
          <label style={{ fontSize: 12, color: 'var(--text-secondary)', alignSelf: 'center' }}>From</label>
          <input type="date" className="filter-search" style={{ minWidth: 130 }}
            value={filters.dateFrom} onChange={e => set('dateFrom', e.target.value)} />
          <label style={{ fontSize: 12, color: 'var(--text-secondary)', alignSelf: 'center' }}>To</label>
          <input type="date" className="filter-search" style={{ minWidth: 130 }}
            value={filters.dateTo} onChange={e => set('dateTo', e.target.value)} />
          <select className="filter-select" value={filters.group} onChange={e => set('group', e.target.value)}>
            <option value="">All Groups</option>
            {GROUPS.map(g => <option key={g} value={g}>{g}</option>)}
          </select>
          <select className="filter-select" value={filters.site} onChange={e => set('site', e.target.value)}>
            <option value="">All Sites</option>
            {SITES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <select className="filter-select" value={filters.severity} onChange={e => set('severity', e.target.value)}>
            <option value="">All Severities</option>
            {SEVERITIES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <select className="filter-select" value={filters.category} onChange={e => set('category', e.target.value)}>
            <option value="">All Categories</option>
            {['Mechanical', 'Electrical', 'Network', 'Safety', 'Operational'].map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <button className="btn btn-outline btn-sm" onClick={handleClear}>Clear</button>
        </div>
      </div>

      {/* Chart */}
      <div className="card mb-4">
        <div className="card-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          <span className="card-title">Alarms by Week — {filtered.length} total · Avg resolution {avgDuration} days</span>
          <div style={{ display: 'flex', gap: 4 }}>
            <button
              className={`btn btn-sm ${chartGroupBy === 'severity' ? 'btn-primary' : 'btn-outline'}`}
              onClick={() => setChartGroupBy('severity')}
            >
              By Severity
            </button>
            <button
              className={`btn btn-sm ${chartGroupBy === 'category' ? 'btn-primary' : 'btn-outline'}`}
              onClick={() => setChartGroupBy('category')}
            >
              By Category
            </button>
          </div>
        </div>
        <div style={{ padding: '16px', height: 280 }}>
          {chartData.length === 0 ? (
            <div className="empty-state">No data for selected filters</div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 4, right: 20, left: 0, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="week" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} />
                <YAxis tick={{ fontSize: 11, fill: 'var(--text-muted)' }} allowDecimals={false} />
                <Tooltip
                  contentStyle={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 6, fontSize: 12 }}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                {chartKeys.map(key => (
                  <Bar key={key} dataKey={key} stackId="a" fill={chartColors[key]} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Grid */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">Alarm Records — {filtered.length} rows (page {page} of {totalPages})</span>
        </div>
        <div className="table-responsive">
          <table className="evo-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Group</th>
                <th>Site</th>
                <th>Severity</th>
                <th>Malfunction</th>
                <th>Opening Date</th>
                <th>Closing Date</th>
                <th>Duration (days)</th>
                <th>Category</th>
                <th>Equipment</th>
                <th>Parameter</th>
                <th>Product</th>
                <th>Resolution</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={13}><div className="empty-state">No records match the selected filters</div></td></tr>
              ) : pageRows.map(a => (
                <tr key={a.id}>
                  <td style={{ color: 'var(--text-muted)', fontSize: 11 }}>{a.id}</td>
                  <td><span className="badge badge-blue">{a.group}</span></td>
                  <td style={{ fontWeight: 600 }}>{a.site}</td>
                  <td><span className={`badge ${SEV_BADGE[a.severity]}`}>{a.severity}</span></td>
                  <td>{a.malfunction}</td>
                  <td style={{ whiteSpace: 'nowrap', color: 'var(--text-secondary)' }}>{a.openingDate}</td>
                  <td style={{ whiteSpace: 'nowrap', color: 'var(--text-secondary)' }}>{a.closingDate}</td>
                  <td style={{ textAlign: 'center' }}>
                    <span className={`badge ${a.durationDays > 7 ? 'badge-orange' : 'badge-green'}`}>
                      {a.durationDays}d
                    </span>
                  </td>
                  <td style={{ color: 'var(--text-secondary)' }}>{a.category}</td>
                  <td>{a.equipment}</td>
                  <td style={{ color: 'var(--text-muted)' }}>{a.parameter}</td>
                  <td><span className="badge badge-gray">{a.product}</span></td>
                  <td style={{ color: 'var(--text-secondary)', fontSize: 12 }}>{a.resolution}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="pagination">
          <span className="pagination-info">
            {filtered.length} total · showing {Math.min((page - 1) * PAGE_SIZE + 1, filtered.length)}–{Math.min(page * PAGE_SIZE, filtered.length)}
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
