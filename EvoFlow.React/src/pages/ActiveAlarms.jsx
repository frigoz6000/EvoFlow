import { useState, useMemo } from 'react'
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
const EQUIPMENT_DETAILS = ['Unit A', 'Unit B', 'Unit C', 'Primary', 'Secondary', 'Backup']
const PARAMETERS = ['Flow Rate', 'Pressure', 'Temperature', 'Voltage', 'Signal Strength']
const PRODUCTS = ['Diesel', 'Petrol', 'LPG', 'AdBlue', 'Kerosene']
const TRACKING = ['Open', 'Assigned', 'Under Review', 'Escalated']

function rnd(arr) { return arr[Math.floor(Math.random() * arr.length)] }
function rndDate() {
  const d = new Date(2026, 0, 1)
  d.setDate(d.getDate() + Math.floor(Math.random() * 96))
  return d.toISOString().split('T')[0]
}

const ALARMS = Array.from({ length: 100 }, (_, i) => ({
  id: i + 1,
  group: rnd(GROUPS),
  site: rnd(SITES),
  severity: SEVERITIES[Math.floor(Math.random() * 4)],
  malfunction: rnd(MALFUNCTIONS),
  openingDate: rndDate(),
  category: rnd(CATEGORIES),
  equipment: rnd(EQUIPMENT),
  equipmentDetail: rnd(EQUIPMENT_DETAILS),
  parameter: rnd(PARAMETERS),
  product: rnd(PRODUCTS),
  tracking: rnd(TRACKING),
}))

const SEV_STYLES = {
  Critical: { bg: '#dc2626', color: '#fff', border: '#b91c1c' },
  High:     { bg: '#ea580c', color: '#fff', border: '#c2410c' },
  Medium:   { bg: '#d97706', color: '#fff', border: '#b45309' },
  Low:      { bg: '#16a34a', color: '#fff', border: '#15803d' },
}

const SEV_BADGE = {
  Critical: 'badge-red',
  High:     'badge-orange',
  Medium:   'badge-yellow',
  Low:      'badge-green',
}

const PAGE_SIZE = 20

export default function ActiveAlarms() {
  const [severityFilter, setSeverityFilter] = useState('')
  const [groupFilter, setGroupFilter] = useState('')
  const [siteFilter, setSiteFilter] = useState('')
  const [page, setPage] = useState(1)

  const counts = useMemo(() => {
    const c = { Critical: 0, High: 0, Medium: 0, Low: 0 }
    ALARMS.forEach(a => c[a.severity]++)
    return c
  }, [])

  const filtered = useMemo(() => {
    return ALARMS.filter(a =>
      (!severityFilter || a.severity === severityFilter) &&
      (!groupFilter || a.group === groupFilter) &&
      (!siteFilter || a.site === siteFilter)
    )
  }, [severityFilter, groupFilter, siteFilter])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const pageRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  function handleSeverityBtn(sev) {
    setSeverityFilter(prev => prev === sev ? '' : sev)
    setPage(1)
  }
  function handleGroupChange(e) { setGroupFilter(e.target.value); setPage(1) }
  function handleSiteChange(e) { setSiteFilter(e.target.value); setPage(1) }
  function handleClear() { setSeverityFilter(''); setGroupFilter(''); setSiteFilter(''); setPage(1) }

  return (
    <ErrorBoundary fallback="Active Alarms page error.">
      <div className="page-header mb-4">
        <div>
          <div className="page-title">Active Alarms</div>
          <div className="page-subtitle">Real-time alarm monitoring across all sites</div>
        </div>
      </div>

      {/* Severity summary buttons */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
        {SEVERITIES.map(sev => {
          const s = SEV_STYLES[sev]
          const active = severityFilter === sev
          return (
            <button
              key={sev}
              onClick={() => handleSeverityBtn(sev)}
              style={{
                background: active ? s.bg : 'var(--card-bg)',
                color: active ? s.color : s.bg,
                border: `2px solid ${s.bg}`,
                borderRadius: 8,
                padding: '10px 24px',
                fontWeight: 700,
                fontSize: 14,
                cursor: 'pointer',
                minWidth: 130,
                transition: 'all 0.15s',
              }}
            >
              <div style={{ fontSize: 22, fontWeight: 800 }}>{counts[sev]}</div>
              <div>{sev}</div>
            </button>
          )
        })}
      </div>

      <div className="card">
        <div className="card-header">
          <span className="card-title">Active Alarms — {filtered.length} records (page {page} of {totalPages})</span>
        </div>

        <div className="filters-bar">
          <select className="filter-select" value={groupFilter} onChange={handleGroupChange}>
            <option value="">All Groups</option>
            {GROUPS.map(g => <option key={g} value={g}>{g}</option>)}
          </select>
          <select className="filter-select" value={siteFilter} onChange={handleSiteChange}>
            <option value="">All Sites</option>
            {SITES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <select className="filter-select" value={severityFilter}
            onChange={e => { setSeverityFilter(e.target.value); setPage(1) }}>
            <option value="">All Severities</option>
            {SEVERITIES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <button className="btn btn-outline btn-sm" onClick={handleClear}>Clear</button>
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
                <th>Category</th>
                <th>Equipment</th>
                <th>Equipment Detail</th>
                <th>Parameter</th>
                <th>Product</th>
                <th>Tracking</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={12}><div className="empty-state">No alarms match the selected filters</div></td></tr>
              ) : pageRows.map(a => (
                <tr key={a.id}>
                  <td style={{ color: 'var(--text-muted)', fontSize: 11 }}>{a.id}</td>
                  <td><span className="badge badge-blue">{a.group}</span></td>
                  <td style={{ fontWeight: 600 }}>{a.site}</td>
                  <td>
                    <span className={`badge ${SEV_BADGE[a.severity]}`}>{a.severity}</span>
                  </td>
                  <td>{a.malfunction}</td>
                  <td style={{ whiteSpace: 'nowrap', color: 'var(--text-secondary)' }}>{a.openingDate}</td>
                  <td style={{ color: 'var(--text-secondary)' }}>{a.category}</td>
                  <td>{a.equipment}</td>
                  <td style={{ color: 'var(--text-muted)' }}>{a.equipmentDetail}</td>
                  <td style={{ color: 'var(--text-secondary)' }}>{a.parameter}</td>
                  <td><span className="badge badge-gray">{a.product}</span></td>
                  <td>
                    <span className={`badge ${
                      a.tracking === 'Escalated' ? 'badge-red' :
                      a.tracking === 'Under Review' ? 'badge-orange' :
                      a.tracking === 'Assigned' ? 'badge-blue' : 'badge-gray'
                    }`}>{a.tracking}</span>
                  </td>
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
