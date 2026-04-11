import { useEffect, useState } from 'react'
import { alarmSettingsApi, emailRecipientsApi } from '../api/client'
import ErrorBoundary from '../components/ErrorBoundary'

const CATEGORY_ORDER = ['Tank', 'Delivery', 'Pump', 'Equipment', 'Safety', 'Connectivity', 'Reporting']

export default function AlarmSettings() {
  const [alarms, setAlarms] = useState([])
  const [recipients, setRecipients] = useState([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(null) // { alarmTypeId, isEnabled, notes, recipientIds }
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function load() {
    const [alarmData, recipientData] = await Promise.all([
      alarmSettingsApi.getAll(),
      emailRecipientsApi.getAll(),
    ])
    setAlarms(alarmData || [])
    setRecipients((recipientData || []).filter(r => r.isActive))
    setLoading(false)
  }

  useEffect(() => { load().catch(() => { setError('Failed to load data'); setLoading(false) }) }, [])

  function handleEdit(alarm) {
    setEditing({
      alarmTypeId: alarm.alarmType.id,
      isEnabled: alarm.setting?.isEnabled ?? false,
      notes: alarm.setting?.notes ?? '',
      recipientIds: alarm.recipients.map(r => r.id),
    })
    setError('')
  }

  function toggleRecipient(id) {
    setEditing(e => ({
      ...e,
      recipientIds: e.recipientIds.includes(id)
        ? e.recipientIds.filter(x => x !== id)
        : [...e.recipientIds, id],
    }))
  }

  async function handleSave(e) {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      await alarmSettingsApi.upsert(editing)
      setEditing(null)
      await load()
    } catch {
      setError('Failed to save alarm setting')
    } finally {
      setSaving(false)
    }
  }

  // Group alarms by category
  const grouped = CATEGORY_ORDER.reduce((acc, cat) => {
    const items = alarms.filter(a => a.alarmType.category === cat)
    if (items.length) acc[cat] = items
    return acc
  }, {})

  const editingAlarm = editing ? alarms.find(a => a.alarmType.id === editing.alarmTypeId) : null

  return (
    <ErrorBoundary fallback="Alarm Settings page error.">
      <div className="page-header mb-4">
        <div>
          <div className="page-title">Alarm Settings</div>
          <div className="page-subtitle">Configure alarms and assign email recipients for each alert type</div>
        </div>
      </div>

      {/* Edit panel */}
      {editing && editingAlarm && (
        <div className="card mb-4">
          <div className="card-header">
            <span className="card-title">Configure: {editingAlarm.alarmType.name}</span>
          </div>
          <div style={{ padding: '16px 20px' }}>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 14 }}>
              {editingAlarm.alarmType.description}
            </p>
            <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                  type="checkbox"
                  id="isEnabled"
                  checked={editing.isEnabled}
                  onChange={e => setEditing(ed => ({ ...ed, isEnabled: e.target.checked }))}
                />
                <label htmlFor="isEnabled" style={{ fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                  Enable this alarm
                </label>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>Notes</label>
                <input
                  type="text"
                  className="filter-input"
                  value={editing.notes}
                  onChange={e => setEditing(ed => ({ ...ed, notes: e.target.value }))}
                  placeholder="Optional notes about this alarm..."
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>
                  Email Recipients ({editing.recipientIds.length} selected)
                </label>
                {recipients.length === 0 ? (
                  <p style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                    No active email recipients configured. Add recipients in Config → Email first.
                  </p>
                ) : (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {recipients.map(r => (
                      <label
                        key={r.id}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 6,
                          padding: '4px 10px', borderRadius: 4, cursor: 'pointer',
                          border: '1px solid var(--border)',
                          background: editing.recipientIds.includes(r.id) ? 'var(--accent-bg, #eff6ff)' : 'transparent',
                          fontSize: 13,
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={editing.recipientIds.includes(r.id)}
                          onChange={() => toggleRecipient(r.id)}
                        />
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
                  {saving ? 'Saving…' : 'Save'}
                </button>
                <button type="button" className="btn btn-secondary" onClick={() => setEditing(null)}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {loading ? (
        <div className="loading-state"><div className="spinner" />Loading alarm settings...</div>
      ) : (
        Object.entries(grouped).map(([category, items]) => (
          <div key={category} className="card mb-4">
            <div className="card-header">
              <span className="card-title">{category}</span>
            </div>
            <div className="table-responsive">
              <table className="evo-table">
                <thead>
                  <tr>
                    <th>Alarm</th>
                    <th>Description</th>
                    <th>Status</th>
                    <th>Recipients</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {items.map(alarm => (
                    <tr key={alarm.alarmType.id}>
                      <td style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{alarm.alarmType.name}</td>
                      <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{alarm.alarmType.description}</td>
                      <td>
                        <span style={{
                          display: 'inline-block', padding: '2px 8px', borderRadius: 4,
                          fontSize: 11, fontWeight: 600,
                          background: alarm.setting?.isEnabled
                            ? 'var(--success-bg, #d1fae5)' : 'var(--muted-bg, #f3f4f6)',
                          color: alarm.setting?.isEnabled
                            ? 'var(--success, #059669)' : 'var(--text-secondary)',
                        }}>
                          {alarm.setting?.isEnabled ? 'Enabled' : 'Disabled'}
                        </span>
                      </td>
                      <td style={{ fontSize: 12 }}>
                        {alarm.recipients.length === 0
                          ? <span style={{ color: 'var(--text-secondary)' }}>—</span>
                          : alarm.recipients.map(r => r.name || r.email).join(', ')}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <button
                          className="btn btn-secondary"
                          style={{ fontSize: 11, padding: '2px 10px' }}
                          onClick={() => handleEdit(alarm)}
                        >Configure</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))
      )}
    </ErrorBoundary>
  )
}
