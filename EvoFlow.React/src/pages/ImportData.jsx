import { useState } from 'react'
import { useLanguage } from '../i18n/LanguageContext'
import api from '../api/client'
import ErrorBoundary from '../components/ErrorBoundary'

const SpinnerIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ animation: 'spin 1s linear infinite' }}>
    <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
  </svg>
)

const DownloadIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
    <polyline points="7 10 12 15 17 10"/>
    <line x1="12" y1="15" x2="12" y2="3"/>
  </svg>
)

function ResultPanel({ result }) {
  return (
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
  )
}

function ErrorPanel({ error, title = 'Import failed' }) {
  return (
    <div style={{ background: 'rgba(220,38,38,0.08)', border: '1px solid #dc2626', borderRadius: 8, padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#dc2626', fontWeight: 700, fontSize: 15 }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
        {title}
      </div>
      <div style={{ fontSize: 13, color: '#dc2626', fontFamily: 'monospace' }}>{error}</div>
    </div>
  )
}

const ShieldIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
  </svg>
)

function AnonymizeResultPanel({ result }) {
  return (
    <div style={{ background: 'rgba(124,58,237,0.08)', border: '1px solid #7c3aed', borderRadius: 8, padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#7c3aed', fontWeight: 700, fontSize: 15 }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12"/>
        </svg>
        Anonymization complete
      </div>
      <div style={{ fontSize: 13, color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span>Sites updated: <strong>{result.sitesUpdated?.toLocaleString()}</strong></span>
        <span>Time taken: <strong>{result.elapsedSeconds}s</strong></span>
      </div>
    </div>
  )
}

export default function ImportData() {
  const { t } = useLanguage()
  const [fullStatus, setFullStatus] = useState('idle')   // idle | running | done | error
  const [fullResult, setFullResult] = useState(null)
  const [fullError, setFullError] = useState(null)

  const [appendStatus, setAppendStatus] = useState('idle')
  const [appendResult, setAppendResult] = useState(null)
  const [appendError, setAppendError] = useState(null)

  const [anonStatus, setAnonStatus] = useState('idle')
  const [anonResult, setAnonResult] = useState(null)
  const [anonError, setAnonError] = useState(null)

  const anyRunning = fullStatus === 'running' || appendStatus === 'running' || anonStatus === 'running'

  function handleImport(skipDelete) {
    if (skipDelete) {
      setAppendStatus('running')
      setAppendResult(null)
      setAppendError(null)
    } else {
      setFullStatus('running')
      setFullResult(null)
      setFullError(null)
    }

    const url = skipDelete ? '/import/doms-files?skipDelete=true' : '/import/doms-files'
    api.post(url, null, { timeout: 660000 })
      .then(r => {
        if (skipDelete) { setAppendResult(r.data); setAppendStatus('done') }
        else { setFullResult(r.data); setFullStatus('done') }
      })
      .catch(e => {
        const msg = e.response?.data?.error || e.message || 'Import failed'
        if (skipDelete) { setAppendError(msg); setAppendStatus('error') }
        else { setFullError(msg); setFullStatus('error') }
      })
  }

  function handleAnonymize() {
    setAnonStatus('running')
    setAnonResult(null)
    setAnonError(null)
    api.post('/import/anonymize-sites', null, { timeout: 60000 })
      .then(r => { setAnonResult(r.data); setAnonStatus('done') })
      .catch(e => {
        const msg = e.response?.data?.error || e.message || 'Anonymization failed'
        setAnonError(msg); setAnonStatus('error')
      })
  }

  return (
    <ErrorBoundary fallback="Import Data page error.">
      <div className="page-header mb-4">
        <div className="page-title">{t('page_title_import_data')}</div>
        <div className="page-subtitle">Import XML site reports into the EvoFlow database</div>
      </div>

      {/* Full import — deletes first */}
      <div className="card mb-4" style={{ maxWidth: 600 }}>
        <div className="card-header">
          <span className="card-title">{t('card_import_doms')}</span>
        </div>
        <div style={{ padding: '24px 20px', display: 'flex', flexDirection: 'column', gap: 20 }}>
          <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: 14, lineHeight: 1.6 }}>
            Clears <strong>all existing data</strong> first, then imports every XML file from{' '}
            <code style={{ background: 'var(--surface)', padding: '2px 6px', borderRadius: 4, fontSize: 12 }}>C:\Zips\domsfiles\</code>.
            The Doms Info snapshot is refreshed automatically when done.
          </p>
          <button
            onClick={() => handleImport(false)}
            disabled={anyRunning}
            style={{
              background: fullStatus === 'running' ? 'var(--surface)' : '#2563eb',
              border: '1px solid ' + (fullStatus === 'running' ? 'var(--border)' : '#2563eb'),
              borderRadius: 8, padding: '12px 28px',
              cursor: anyRunning ? 'not-allowed' : 'pointer',
              color: fullStatus === 'running' ? 'var(--text-muted)' : '#fff',
              fontSize: 15, fontWeight: 700,
              display: 'flex', alignItems: 'center', gap: 10, alignSelf: 'flex-start',
              opacity: anyRunning ? 0.7 : 1, transition: 'background 0.15s',
            }}
          >
            {fullStatus === 'running' ? <><SpinnerIcon /> Importing… this may take a few minutes</> : <><DownloadIcon /> Import Doms Files</>}
          </button>
          {fullStatus === 'done' && fullResult && <ResultPanel result={fullResult} />}
          {fullStatus === 'error' && <ErrorPanel error={fullError} />}
        </div>
      </div>

      {/* Append import — no delete */}
      <div className="card" style={{ maxWidth: 600 }}>
        <div className="card-header">
          <span className="card-title">{t('card_append_doms')}</span>
        </div>
        <div style={{ padding: '24px 20px', display: 'flex', flexDirection: 'column', gap: 20 }}>
          <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: 14, lineHeight: 1.6 }}>
            Imports all XML files from{' '}
            <code style={{ background: 'var(--surface)', padding: '2px 6px', borderRadius: 4, fontSize: 12 }}>C:\Zips\domsfiles\</code>{' '}
            <strong>without deleting existing data</strong>. Existing records are skipped; only new records are inserted.
            The Doms Info snapshot is refreshed automatically when done.
          </p>
          <button
            onClick={() => handleImport(true)}
            disabled={anyRunning}
            style={{
              background: appendStatus === 'running' ? 'var(--surface)' : '#16a34a',
              border: '1px solid ' + (appendStatus === 'running' ? 'var(--border)' : '#16a34a'),
              borderRadius: 8, padding: '12px 28px',
              cursor: anyRunning ? 'not-allowed' : 'pointer',
              color: appendStatus === 'running' ? 'var(--text-muted)' : '#fff',
              fontSize: 15, fontWeight: 700,
              display: 'flex', alignItems: 'center', gap: 10, alignSelf: 'flex-start',
              opacity: anyRunning ? 0.7 : 1, transition: 'background 0.15s',
            }}
          >
            {appendStatus === 'running' ? <><SpinnerIcon /> Importing… this may take a few minutes</> : <><DownloadIcon /> Append Doms Files</>}
          </button>
          {appendStatus === 'done' && appendResult && <ResultPanel result={appendResult} />}
          {appendStatus === 'error' && <ErrorPanel error={appendError} />}
        </div>
      </div>

      {/* Anonymize site names */}
      <div className="card mt-4" style={{ maxWidth: 600 }}>
        <div className="card-header">
          <span className="card-title">{t('card_anonymize')}</span>
        </div>
        <div style={{ padding: '24px 20px', display: 'flex', flexDirection: 'column', gap: 20 }}>
          <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: 14, lineHeight: 1.6 }}>
            Replaces all site names with anonymous identifiers (<code style={{ background: 'var(--surface)', padding: '2px 6px', borderRadius: 4, fontSize: 12 }}>Site 001</code>,{' '}
            <code style={{ background: 'var(--surface)', padding: '2px 6px', borderRadius: 4, fontSize: 12 }}>Site 002</code>, …) and assigns random UK addresses,
            pole signs and geography locations across 50 UK cities.
          </p>
          <button
            onClick={handleAnonymize}
            disabled={anyRunning}
            style={{
              background: anonStatus === 'running' ? 'var(--surface)' : '#7c3aed',
              border: '1px solid ' + (anonStatus === 'running' ? 'var(--border)' : '#7c3aed'),
              borderRadius: 8, padding: '12px 28px',
              cursor: anyRunning ? 'not-allowed' : 'pointer',
              color: anonStatus === 'running' ? 'var(--text-muted)' : '#fff',
              fontSize: 15, fontWeight: 700,
              display: 'flex', alignItems: 'center', gap: 10, alignSelf: 'flex-start',
              opacity: anyRunning ? 0.7 : 1, transition: 'background 0.15s',
            }}
          >
            {anonStatus === 'running' ? <><SpinnerIcon /> Anonymizing…</> : <><ShieldIcon /> Anonymize Site Names</>}
          </button>
          {anonStatus === 'done' && anonResult && <AnonymizeResultPanel result={anonResult} />}
          {anonStatus === 'error' && <ErrorPanel error={anonError} title="Anonymization failed" />}
        </div>
      </div>
    </ErrorBoundary>
  )
}
