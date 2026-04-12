import { useEffect, useState } from 'react'
import { emailLogApi } from '../api/client'
import ErrorBoundary from '../components/ErrorBoundary'

const PAGE_SIZE = 50

function StatusBadge({ status }) {
  const ok = status === 'Sent'
  return (
    <span style={{
      display: 'inline-block',
      padding: '2px 8px',
      borderRadius: 4,
      fontSize: 11,
      fontWeight: 600,
      background: ok ? 'var(--success-bg, #d1fae5)' : 'var(--danger-bg, #fee2e2)',
      color: ok ? 'var(--success, #059669)' : 'var(--danger, #dc2626)',
    }}>
      {status}
    </span>
  )
}

export default function EmailLog() {
  const [data, setData] = useState({ total: 0, rows: [] })
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  function load(p) {
    setLoading(true)
    emailLogApi.getAll({ page: p, pageSize: PAGE_SIZE })
      .then(d => {
        if (d && Array.isArray(d.rows)) {
          setData(d)
        } else {
          setError('Failed to load email log — please restart the API server to activate the new endpoint.')
        }
      })
      .catch(() => setError('Failed to load email log'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load(page) }, [page])

  const totalPages = Math.max(1, Math.ceil(data.total / PAGE_SIZE))

  return (
    <ErrorBoundary fallback="Email Log page error.">
      <div className="page-header mb-4">
        <div>
          <div className="page-title">Email Log</div>
          <div className="page-subtitle">History of all emails sent by EvoFlow ({data.total} total)</div>
        </div>
      </div>

      {error && <div style={{ color: 'var(--danger)', marginBottom: 12 }}>{error}</div>}

      {loading ? (
        <div className="loading-state"><div className="spinner" />Loading...</div>
      ) : (
        <div className="card">
          <div className="table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Sent (UTC)</th>
                  <th>Subject</th>
                  <th>Recipients</th>
                  <th>Status</th>
                  <th>Error</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.length === 0 ? (
                  <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: 24 }}>No emails sent yet.</td></tr>
                ) : data.rows.map(row => (
                  <tr key={row.id}>
                    <td style={{ whiteSpace: 'nowrap', fontFamily: 'monospace', fontSize: 12 }}>
                      {new Date(row.sentAtUtc).toLocaleString()}
                    </td>
                    <td>{row.subject}</td>
                    <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{row.recipients}</td>
                    <td><StatusBadge status={row.status} /></td>
                    <td style={{ fontSize: 12, color: 'var(--danger)', maxWidth: 300, wordBreak: 'break-word' }}>
                      {row.errorMessage || ''}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div style={{ display: 'flex', gap: 8, padding: '12px 16px', alignItems: 'center', justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Prev</button>
              <span style={{ fontSize: 13 }}>Page {page} of {totalPages}</span>
              <button className="btn btn-secondary" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>Next</button>
            </div>
          )}
        </div>
      )}
    </ErrorBoundary>
  )
}
