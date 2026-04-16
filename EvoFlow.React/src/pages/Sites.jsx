import { useEffect, useState } from 'react'
import { useOutletContext, useNavigate } from 'react-router-dom'
import { sitesApi } from '../api/client'
import ErrorBoundary from '../components/ErrorBoundary'
import { useLanguage } from '../i18n/LanguageContext'

export default function Sites() {
  const [sites, setSites] = useState([])
  const [loading, setLoading] = useState(true)
  const [localFilter, setLocalFilter] = useState('')
  const { globalSearch = '' } = useOutletContext() || {}
  const navigate = useNavigate()
  const { t } = useLanguage()

  useEffect(() => {
    sitesApi.getAll()
      .then(s => setSites(s || []))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  const filtered = sites.filter(s => {
    const global = globalSearch.toLowerCase()
    const local = localFilter.toLowerCase()
    const matchesGlobal = !global ||
      (s.siteId || '').toLowerCase().includes(global) ||
      (s.siteName || '').toLowerCase().includes(global) ||
      (s.city || '').toLowerCase().includes(global) ||
      (s.postCode || '').toLowerCase().includes(global)
    const matchesLocal = !local ||
      (s.siteId || '').toLowerCase().includes(local) ||
      (s.siteName || '').toLowerCase().includes(local) ||
      (s.address1 || '').toLowerCase().includes(local) ||
      (s.address2 || '').toLowerCase().includes(local) ||
      (s.city || '').toLowerCase().includes(local) ||
      (s.county || '').toLowerCase().includes(local) ||
      (s.postCode || '').toLowerCase().includes(local)
    return matchesGlobal && matchesLocal
  })

  return (
    <ErrorBoundary fallback="Sites page error.">
      <div className="page-header mb-4">
        <div>
          <div className="page-title">{t('page_title_sites')}</div>
          <div className="page-subtitle">{sites.length} registered locations</div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <span className="card-title">Site Directory — {filtered.length} site{filtered.length !== 1 ? 's' : ''}</span>
        </div>
        <div className="filters-bar">
          <svg width="14" height="14" viewBox="0 0 20 20" fill="none" style={{ color: 'var(--text-muted)', flexShrink: 0 }}>
            <path d="M9 17A8 8 0 1 0 9 1a8 8 0 0 0 0 16zM19 19l-4.35-4.35" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          <input
            type="text"
            className="filter-search"
            placeholder="Filter by Site ID, name, or address..."
            value={localFilter}
            onChange={e => setLocalFilter(e.target.value)}
            style={{ flex: 1, maxWidth: 380 }}
          />
          {localFilter && (
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => setLocalFilter('')}
              style={{ padding: '3px 8px', fontSize: 11 }}
            >
              {t('btn_clear')}
            </button>
          )}
        </div>
        <div className="table-responsive">
          {loading ? (
            <div className="loading-state"><div className="spinner" />{t('loading_sites')}</div>
          ) : (
            <table className="evo-table">
              <thead>
                <tr>
                  <th>{t('col_site_id')}</th>
                  <th>{t('col_site_name')}</th>
                  <th>{t('col_address')}</th>
                  <th>{t('col_city')}</th>
                  <th>{t('col_county')}</th>
                  <th>{t('col_post_code')}</th>
                  <th>{t('col_pole_sign')}</th>
                  <th>{t('col_opening')}</th>
                  <th>{t('col_closing')}</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={10}><div className="empty-state">{t('no_sites_found')}</div></td></tr>
                ) : filtered.map(site => (
                  <tr key={site.siteId}>
                    <td>
                      <span
                        className="site-id-link"
                        style={{ cursor: 'pointer', color: 'var(--accent)', fontWeight: 700 }}
                        onClick={() => navigate(`/sites/${site.siteId}`)}
                      >{site.siteId}</span>
                    </td>
                    <td style={{ fontWeight: 600 }}>{site.siteName}</td>
                    <td style={{ color: 'var(--text-secondary)', fontSize: 12 }}>
                      {[site.address1, site.address2].filter(Boolean).join(', ') || '—'}
                    </td>
                    <td>{site.city || '—'}</td>
                    <td style={{ color: 'var(--text-secondary)' }}>{site.county || '—'}</td>
                    <td className="font-mono" style={{ fontSize: 12 }}>{site.postCode || '—'}</td>
                    <td style={{ color: 'var(--text-secondary)' }}>{site.poleSign || '—'}</td>
                    <td style={{ fontSize: 12 }}>{(site.openingHour || '—').substring(0, 5)}</td>
                    <td style={{ fontSize: 12 }}>{(site.closingHour || '—').substring(0, 5)}</td>
                    <td>
                      <button
                        onClick={() => navigate(`/site-map?siteId=${site.siteId}`)}
                        style={{
                          background: 'var(--accent)', color: '#fff', border: 'none',
                          padding: '3px 10px', borderRadius: 4, fontSize: 11,
                          cursor: 'pointer', fontWeight: 600, whiteSpace: 'nowrap'
                        }}
                      >
                        View on Map
                      </button>
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
