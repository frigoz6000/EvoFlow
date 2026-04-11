import { useState } from 'react'
import api from '../api/client'
import ErrorBoundary from '../components/ErrorBoundary'

export default function ImportData() {
  const [status, setStatus] = useState('idle') // idle | running | done | error
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)

  function handleImport() {
    setStatus('running')
    setResult(null)
    setError(null)

    api.post('/import/doms-files', null, { timeout: 660000 })
      .then(r => {
        setResult(r.data)
        setStatus('done')
      })
      .catch(e => {
        setError(e.response?.data?.error || e.message || 'Import failed')
        setStatus('error')
      })
  }

  return (
    <ErrorBoundary fallback="Import Data page error.">
      <div className="page-header mb-4">
        <div className="page-title">Import Data</div>
        <div className="page-subtitle">Import XML site reports into the EvoFlow database</div>
      </div>

      <div className="card" style={{ maxWidth: 600 }}>
        <div className="card-header">
          <span className="card-title">DOMS Files Import</span>
        </div>

        <div style={{ padding: '24px 20px', display: 'flex', flexDirection: 'column', gap: 20 }}>
          <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: 14, lineHeight: 1.6 }}>
            Imports all XML files from <code style={{ background: 'var(--surface)', padding: '2px 6px', borderRadius: 4, fontSize: 12 }}>C:\Zips\domsfiles\</code> into the database.
            All existing data is cleared first, then each file is processed in turn.
            The Doms Info snapshot is refreshed automatically when the import finishes.
          </p>

          <button
            onClick={handleImport}
            disabled={status === 'running'}
            style={{
              background: status === 'running' ? 'var(--surface)' : '#2563eb',
              border: '1px solid ' + (status === 'running' ? 'var(--border)' : '#2563eb'),
              borderRadius: 8,
              padding: '12px 28px',
              cursor: status === 'running' ? 'not-allowed' : 'pointer',
              color: status === 'running' ? 'var(--text-muted)' : '#fff',
              fontSize: 15,
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              alignSelf: 'flex-start',
              opacity: status === 'running' ? 0.7 : 1,
              transition: 'background 0.15s',
            }}
          >
            {status === 'running' ? (
              <>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ animation: 'spin 1s linear infinite' }}>
                  <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
                </svg>
                Importing… this may take a few minutes
              </>
            ) : (
              <>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                  <polyline points="7 10 12 15 17 10"/>
                  <line x1="12" y1="15" x2="12" y2="3"/>
                </svg>
                Import Doms Files
              </>
            )}
          </button>

          {status === 'done' && result && (
            <div style={{ background: 'rgba(22,163,74,0.08)', border: '1px solid #16a34a', borderRadius: 8, padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#16a34a', fontWeight: 700, fontSize: 15 }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
                Import complete
              </div>
              <div style={{ fontSize: 13, color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span>Snapshot rows inserted: <strong>{result.snapshotRowsInserted?.toLocaleString()}</strong></span>
                <span>Time taken: <strong>{result.elapsedSeconds}s</strong></span>
              </div>
              {result.scriptOutput && (
                <pre style={{
                  margin: '4px 0 0',
                  background: 'var(--surface)',
                  border: '1px solid var(--border)',
                  borderRadius: 6,
                  padding: '10px 12px',
                  fontSize: 11,
                  color: 'var(--text-secondary)',
                  overflowX: 'auto',
                  maxHeight: 200,
                  overflowY: 'auto',
                  fontFamily: 'monospace',
                  whiteSpace: 'pre-wrap',
                }}>
                  {result.scriptOutput}
                </pre>
              )}
            </div>
          )}

          {status === 'error' && (
            <div style={{ background: 'rgba(220,38,38,0.08)', border: '1px solid #dc2626', borderRadius: 8, padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#dc2626', fontWeight: 700, fontSize: 15 }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
                Import failed
              </div>
              <div style={{ fontSize: 13, color: '#dc2626', fontFamily: 'monospace' }}>{error}</div>
            </div>
          )}
        </div>
      </div>
    </ErrorBoundary>
  )
}
