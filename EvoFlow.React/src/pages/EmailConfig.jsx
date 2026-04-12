import { useEffect, useState } from 'react'
import { emailConfigApi } from '../api/client'
import ErrorBoundary from '../components/ErrorBoundary'

const EMPTY_FORM = {
  smtpHost: 'smtp.gmail.com',
  smtpPort: 587,
  useSsl: true,
  username: '',
  password: '',
  fromEmail: '',
  fromName: '',
  isEnabled: true,
}

export default function EmailConfig() {
  const [form, setForm] = useState(EMPTY_FORM)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    emailConfigApi.get()
      .then(data => {
        if (data) {
          setForm({
            smtpHost: data.smtpHost || '',
            smtpPort: data.smtpPort || 587,
            useSsl: data.useSsl ?? true,
            username: data.username || '',
            password: data.password || '',
            fromEmail: data.fromEmail || '',
            fromName: data.fromName || '',
            isEnabled: data.isEnabled ?? true,
          })
        }
      })
      .catch(() => setError('Failed to load email configuration'))
      .finally(() => setLoading(false))
  }, [])

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.smtpHost.trim()) { setError('SMTP host is required'); return }
    if (!form.username.trim()) { setError('Username is required'); return }
    if (!form.password.trim()) { setError('Password / App Password is required'); return }
    if (!form.fromEmail.trim()) { setError('From email is required'); return }
    setSaving(true)
    setError('')
    setSaved(false)
    try {
      await emailConfigApi.upsert(form)
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch {
      setError('Failed to save configuration')
    } finally {
      setSaving(false)
    }
  }

  function field(label, required = false) {
    return (
      <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>
        {label}{required && ' *'}
      </label>
    )
  }

  return (
    <ErrorBoundary fallback="Email Config page error.">
      <div className="page-header mb-4">
        <div>
          <div className="page-title">Email Configuration</div>
          <div className="page-subtitle">Configure the SMTP account used to send alarm notifications and reports</div>
        </div>
      </div>

      {loading ? (
        <div className="loading-state"><div className="spinner" />Loading configuration...</div>
      ) : (
        <div className="card" style={{ maxWidth: 560 }}>
          <div className="card-header">
            <span className="card-title">SMTP Settings</span>
            <span style={{
              display: 'inline-block',
              marginLeft: 10,
              padding: '2px 8px',
              borderRadius: 4,
              fontSize: 11,
              fontWeight: 600,
              background: form.isEnabled ? 'var(--success-bg, #d1fae5)' : 'var(--muted-bg, #f3f4f6)',
              color: form.isEnabled ? 'var(--success, #059669)' : 'var(--text-secondary)',
            }}>
              {form.isEnabled ? 'Enabled' : 'Disabled'}
            </span>
          </div>
          <div style={{ padding: '20px 22px' }}>
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 10, alignItems: 'end' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {field('SMTP Host', true)}
                  <input
                    type="text"
                    className="filter-input"
                    value={form.smtpHost}
                    onChange={e => setForm(f => ({ ...f, smtpHost: e.target.value }))}
                    placeholder="smtp.gmail.com"
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {field('Port', true)}
                  <input
                    type="number"
                    className="filter-input"
                    value={form.smtpPort}
                    onChange={e => setForm(f => ({ ...f, smtpPort: parseInt(e.target.value) || 587 }))}
                    style={{ width: 80 }}
                    min={1}
                    max={65535}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                  type="checkbox"
                  id="useSsl"
                  checked={form.useSsl}
                  onChange={e => setForm(f => ({ ...f, useSsl: e.target.checked }))}
                />
                <label htmlFor="useSsl" style={{ fontSize: 13, cursor: 'pointer' }}>Use SSL/TLS</label>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {field('Gmail Address (Username)', true)}
                <input
                  type="email"
                  className="filter-input"
                  value={form.username}
                  onChange={e => setForm(f => ({ ...f, username: e.target.value }))}
                  placeholder="youraddress@gmail.com"
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {field('App Password', true)}
                <input
                  type="password"
                  className="filter-input"
                  value={form.password}
                  onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                  placeholder="Gmail App Password (not your Google account password)"
                  autoComplete="new-password"
                />
                <span style={{ fontSize: 11, color: 'var(--text-muted, #9ca3af)' }}>
                  Generate an App Password in your Google account under Security → 2-Step Verification → App Passwords.
                </span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {field('From Email', true)}
                <input
                  type="email"
                  className="filter-input"
                  value={form.fromEmail}
                  onChange={e => setForm(f => ({ ...f, fromEmail: e.target.value }))}
                  placeholder="youraddress@gmail.com"
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {field('From Name')}
                <input
                  type="text"
                  className="filter-input"
                  value={form.fromName}
                  onChange={e => setForm(f => ({ ...f, fromName: e.target.value }))}
                  placeholder="EvoFlow Alerts"
                />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                  type="checkbox"
                  id="isEnabled"
                  checked={form.isEnabled}
                  onChange={e => setForm(f => ({ ...f, isEnabled: e.target.checked }))}
                />
                <label htmlFor="isEnabled" style={{ fontSize: 13, cursor: 'pointer' }}>Enable email sending</label>
              </div>

              {error && <div style={{ color: 'var(--danger)', fontSize: 12 }}>{error}</div>}
              {saved && <div style={{ color: 'var(--success, #059669)', fontSize: 12 }}>Configuration saved successfully.</div>}

              <div>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? 'Saving…' : 'Save Configuration'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </ErrorBoundary>
  )
}
