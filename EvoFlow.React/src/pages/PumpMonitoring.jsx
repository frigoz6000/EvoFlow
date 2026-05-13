import { useEffect, useState } from 'react'
import { pumpDevicesApi, pumpStatusApi, pumpTotalsApi, sitesApi } from '../api/client'
import { useOutletContext, useNavigate } from 'react-router-dom'
import ErrorBoundary from '../components/ErrorBoundary'
import { useLanguage } from '../i18n/LanguageContext'

const PAGE_SIZE = 100

export default function PumpMonitoring() {
  const navigate = useNavigate()
  const { t } = useLanguage()
  const [devices, setDevices] = useState([])
  const [statuses, setStatuses] = useState([])
  const [totals, setTotals] = useState([])
  const [sites, setSites] = useState([])
  const [loading, setLoading] = useState(true)
  const [filterSite, setFilterSite] = useState('')
  const [filterStatus, setFilterStatus] = useState('all')
  const [page, setPage] = useState(1)
  const { globalSearch = '' } = useOutletContext() || {}

  useEffect(() => {
    Promise.allSettled([
      pumpDevicesApi.getAll(),
      pumpStatusApi.getAll({ latestOnly: true }),
      pumpTotalsApi.getAll({ latestOnly: true }),
      sitesApi.getAll(),
    ]).then(([dRes, sRes, tRes, siRes]) => {
      if (dRes.status === 'fulfilled') setDevices(dRes.value || [])
      if (sRes.status === 'fulfilled') setStatuses(sRes.value || [])
      if (tRes.status === 'fulfilled') setTotals(tRes.value || [])
      if (siRes.status === 'fulfilled') setSites(siRes.value || [])
    }).finally(() => setLoading(false))
  }, [])

  // Reset to page 1 whenever filters change
  useEffect(() => { setPage(1) }, [filterSite, filterStatus, globalSearch])

  const siteMap = Object.fromEntries(sites.map(s => [s.siteId, s.siteName]))

  // Latest status per device (one record per device already from latestOnly=true)
  const latestStatus = Object.fromEntries(statuses.map(s => [s.pumpDeviceId, s]))

  // Volume per device (latest cumulative total, one record per device)
  const volumeByDevice = Object.fromEntries(totals.map(t => [t.pumpDeviceId, Number(t.volumeTotal) || 0]))

  const filtered = devices.filter(d => {
    const q = globalSearch.toLowerCase()
    if (q && !(d.deviceId || '').toLowerCase().includes(q) && !(d.siteId || '').toLowerCase().includes(q)) return false
    if (filterSite && d.siteId !== filterSite) return false
    if (filterStatus === 'online' && !d.online) return false
    if (filterStatus === 'offline' && d.online) return false
    return true
  })

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  const onlineCount = devices.filter(d => d.online).length

  return (
    <ErrorBoundary fallback="Pump Monitoring page error.">
      <div className="page-header mb-4">
        <div>
          <div className="page-title">{t('page_title_pump_monitoring')}</div>
          <div className="page-subtitle">{onlineCount} of {devices.length} pumps online</div>
        </div>
      </div>

      <div className="stat-cards-row mb-5" style={{ gridTemplateColumns: 'repeat(4,1fr)' }}>
        <div className="stat-card">
          <div className="stat-card-label">{t('stat_total_pumps')}</div>
          <div className="stat-card-value">{devices.length}</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-label">{t('stat_online')}</div>
          <div className="stat-card-value" style={{ color: 'var(--green)' }}>{onlineCount}</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-label">{t('stat_offline')}</div>
          <div className="stat-card-value" style={{ color: 'var(--red)' }}>{devices.length - onlineCount}</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-label">{t('stat_uptime')}</div>
          <div className="stat-card-value">
            {devices.length > 0 ? `${Math.round((onlineCount / devices.length) * 100)}%` : '—'}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <span className="card-title">Pump Devices — {filtered.length} shown</span>
          <div style={{ flex: 1 }} />
          <div style={{ display: 'flex', gap: 4 }}>
            {['all', 'online', 'offline'].map(v => (
              <button key={v} className={`btn-tag ${filterStatus === v ? 'active' : ''}`}
                onClick={() => setFilterStatus(v)}>
                {v.charAt(0).toUpperCase() + v.slice(1)}
              </button>
            ))}
          </div>
        </div>

        <div className="filters-bar">
          <select className="filter-select" value={filterSite}
            onChange={e => setFilterSite(e.target.value)}>
            <option value="">{t('all_sites')}</option>
            {sites.map(s => <option key={s.siteId} value={s.siteId}>{s.siteName}</option>)}
          </select>
        </div>

        <div className="table-responsive">
          {loading ? (
            <div className="loading-state"><div className="spinner" />{t('loading_pumps')}</div>
          ) : (
            <table className="evo-table">
              <thead>
                <tr>
                  <th>{t('col_pump_id')}</th>
                  <th>{t('col_device_id')}</th>
                  <th>{t('label_site')}</th>
                  <th>{t('col_protocol')}</th>
                  <th>{t('col_status')}</th>
                  <th>{t('col_offline_count')}</th>
                  <th>{t('col_last_seen')}</th>
                  <th>{t('col_last_state')}</th>
                  <th>{t('col_volume')}</th>
                </tr>
              </thead>
              <tbody>
                {paginated.length === 0 ? (
                  <tr><td colSpan={9}><div className="empty-state">No devices match filters</div></td></tr>
                ) : paginated.map(d => {
                  const status = latestStatus[d.pumpDeviceId]
                  const vol = volumeByDevice[d.pumpDeviceId] || 0
                  return (
                    <tr key={d.pumpDeviceId}>
                      <td className="font-mono" style={{ fontSize: 11, color: 'var(--text-muted)' }}>{d.pumpDeviceId}</td>
                      <td style={{ fontWeight: 700 }}><span className="site-id-link">{d.deviceId}</span></td>
                      <td style={{ color: 'var(--text-secondary)', cursor: 'pointer' }} onClick={() => navigate(`/sites/${d.siteId}`)} title={`View site ${d.siteId}`}>{siteMap[d.siteId] || d.siteId}</td>
                      <td style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{d.protocol || '—'}</td>
                      <td>
                        <span className={`badge ${d.online ? 'badge-green' : 'badge-red'}`}>
                          {d.online ? t('stat_online') : t('stat_offline')}
                        </span>
                      </td>
                      <td>
                        {d.offlineCount > 0
                          ? <span className="badge badge-orange">{d.offlineCount}x</span>
                          : <span style={{ color: 'var(--text-muted)' }}>0</span>}
                      </td>
                      <td style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                        {d.lastSeenUtc ? new Date(d.lastSeenUtc).toLocaleString() : '—'}
                      </td>
                      <td>
                        {status
                          ? <span className="badge badge-gray">{status.state}</span>
                          : '—'}
                      </td>
                      <td style={{ fontWeight: 600, color: vol > 0 ? 'var(--accent)' : 'var(--text-muted)' }}>
                        {vol > 0 ? vol.toLocaleString(undefined, { maximumFractionDigits: 0 }) : '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>

        {!loading && totalPages > 1 && (
          <div className="pagination-bar" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 16px', borderTop: '1px solid var(--border)' }}>
            <button className="btn-tag" disabled={page === 1} onClick={() => setPage(p => p - 1)}>← Prev</button>
            <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
              Page {page} of {totalPages} &nbsp;·&nbsp; {filtered.length} pumps
            </span>
            <button className="btn-tag" disabled={page === totalPages} onClick={() => setPage(p => p + 1)}>Next →</button>
          </div>
        )}
      </div>
    </ErrorBoundary>
  )
}
