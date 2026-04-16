import { useEffect, useState, useCallback } from 'react'
import { useLanguage } from '../i18n/LanguageContext'
import { emailLogApi } from '../api/client'
import ErrorBoundary from '../components/ErrorBoundary'

const PAGE_SIZE = 50

function defaultFilters() {
  const today = new Date()
  const sevenDaysAgo = new Date(today)
  sevenDaysAgo.setDate(today.getDate() - 7)
  return {
    status: '',
    subject: '',
    recipients: '',
    dateFrom: sevenDaysAgo.toISOString().slice(0, 10),
    dateTo: today.toISOString().slice(0, 10),
  }
}

const EMPTY_FILTERS = {
  status: '',
  subject: '',
  recipients: '',
  dateFrom: '',
  dateTo: '',
}

function SortIcon({ col, sortBy, sortDir }) {
  if (sortBy !== col) return <span style={{ marginLeft: 4, opacity: 0.3 }}>⇅</span>
  return <span style={{ marginLeft: 4 }}>{sortDir === 'asc' ? '↑' : '↓'}</span>
}

function SortTh({ col, label, sortBy, sortDir, onSort, style }) {
  return (
    <th
      onClick={() => onSort(col)}
      style={{ cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap', ...style }}
    >
      {label}<SortIcon col={col} sortBy={sortBy} sortDir={sortDir} />
    </th>
  )
}

function StatusBadge({ status }) {
  const ok = status === 'Sent'
  return (
    <span className={`badge ${ok ? 'badge-green' : 'badge-red'}`}>{status}</span>
  )
}

export default function EmailLog() {
  const { t } = useLanguage()
  const [filters, setFilters] = useState(defaultFilters)
  const [pending, setPending] = useState(defaultFilters)
  const [page, setPage] = useState(1)
  const [sortBy, setSortBy] = useState('sentAtUtc')
  const [sortDir, setSortDir] = useState('desc')
  const [data, setData] = useState({ total: 0, rows: [], stats: { total: 0, sent: 0, failed: 0 } })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback((f, pg, sb, sd) => {
    setLoading(true)
    const params = { page: pg, pageSize: PAGE_SIZE, sortBy: sb, sortDir: sd }
    if (f.status)     params.status = f.status
    if (f.subject)    params.subject = f.subject
    if (f.recipients) params.recipients = f.recipients
    if (f.dateFrom)   params.dateFrom = f.dateFrom
    if (f.dateTo)     params.dateTo = f.dateTo

    emailLogApi.getAll(params)
      .then(d => {
        if (d && Array.isArray(d.rows)) {
          setData(d)
          setError('')
        } else {
          setError('API server needs to be restarted to load the Email Log.')
        }
      })
      .catch(() => setError('Failed to load email log.'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load(filters, page, sortBy, sortDir) }, [filters, page, sortBy, sortDir, load])

  function handleSort(col) {
    const newDir = sortBy === col && sortDir === 'desc' ? 'asc' : 'desc'
    setSortBy(col)
    setSortDir(newDir)
    setPage(1)
  }

  function handleApply() {
    setFilters(pending)
    setPage(1)
  }

  function handleClear() {
    setPending(EMPTY_FILTERS)
    setFilters(EMPTY_FILTERS)
    setPage(1)
  }

  function set(key, val) { setPending(f => ({ ...f, [key]: val })) }

  const totalPages = Math.max(1, Math.ceil(data.total / PAGE_SIZE))
  const { stats } = data
  const successRate = stats.total > 0 ? Math.round((stats.sent / stats.total) * 100) : 100

  return (
    <ErrorBoundary fallback="Email Log page error.">
      <div className="page-header mb-4">
        <div>
          <div className="page-title">{t('page_title_email_log')}</div>
          <div className="page-subtitle">Audit trail of all emails sent by EvoFlow</div>
        </div>
      </div>

      {/* Summary stat cards */}
      <div className="stat-cards-row mb-5" style={{ gridTemplateColumns: 'repeat(4,1fr)' }}>
        <div className="stat-card">
          <div className="stat-card-label">{t('stat_total_sent_email')}</div>
          <div className="stat-card-value">{stats.total.toLocaleString()}</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-label">{t('stat_successful')}</div>
          <div className="stat-card-value" style={{ color: 'var(--success, #059669)' }}>{stats.sent.toLocaleString()}</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-label">{t('stat_failed_email')}</div>
          <div className="stat-card-value" style={{ color: stats.failed > 0 ? 'var(--danger, #dc2626)' : undefined }}>
            {stats.failed.toLocaleString()}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-card-label">{t('stat_success_rate')}</div>
          <div className="stat-card-value" style={{ color: successRate < 90 ? 'var(--danger, #dc2626)' : 'var(--success, #059669)' }}>
            {successRate}%
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="card mb-4">
        <div className="card-header"><span className="card-title">Filters</span></div>
        <div className="filters-bar" style={{ flexWrap: 'wrap', gap: 8, padding: '12px 16px', alignItems: 'center' }}>
          <label style={{ fontSize: 12, color: 'var(--text-secondary)' }}>From</label>
          <input type="date" className="filter-search" style={{ minWidth: 130 }}
            value={pending.dateFrom} onChange={e => set('dateFrom', e.target.value)} />
          <label style={{ fontSize: 12, color: 'var(--text-secondary)' }}>To</label>
          <input type="date" className="filter-search" style={{ minWidth: 130 }}
            value={pending.dateTo} onChange={e => set('dateTo', e.target.value)} />
          <select className="filter-select" value={pending.status} onChange={e => set('status', e.target.value)}>
            <option value="">{t('all_statuses_filter')}</option>
            <option value="Sent">Sent</option>
            <option value="Failed">Failed</option>
          </select>
          <input type="text" className="filter-search" placeholder="Search subject…" style={{ minWidth: 160 }}
            value={pending.subject} onChange={e => set('subject', e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleApply()} />
          <input type="text" className="filter-search" placeholder="Search recipients…" style={{ minWidth: 180 }}
            value={pending.recipients} onChange={e => set('recipients', e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleApply()} />
          <button className="btn btn-primary btn-sm" onClick={handleApply}>Apply</button>
          <button className="btn btn-outline btn-sm" onClick={handleClear}>Clear</button>
        </div>
      </div>

      {error && <div style={{ color: 'var(--danger)', marginBottom: 12, fontSize: 13 }}>{error}</div>}

      {/* Grid */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">
            {loading ? 'Loading…' : `${data.total.toLocaleString()} record${data.total !== 1 ? 's' : ''} · page ${page} of ${totalPages}`}
          </span>
        </div>
        <div className="table-responsive">
          <table className="evo-table">
            <thead>
              <tr>
                <SortTh col="sentAtUtc"   label="Sent (UTC)"   sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
                <SortTh col="subject"     label="Subject"      sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
                <SortTh col="recipients"  label="Recipients"   sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
                <SortTh col="status"      label="Status"       sortBy={sortBy} sortDir={sortDir} onSort={handleSort} style={{ width: 90 }} />
                <th>Error</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={5}><div className="loading-state"><div className="spinner" />Loading...</div></td></tr>
              ) : data.rows.length === 0 ? (
                <tr><td colSpan={5}><div className="empty-state">No records match the selected filters.</div></td></tr>
              ) : data.rows.map(row => (
                <tr key={row.id}>
                  <td style={{ whiteSpace: 'nowrap', fontFamily: 'monospace', fontSize: 12, color: 'var(--text-secondary)' }}>
                    {new Date(row.sentAtUtc).toLocaleString()}
                  </td>
                  <td style={{ fontWeight: 500 }}>{row.subject}</td>
                  <td style={{ fontSize: 12, color: 'var(--text-secondary)', maxWidth: 300 }}>{row.recipients}</td>
                  <td><StatusBadge status={row.status} /></td>
                  <td style={{ fontSize: 12, color: 'var(--danger, #dc2626)', maxWidth: 300, wordBreak: 'break-word' }}>
                    {row.errorMessage || ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="pagination">
            <span className="pagination-info">
              {data.total.toLocaleString()} total · showing {Math.min((page - 1) * PAGE_SIZE + 1, data.total)}–{Math.min(page * PAGE_SIZE, data.total)}
            </span>
            <button className="page-btn" disabled={page <= 1} onClick={() => setPage(1)}>«</button>
            <button className="page-btn" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>‹</button>
            <button className="page-btn active">{page}</button>
            <button className="page-btn" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>›</button>
            <button className="page-btn" disabled={page >= totalPages} onClick={() => setPage(totalPages)}>»</button>
          </div>
        )}
      </div>
    </ErrorBoundary>
  )
}
