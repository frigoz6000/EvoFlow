import { useEffect, useState } from 'react'
import { reportSchedulesApi, emailRecipientsApi, reportDispatchesApi } from '../api/client'
import ErrorBoundary from '../components/ErrorBoundary'

const REPORT_TYPES = [
  'Daily Fuel Summary',
  'Volume & Revenue Report',
  'Pump Performance Report',
  'Active Alarms Report',
  'Tank Level Report',
  'Transaction History Report',
  'Device Status Report',
  'Flow Rate Analysis',
  'Site Comparison Report',
  'Fuel Consumption Report',
]

const DAYS = [
  { value: '1', label: 'Mon' },
  { value: '2', label: 'Tue' },
  { value: '3', label: 'Wed' },
  { value: '4', label: 'Thu' },
  { value: '5', label: 'Fri' },
  { value: '6', label: 'Sat' },
  { value: '7', label: 'Sun' },
]

const EMPTY_FORM = {
  name: '',
  reportType: REPORT_TYPES[0],
  recurrencePattern: 'Daily',
  daysOfWeek: [],
  dayOfMonth: 1,
  timeOfDay: '08:00',
  isEnabled: true,
  notes: '',
  recipientIds: [],
}

function describeSchedule(schedule) {
  const time = schedule.timeOfDay
  if (schedule.recurrencePattern === 'Daily') return `Daily at ${time}`
  if (schedule.recurrencePattern === 'Weekly') {
    if (!schedule.daysOfWeek) return `Weekly at ${time}`
    const dayNums = schedule.daysOfWeek.split(',')
    const dayNames = DAYS.filter(d => dayNums.includes(d.value)).map(d => d.label)
    return `Weekly on ${dayNames.join(', ')} at ${time}`
  }
  if (schedule.recurrencePattern === 'Monthly') {
    return `Monthly on day ${schedule.dayOfMonth} at ${time}`
  }
  return `at ${time}`
}

export default function ReportSchedules() {
  const [tab, setTab] = useState('schedules') // 'schedules' | 'history'
  const [schedules, setSchedules] = useState([])
  const [recipients, setRecipients] = useState([])
  const [dispatches, setDispatches] = useState([])
  const [loading, setLoading] = useState(true)
  const [historyLoading, setHistoryLoading] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [editingId, setEditingId] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function load() {
    const [schedData, recipData] = await Promise.all([
      reportSchedulesApi.getAll(),
      emailRecipientsApi.getAll(),
    ])
    setSchedules(Array.isArray(schedData) ? schedData : [])
    setRecipients((Array.isArray(recipData) ? recipData : []).filter(r => r.isActive))
    setLoading(false)
  }

  useEffect(() => { load().catch(() => { setError('Failed to load data'); setLoading(false) }) }, [])

  function loadHistory() {
    setHistoryLoading(true)
    reportDispatchesApi.getRecent()
      .then(data => setDispatches(Array.isArray(data) ? data : []))
      .catch(() => {})
      .finally(() => setHistoryLoading(false))
  }

  function handleTabChange(t) {
    setTab(t)
    if (t === 'history' && dispatches.length === 0) loadHistory()
  }

  function handleNew() {
    setForm(EMPTY_FORM)
    setEditingId(null)
    setShowForm(true)
    setError('')
  }

  function handleEdit(item) {
    const s = item.schedule
    setForm({
      name: s.name,
      reportType: s.reportType,
      recurrencePattern: s.recurrencePattern,
      daysOfWeek: s.daysOfWeek ? s.daysOfWeek.split(',') : [],
      dayOfMonth: s.dayOfMonth ?? 1,
      timeOfDay: s.timeOfDay,
      isEnabled: s.isEnabled,
      notes: s.notes ?? '',
      recipientIds: item.recipients.map(r => r.id),
    })
    setEditingId(s.id)
    setShowForm(true)
    setError('')
  }

  function handleCancel() {
    setShowForm(false)
    setEditingId(null)
    setForm(EMPTY_FORM)
    setError('')
  }

  function toggleDay(val) {
    setForm(f => ({
      ...f,
      daysOfWeek: f.daysOfWeek.includes(val)
        ? f.daysOfWeek.filter(d => d !== val)
        : [...f.daysOfWeek, val].sort()
    }))
  }

  function toggleRecipient(id) {
    setForm(f => ({
      ...f,
      recipientIds: f.recipientIds.includes(id)
        ? f.recipientIds.filter(x => x !== id)
        : [...f.recipientIds, id]
    }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.name.trim()) { setError('Name is required'); return }
    if (form.recurrencePattern === 'Weekly' && form.daysOfWeek.length === 0) {
      setError('Select at least one day for weekly recurrence'); return
    }
    setSaving(true)
    setError('')
    const payload = {
      ...form,
      daysOfWeek: form.recurrencePattern === 'Weekly' ? form.daysOfWeek.join(',') : null,
      dayOfMonth: form.recurrencePattern === 'Monthly' ? form.dayOfMonth : null,
    }
    try {
      if (editingId) {
        await reportSchedulesApi.update(editingId, payload)
      } else {
        await reportSchedulesApi.create(payload)
      }
      setShowForm(false)
      setEditingId(null)
      setForm(EMPTY_FORM)
      await load()
    } catch {
      setError('Failed to save schedule')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id) {
    if (!window.confirm('Delete this report schedule?')) return
    try {
      await reportSchedulesApi.remove(id)
      setSchedules(s => s.filter(x => x.schedule.id !== id))
    } catch {
      setError('Failed to delete schedule')
    }
  }

  return (
    <ErrorBoundary fallback="Report Schedules page error.">
      <div className="page-header mb-4">
        <div>
          <div className="page-title">Report Schedules</div>
          <div className="page-subtitle">Schedule automated reports to be sent to email recipients</div>
        </div>
        {tab === 'schedules' && (
          <button className="btn btn-primary" onClick={handleNew}>+ Add Schedule</button>
        )}
        {tab === 'history' && (
          <button className="btn btn-secondary" onClick={loadHistory}>Refresh</button>
        )}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 16, borderBottom: '1px solid var(--card-border)' }}>
        {['schedules', 'history'].map(t => (
          <button key={t} onClick={() => handleTabChange(t)} style={{
            padding: '8px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
            background: 'none', border: 'none', borderBottom: `2px solid ${tab === t ? 'var(--accent)' : 'transparent'}`,
            color: tab === t ? 'var(--accent)' : 'var(--text-secondary)',
            marginBottom: -1, transition: 'color 0.15s',
          }}>
            {t === 'schedules' ? 'Schedules' : 'Dispatch History'}
          </button>
        ))}
      </div>

      {tab === 'history' && (
        <div className="card">
          <div className="card-header">
            <span className="card-title">Recent Dispatches — last 100</span>
          </div>
          <div className="table-responsive">
            {historyLoading ? (
              <div className="loading-state"><div className="spinner" />Loading history...</div>
            ) : dispatches.length === 0 ? (
              <div className="loading-state">No dispatches recorded yet. Reports will appear here once the background service fires them.</div>
            ) : (
              <table className="evo-table">
                <thead>
                  <tr>
                    <th>Dispatched</th>
                    <th>Schedule</th>
                    <th>Report</th>
                    <th>Recipients</th>
                    <th>Status</th>
                    <th>Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {dispatches.map(d => (
                    <tr key={d.id}>
                      <td style={{ fontSize: 12, whiteSpace: 'nowrap' }}>
                        {new Date(d.dispatchedAt).toLocaleString()}
                      </td>
                      <td style={{ fontWeight: 600 }}>{d.scheduleName}</td>
                      <td style={{ fontSize: 12 }}>{d.reportType}</td>
                      <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{d.recipients || '—'}</td>
                      <td>
                        <span style={{
                          display: 'inline-block', padding: '2px 8px', borderRadius: 4,
                          fontSize: 11, fontWeight: 600,
                          background: d.status === 'Sent' ? 'var(--success-bg, #d1fae5)' : d.status === 'Failed' ? 'var(--red-light)' : 'var(--input-bg)',
                          color: d.status === 'Sent' ? 'var(--success, #059669)' : d.status === 'Failed' ? 'var(--red)' : 'var(--text-secondary)',
                        }}>{d.status}</span>
                      </td>
                      <td style={{ fontSize: 12, color: 'var(--text-secondary)', maxWidth: 300 }}>{d.notes || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {tab === 'schedules' && showForm && (
        <div className="card mb-4">
          <div className="card-header">
            <span className="card-title">{editingId ? 'Edit Schedule' : 'New Report Schedule'}</span>
          </div>
          <div style={{ padding: '20px 22px' }}>
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 560 }}>

              {/* Name */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <label style={labelStyle}>Schedule Name *</label>
                <input type="text" className="filter-input" value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Morning Fuel Summary" required />
              </div>

              {/* Report Type */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <label style={labelStyle}>Report Type *</label>
                <select className="filter-input" value={form.reportType}
                  onChange={e => setForm(f => ({ ...f, reportType: e.target.value }))}>
                  {REPORT_TYPES.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>

              {/* Recurrence + Time row */}
              <div style={{ display: 'flex', gap: 12 }}>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <label style={labelStyle}>Recurrence *</label>
                  <select className="filter-input" value={form.recurrencePattern}
                    onChange={e => setForm(f => ({ ...f, recurrencePattern: e.target.value, daysOfWeek: [] }))}>
                    <option value="Daily">Daily</option>
                    <option value="Weekly">Weekly</option>
                    <option value="Monthly">Monthly</option>
                  </select>
                </div>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <label style={labelStyle}>Time of Day *</label>
                  <input type="time" className="filter-input" value={form.timeOfDay}
                    onChange={e => setForm(f => ({ ...f, timeOfDay: e.target.value }))} required />
                </div>
              </div>

              {/* Days of Week (Weekly only) */}
              {form.recurrencePattern === 'Weekly' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <label style={labelStyle}>Days of Week *</label>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {DAYS.map(d => (
                      <label key={d.value} style={{
                        display: 'flex', alignItems: 'center', gap: 4,
                        padding: '4px 10px', borderRadius: 4, cursor: 'pointer',
                        border: '1px solid var(--border)',
                        background: form.daysOfWeek.includes(d.value) ? 'var(--accent-bg, #eff6ff)' : 'transparent',
                        fontSize: 12, fontWeight: 600,
                      }}>
                        <input type="checkbox" checked={form.daysOfWeek.includes(d.value)}
                          onChange={() => toggleDay(d.value)} />
                        {d.label}
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {/* Day of Month (Monthly only) */}
              {form.recurrencePattern === 'Monthly' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <label style={labelStyle}>Day of Month (1–28) *</label>
                  <input type="number" className="filter-input" min={1} max={28}
                    value={form.dayOfMonth}
                    onChange={e => setForm(f => ({ ...f, dayOfMonth: parseInt(e.target.value) || 1 }))}
                    style={{ maxWidth: 100 }} />
                </div>
              )}

              {/* Enable toggle */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input type="checkbox" id="schedEnabled" checked={form.isEnabled}
                  onChange={e => setForm(f => ({ ...f, isEnabled: e.target.checked }))} />
                <label htmlFor="schedEnabled" style={{ fontSize: 13, cursor: 'pointer' }}>Enabled</label>
              </div>

              {/* Notes */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <label style={labelStyle}>Notes</label>
                <input type="text" className="filter-input" value={form.notes}
                  onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                  placeholder="Optional notes..." />
              </div>

              {/* Recipients */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label style={labelStyle}>Email Recipients ({form.recipientIds.length} selected)</label>
                {recipients.length === 0 ? (
                  <p style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                    No active recipients. Add them in Config → Email first.
                  </p>
                ) : (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {recipients.map(r => (
                      <label key={r.id} style={{
                        display: 'flex', alignItems: 'center', gap: 6,
                        padding: '4px 10px', borderRadius: 4, cursor: 'pointer',
                        border: '1px solid var(--border)', fontSize: 13,
                        background: form.recipientIds.includes(r.id) ? 'var(--accent-bg, #eff6ff)' : 'transparent',
                      }}>
                        <input type="checkbox" checked={form.recipientIds.includes(r.id)}
                          onChange={() => toggleRecipient(r.id)} />
                        <span>{r.name || r.email}</span>
                        {r.name && <span style={{ color: 'var(--text-secondary)', fontSize: 11 }}>{r.email}</span>}
                      </label>
                    ))}
                  </div>
                )}
              </div>

              {error && <div style={{ color: 'var(--danger)', fontSize: 12 }}>{error}</div>}

              <div style={{ display: 'flex', gap: 8 }}>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? 'Saving…' : editingId ? 'Save Changes' : 'Create Schedule'}
                </button>
                <button type="button" className="btn btn-secondary" onClick={handleCancel}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {tab === 'schedules' && <div className="card">
        <div className="card-header">
          <span className="card-title">Schedules — {schedules.length} configured</span>
        </div>
        <div className="table-responsive">
          {loading ? (
            <div className="loading-state"><div className="spinner" />Loading schedules...</div>
          ) : (
            <table className="evo-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Report</th>
                  <th>Schedule</th>
                  <th>Recipients</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {schedules.length === 0 ? (
                  <tr><td colSpan={6}><div className="empty-state">No report schedules configured yet.</div></td></tr>
                ) : schedules.map(item => (
                  <tr key={item.schedule.id}>
                    <td style={{ fontWeight: 600 }}>{item.schedule.name}</td>
                    <td style={{ fontSize: 12 }}>{item.schedule.reportType}</td>
                    <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{describeSchedule(item.schedule)}</td>
                    <td style={{ fontSize: 12 }}>
                      {item.recipients.length === 0
                        ? <span style={{ color: 'var(--text-secondary)' }}>—</span>
                        : item.recipients.map(r => r.name || r.email).join(', ')}
                    </td>
                    <td>
                      <span style={{
                        display: 'inline-block', padding: '2px 8px', borderRadius: 4,
                        fontSize: 11, fontWeight: 600,
                        background: item.schedule.isEnabled ? 'var(--success-bg, #d1fae5)' : 'var(--muted-bg, #f3f4f6)',
                        color: item.schedule.isEnabled ? 'var(--success, #059669)' : 'var(--text-secondary)',
                      }}>
                        {item.schedule.isEnabled ? 'Active' : 'Paused'}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <button className="btn btn-secondary btn-sm"
                        style={{ marginRight: 6 }}
                        onClick={() => handleEdit(item)}>Edit</button>
                      <button className="btn btn-danger btn-sm"
                        onClick={() => handleDelete(item.schedule.id)}>Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>}
    </ErrorBoundary>
  )
}

const labelStyle = { fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }
