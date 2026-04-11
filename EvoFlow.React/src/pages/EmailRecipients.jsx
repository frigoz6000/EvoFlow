import { useEffect, useState } from 'react'
import { emailRecipientsApi } from '../api/client'
import ErrorBoundary from '../components/ErrorBoundary'

const EMPTY_FORM = { email: '', name: '', isActive: true }

export default function EmailRecipients() {
  const [recipients, setRecipients] = useState([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState(EMPTY_FORM)
  const [editingId, setEditingId] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [showForm, setShowForm] = useState(false)

  function load() {
    return emailRecipientsApi.getAll()
      .then(data => setRecipients(data || []))
      .catch(() => setError('Failed to load recipients'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  function handleEdit(r) {
    setForm({ email: r.email, name: r.name || '', isActive: r.isActive })
    setEditingId(r.id)
    setShowForm(true)
    setError('')
  }

  function handleNew() {
    setForm(EMPTY_FORM)
    setEditingId(null)
    setShowForm(true)
    setError('')
  }

  function handleCancel() {
    setShowForm(false)
    setEditingId(null)
    setForm(EMPTY_FORM)
    setError('')
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.email.trim()) { setError('Email is required'); return }
    setSaving(true)
    setError('')
    try {
      if (editingId) {
        await emailRecipientsApi.update(editingId, { id: editingId, ...form })
      } else {
        await emailRecipientsApi.create(form)
      }
      setShowForm(false)
      setEditingId(null)
      setForm(EMPTY_FORM)
      await load()
    } catch {
      setError('Failed to save recipient')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id) {
    if (!window.confirm('Remove this email recipient?')) return
    try {
      await emailRecipientsApi.remove(id)
      setRecipients(r => r.filter(x => x.id !== id))
    } catch {
      setError('Failed to delete recipient')
    }
  }

  return (
    <ErrorBoundary fallback="Email Recipients page error.">
      <div className="page-header mb-4">
        <div>
          <div className="page-title">Email Recipients</div>
          <div className="page-subtitle">Manage addresses for alarm notifications and reports</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-primary" onClick={handleNew}>+ Add Recipient</button>
        </div>
      </div>

      {showForm && (
        <div className="card mb-4">
          <div className="card-header">
            <span className="card-title">{editingId ? 'Edit Recipient' : 'Add Recipient'}</span>
          </div>
          <div style={{ padding: '20px 22px' }}>
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 480 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>Email Address *</label>
                <input
                  type="email"
                  className="filter-input"
                  value={form.email}
                  onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                  placeholder="user@example.com"
                  required
                />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>Name</label>
                <input
                  type="text"
                  className="filter-input"
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="Optional display name"
                />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                  type="checkbox"
                  id="isActive"
                  checked={form.isActive}
                  onChange={e => setForm(f => ({ ...f, isActive: e.target.checked }))}
                />
                <label htmlFor="isActive" style={{ fontSize: 13, cursor: 'pointer' }}>Active</label>
              </div>
              {error && <div style={{ color: 'var(--danger)', fontSize: 12 }}>{error}</div>}
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? 'Saving…' : editingId ? 'Save Changes' : 'Add Recipient'}
                </button>
                <button type="button" className="btn btn-secondary" onClick={handleCancel}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="card">
        <div className="card-header">
          <span className="card-title">Recipients — {recipients.length} configured</span>
        </div>
        <div className="table-responsive">
          {loading ? (
            <div className="loading-state"><div className="spinner" />Loading recipients...</div>
          ) : (
            <table className="evo-table">
              <thead>
                <tr>
                  <th>Email</th>
                  <th>Name</th>
                  <th>Status</th>
                  <th>Added</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {recipients.length === 0 ? (
                  <tr><td colSpan={5}><div className="empty-state">No recipients configured. Add one to start receiving notifications.</div></td></tr>
                ) : recipients.map(r => (
                  <tr key={r.id}>
                    <td style={{ fontWeight: 500 }}>{r.email}</td>
                    <td style={{ color: 'var(--text-secondary)' }}>{r.name || '—'}</td>
                    <td>
                      <span style={{
                        display: 'inline-block',
                        padding: '2px 8px',
                        borderRadius: 4,
                        fontSize: 11,
                        fontWeight: 600,
                        background: r.isActive ? 'var(--success-bg, #d1fae5)' : 'var(--muted-bg, #f3f4f6)',
                        color: r.isActive ? 'var(--success, #059669)' : 'var(--text-secondary)',
                      }}>
                        {r.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                      {new Date(r.createdUtc).toLocaleDateString()}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <button
                        className="btn btn-secondary btn-sm"
                        style={{ marginRight: 6 }}
                        onClick={() => handleEdit(r)}
                      >Edit</button>
                      <button
                        className="btn btn-danger btn-sm"
                        onClick={() => handleDelete(r.id)}
                      >Remove</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </ErrorBoundary>
  )
}
