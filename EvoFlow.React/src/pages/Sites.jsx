import { useEffect, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { sitesApi } from '../api/client'
import ErrorBoundary from '../components/ErrorBoundary'

export default function Sites() {
  const [sites, setSites] = useState([])
  const [loading, setLoading] = useState(true)
  const { globalSearch = '' } = useOutletContext() || {}

  useEffect(() => {
    sitesApi.getAll()
      .then(s => setSites(s || []))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  const filtered = sites.filter(s => {
    const q = globalSearch.toLowerCase()
    return !q ||
      (s.siteId || '').toLowerCase().includes(q) ||
      (s.siteName || '').toLowerCase().includes(q) ||
      (s.city || '').toLowerCase().includes(q) ||
      (s.postCode || '').toLowerCase().includes(q)
  })

  return (
    <ErrorBoundary fallback="Sites page error.">
      <div className="page-header mb-4">
        <div>
          <div className="page-title">All Sites</div>
          <div className="page-subtitle">{sites.length} registered locations</div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <span className="card-title">Site Directory — {filtered.length} site{filtered.length !== 1 ? 's' : ''}</span>
        </div>
        <div className="table-responsive">
          {loading ? (
            <div className="loading-state"><div className="spinner" />Loading sites...</div>
          ) : (
            <table className="evo-table">
              <thead>
                <tr>
                  <th>Site ID</th>
                  <th>Name</th>
                  <th>Address</th>
                  <th>City</th>
                  <th>County</th>
                  <th>Post Code</th>
                  <th>Pole Sign</th>
                  <th>Opening</th>
                  <th>Closing</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={9}><div className="empty-state">No sites found</div></td></tr>
                ) : filtered.map(site => (
                  <tr key={site.siteId}>
                    <td><span className="site-id-link">{site.siteId}</span></td>
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
