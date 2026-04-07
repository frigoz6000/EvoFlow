import { useState, useMemo } from 'react'
import ErrorBoundary from '../components/ErrorBoundary'

const RECIPIENTS = [
  'john.smith@evoflow.com', 'sarah.jones@evoflow.com', 'mike.taylor@evoflow.com',
  'linda.white@evoflow.com', 'operations@evoflow.com', 'alerts@evoflow.com',
  '+61400111222', '+61400333444', '+61400555666',
  'site-manager@evoflow.com', 'maintenance@evoflow.com',
]
const NOTIF_TYPES = ['Email', 'SMS', 'Push']
const SITES = ['Site Alpha', 'Site Beta', 'Site Gamma', 'Site Delta', 'Site Echo',
  'Site Foxtrot', 'Site Golf', 'Site Hotel', 'Site India', 'Site Juliet']
const SEVERITIES = ['Critical', 'High', 'Medium', 'Low']
const SUBJECTS = [
  'CRITICAL: Pump Failure detected',
  'HIGH: Sensor Error at site',
  'MEDIUM: Flow Deviation warning',
  'LOW: Calibration Drift notice',
  'CRITICAL: Overfill Risk — immediate action required',
  'HIGH: Comms Loss — site offline',
  'MEDIUM: Pressure Alert',
  'LOW: Temperature threshold notice',
  'HIGH: Power Fault on Control Panel',
  'CRITICAL: Valve Stuck — manual intervention needed',
]
const STATUSES = ['Delivered', 'Delivered', 'Delivered', 'Failed', 'Pending']

function rnd(arr) { return arr[Math.floor(Math.random() * arr.length)] }
function rndBetween(a, b) { return a + Math.floor(Math.random() * (b - a + 1)) }

const NOTIFICATIONS = Array.from({ length: 120 }, (_, i) => {
  const month = rndBetween(1, 3)
  const day = rndBetween(1, 28)
  const hour = rndBetween(0, 23)
  const min = rndBetween(0, 59)
  const sentAt = `2026-0${month}-${String(day).padStart(2, '0')} ${String(hour).padStart(2, '0')}:${String(min).padStart(2, '0')}`
  const severity = rnd(SEVERITIES)
  const notifType = rnd(NOTIF_TYPES)
  const subject = SUBJECTS.find(s => s.includes(severity.toUpperCase())) || rnd(SUBJECTS)
  const recipient = notifType === 'SMS'
    ? rnd(RECIPIENTS.filter(r => r.startsWith('+')))
    : rnd(RECIPIENTS.filter(r => r.includes('@')))
  return {
    id: i + 1,
    recipient,
    type: notifType,
    subject,
    sentAt,
    status: rnd(STATUSES),
    severity,
    site: rnd(SITES),
    alarmRef: `ALM-${String(rndBetween(1, 100)).padStart(4, '0')}`,
  }
})

const TYPE_BADGE = { Email: 'badge-blue', SMS: 'badge-orange', Push: 'badge-green' }
const STATUS_BADGE = { Delivered: 'badge-green', Failed: 'badge-red', Pending: 'badge-yellow' }
const SEV_BADGE = { Critical: 'badge-red', High: 'badge-orange', Medium: 'badge-yellow', Low: 'badge-green' }

const PAGE_SIZE = 20

export default function AlarmNotifications() {
  const [filters, setFilters] = useState({ type: '', severity: '', site: '', status: '', search: '' })
  const [page, setPage] = useState(1)

  const filtered = useMemo(() => {
    return NOTIFICATIONS.filter(n =>
      (!filters.type || n.type === filters.type) &&
      (!filters.severity || n.severity === filters.severity) &&
      (!filters.site || n.site === filters.site) &&
      (!filters.status || n.status === filters.status) &&
      (!filters.search || n.recipient.toLowerCase().includes(filters.search.toLowerCase()) ||
        n.subject.toLowerCase().includes(filters.search.toLowerCase()) ||
        n.alarmRef.toLowerCase().includes(filters.search.toLowerCase()))
    )
  }, [filters])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const pageRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  function set(key, val) { setFilters(f => ({ ...f, [key]: val })); setPage(1) }
  function handleClear() { setFilters({ type: '', severity: '', site: '', status: '', search: '' }); setPage(1) }

  const deliveredCount = NOTIFICATIONS.filter(n => n.status === 'Delivered').length
  const failedCount = NOTIFICATIONS.filter(n => n.status === 'Failed').length
  const pendingCount = NOTIFICATIONS.filter(n => n.status === 'Pending').length

  return (
    <ErrorBoundary fallback="Notifications page error.">
      <div className="page-header mb-4">
        <div>
          <div className="page-title">Notifications</div>
          <div className="page-subtitle">Email and SMS notifications sent for alarm events</div>
        </div>
      </div>

      {/* Summary stats */}
      <div className="stat-cards-row mb-5" style={{ gridTemplateColumns: 'repeat(4,1fr)' }}>
        <div className="stat-card">
          <div className="stat-card-label">Total Sent</div>
          <div className="stat-card-value">{NOTIFICATIONS.length}</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-label">Delivered</div>
          <div className="stat-card-value" style={{ color: 'var(--green)' }}>{deliveredCount}</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-label">Failed</div>
          <div className="stat-card-value" style={{ color: 'var(--red)' }}>{failedCount}</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-label">Pending</div>
          <div className="stat-card-value" style={{ color: 'var(--orange)' }}>{pendingCount}</div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <span className="card-title">Notification Log — {filtered.length} records (page {page} of {totalPages})</span>
        </div>

        <div className="filters-bar" style={{ flexWrap: 'wrap', gap: 8 }}>
          <input
            type="text"
            className="filter-search"
            placeholder="Search recipient, subject, alarm ref..."
            value={filters.search}
            onChange={e => set('search', e.target.value)}
            style={{ minWidth: 220 }}
          />
          <select className="filter-select" value={filters.type} onChange={e => set('type', e.target.value)}>
            <option value="">All Types</option>
            {NOTIF_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <select className="filter-select" value={filters.severity} onChange={e => set('severity', e.target.value)}>
            <option value="">All Severities</option>
            {SEVERITIES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <select className="filter-select" value={filters.site} onChange={e => set('site', e.target.value)}>
            <option value="">All Sites</option>
            {SITES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <select className="filter-select" value={filters.status} onChange={e => set('status', e.target.value)}>
            <option value="">All Statuses</option>
            {['Delivered', 'Failed', 'Pending'].map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <button className="btn btn-outline btn-sm" onClick={handleClear}>Clear</button>
        </div>

        <div className="table-responsive">
          <table className="evo-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Alarm Ref</th>
                <th>Type</th>
                <th>Recipient</th>
                <th>Subject</th>
                <th>Site</th>
                <th>Severity</th>
                <th>Sent At</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={9}><div className="empty-state">No notifications match the selected filters</div></td></tr>
              ) : pageRows.map(n => (
                <tr key={n.id}>
                  <td style={{ color: 'var(--text-muted)', fontSize: 11 }}>{n.id}</td>
                  <td><span className="site-id-link">{n.alarmRef}</span></td>
                  <td><span className={`badge ${TYPE_BADGE[n.type]}`}>{n.type}</span></td>
                  <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{n.recipient}</td>
                  <td style={{ fontSize: 12, maxWidth: 280 }}>{n.subject}</td>
                  <td style={{ fontWeight: 600 }}>{n.site}</td>
                  <td><span className={`badge ${SEV_BADGE[n.severity]}`}>{n.severity}</span></td>
                  <td style={{ whiteSpace: 'nowrap', color: 'var(--text-muted)', fontSize: 12 }}>{n.sentAt}</td>
                  <td><span className={`badge ${STATUS_BADGE[n.status]}`}>{n.status}</span></td>
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
