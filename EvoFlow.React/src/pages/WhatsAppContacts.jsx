import { useEffect, useState } from 'react'
import { useLanguage } from '../i18n/LanguageContext'
import { whatsAppContactsApi, whatsAppConfigApi } from '../api/client'
import ErrorBoundary from '../components/ErrorBoundary'

const EMPTY_CONTACT = { id: 0, name: '', phoneNumber: '', isActive: true }
const EMPTY_CONFIG = { accountSid: '', authToken: '', fromNumber: '', isEnabled: false }

export default function WhatsAppContacts() {
  const { t } = useLanguage()
  const [tab, setTab] = useState('contacts')

  // Contacts state
  const [contacts, setContacts] = useState([])
  const [loadingContacts, setLoadingContacts] = useState(true)
  const [editContact, setEditContact] = useState(null)
  const [savingContact, setSavingContact] = useState(false)
  const [contactError, setContactError] = useState('')

  // Config state
  const [config, setConfig] = useState(EMPTY_CONFIG)
  const [loadingConfig, setLoadingConfig] = useState(true)
  const [savingConfig, setSavingConfig] = useState(false)
  const [configError, setConfigError] = useState('')
  const [configSaved, setConfigSaved] = useState(false)

  useEffect(() => {
    loadContacts()
    loadConfig()
  }, [])

  function loadContacts() {
    setLoadingContacts(true)
    whatsAppContactsApi.getAll()
      .then(d => setContacts(Array.isArray(d) ? d : []))
      .catch(() => setContactError('Failed to load contacts'))
      .finally(() => setLoadingContacts(false))
  }

  function loadConfig() {
    setLoadingConfig(true)
    whatsAppConfigApi.get()
      .then(d => { if (d) setConfig(d) })
      .catch(() => {})
      .finally(() => setLoadingConfig(false))
  }

  function handleNewContact() {
    setEditContact({ ...EMPTY_CONTACT })
    setContactError('')
  }

  function handleEditContact(c) {
    setEditContact({ ...c })
    setContactError('')
  }

  async function handleSaveContact(e) {
    e.preventDefault()
    if (!editContact.name.trim() || !editContact.phoneNumber.trim()) {
      setContactError('Name and phone number are required')
      return
    }
    setSavingContact(true)
    setContactError('')
    try {
      if (editContact.id) {
        await whatsAppContactsApi.update(editContact.id, editContact)
      } else {
        await whatsAppContactsApi.create(editContact)
      }
      setEditContact(null)
      loadContacts()
    } catch {
      setContactError('Failed to save contact')
    } finally {
      setSavingContact(false)
    }
  }

  async function handleDeleteContact(id) {
    if (!window.confirm('Delete this contact?')) return
    try {
      await whatsAppContactsApi.remove(id)
      loadContacts()
    } catch {
      setContactError('Failed to delete contact')
    }
  }

  async function handleSaveConfig(e) {
    e.preventDefault()
    setSavingConfig(true)
    setConfigError('')
    setConfigSaved(false)
    try {
      const saved = await whatsAppConfigApi.upsert(config)
      setConfig(saved)
      setConfigSaved(true)
      setTimeout(() => setConfigSaved(false), 3000)
    } catch {
      setConfigError('Failed to save configuration')
    } finally {
      setSavingConfig(false)
    }
  }

  return (
    <ErrorBoundary fallback="WhatsApp Contacts page error.">
      <div className="page-header mb-4">
        <div>
          <div className="page-title">{t('page_title_whatsapp')}</div>
          <div className="page-subtitle">
            Manage contacts and Twilio configuration for WhatsApp alert delivery
          </div>
        </div>
      </div>

      {/* Info banner */}
      <div className="card mb-4" style={{ borderLeft: '4px solid var(--accent)', background: 'var(--accent-bg, #eff6ff)' }}>
        <div style={{ padding: '14px 18px', fontSize: 13, color: 'var(--text-primary)' }}>
          <strong>How WhatsApp alerts work:</strong> EvoFlow uses the{' '}
          <strong>Twilio WhatsApp API</strong> to send alert messages.
          You need a Twilio account with a WhatsApp-enabled number.
          Configure your Twilio credentials in the <em>Settings</em> tab,
          then add the phone numbers to receive alerts in the <em>Contacts</em> tab.
          Phone numbers must include the country code (e.g. <code>+447911123456</code>).
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 16, borderBottom: '1px solid var(--border)' }}>
        {[['contacts', 'Contacts'], ['settings', 'Settings']].map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            style={{
              padding: '8px 18px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
              border: 'none', background: 'transparent',
              borderBottom: tab === key ? '2px solid var(--accent)' : '2px solid transparent',
              color: tab === key ? 'var(--accent)' : 'var(--text-secondary)',
              marginBottom: -1,
            }}
          >{label}</button>
        ))}
      </div>

      {/* CONTACTS TAB */}
      {tab === 'contacts' && (
        <>
          {editContact && (
            <div className="card mb-4">
              <div className="card-header">
                <span className="card-title">{editContact.id ? 'Edit Contact' : 'New Contact'}</span>
              </div>
              <form onSubmit={handleSaveContact} style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                  <div style={{ flex: 1, minWidth: 180, display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>Name</label>
                    <input
                      type="text"
                      className="filter-input"
                      value={editContact.name}
                      onChange={e => setEditContact(c => ({ ...c, name: e.target.value }))}
                      placeholder="e.g. John Smith"
                      required
                    />
                  </div>
                  <div style={{ flex: 1, minWidth: 180, display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>Phone Number</label>
                    <input
                      type="text"
                      className="filter-input"
                      value={editContact.phoneNumber}
                      onChange={e => setEditContact(c => ({ ...c, phoneNumber: e.target.value }))}
                      placeholder="+447911123456"
                      required
                    />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, paddingBottom: 2 }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={editContact.isActive}
                        onChange={e => setEditContact(c => ({ ...c, isActive: e.target.checked }))}
                      />
                      Active
                    </label>
                  </div>
                </div>
                {contactError && <div style={{ color: 'var(--danger)', fontSize: 12 }}>{contactError}</div>}
                <div style={{ display: 'flex', gap: 8 }}>
                  <button type="submit" className="btn btn-primary" disabled={savingContact}>
                    {savingContact ? 'Saving…' : 'Save'}
                  </button>
                  <button type="button" className="btn btn-secondary" onClick={() => setEditContact(null)}>Cancel</button>
                </div>
              </form>
            </div>
          )}

          <div className="card">
            <div className="card-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span className="card-title">WhatsApp Contacts ({contacts.length})</span>
              <button className="btn btn-primary btn-sm" onClick={handleNewContact}>+ Add Contact</button>
            </div>
            <div className="table-responsive">
              {loadingContacts ? (
                <div className="loading-state"><div className="spinner" />{t('loading_contacts')}</div>
              ) : contacts.length === 0 ? (
                <div className="empty-state">No contacts yet. Add one to get started.</div>
              ) : (
                <table className="evo-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Phone Number</th>
                      <th>Status</th>
                      <th style={{ width: 120 }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {contacts.map(c => (
                      <tr key={c.id}>
                        <td style={{ fontWeight: 600 }}>{c.name}</td>
                        <td style={{ fontFamily: 'monospace', fontSize: 13 }}>{c.phoneNumber}</td>
                        <td>
                          <span className={`badge ${c.isActive ? 'badge-green' : 'badge-gray'}`}>
                            {c.isActive ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                        <td style={{ textAlign: 'right', display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                          <button className="btn btn-secondary btn-sm" onClick={() => handleEditContact(c)}>Edit</button>
                          <button className="btn btn-outline btn-sm" style={{ color: 'var(--danger)' }} onClick={() => handleDeleteContact(c.id)}>Delete</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </>
      )}

      {/* SETTINGS TAB */}
      {tab === 'settings' && (
        <div className="card">
          <div className="card-header">
            <span className="card-title">{t('card_twilio_config')}</span>
          </div>
          <form onSubmit={handleSaveConfig} style={{ padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>Account SID</label>
                <input
                  type="text"
                  className="filter-input"
                  value={config.accountSid || ''}
                  onChange={e => setConfig(c => ({ ...c, accountSid: e.target.value }))}
                  placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>Auth Token</label>
                <input
                  type="password"
                  className="filter-input"
                  value={config.authToken || ''}
                  onChange={e => setConfig(c => ({ ...c, authToken: e.target.value }))}
                  placeholder="Your Twilio auth token"
                />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>
                  From Number <span style={{ fontWeight: 400, color: 'var(--text-secondary)' }}>(Twilio WhatsApp number)</span>
                </label>
                <input
                  type="text"
                  className="filter-input"
                  value={config.fromNumber || ''}
                  onChange={e => setConfig(c => ({ ...c, fromNumber: e.target.value }))}
                  placeholder="whatsapp:+14155552671"
                />
              </div>
              <div style={{ display: 'flex', alignItems: 'flex-end', paddingBottom: 4 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer', fontWeight: 600 }}>
                  <input
                    type="checkbox"
                    checked={config.isEnabled || false}
                    onChange={e => setConfig(c => ({ ...c, isEnabled: e.target.checked }))}
                  />
                  Enable WhatsApp alerts
                </label>
              </div>
            </div>

            <div style={{ fontSize: 12, color: 'var(--text-secondary)', background: 'var(--surface-2, #f8fafc)', padding: '10px 14px', borderRadius: 6 }}>
              <strong>Setup guide:</strong> Log in to{' '}
              <strong>console.twilio.com</strong>, find your Account SID and Auth Token on the dashboard.
              For the From Number, enable WhatsApp in the Twilio Messaging section and use the
              format <code>whatsapp:+{'{your_twilio_number}'}</code>. For testing, use the Twilio Sandbox number.
            </div>

            {configError && <div style={{ color: 'var(--danger)', fontSize: 12 }}>{configError}</div>}
            {configSaved && <div style={{ color: 'var(--success, #059669)', fontSize: 12 }}>Configuration saved successfully.</div>}

            <div>
              <button type="submit" className="btn btn-primary" disabled={savingConfig || loadingConfig}>
                {savingConfig ? 'Saving…' : 'Save Configuration'}
              </button>
            </div>
          </form>
        </div>
      )}
    </ErrorBoundary>
  )
}
