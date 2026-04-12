import { useEffect, useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { pumpDevicesApi } from '../api/client'
import ErrorBoundary from '../components/ErrorBoundary'

function SortIcon({ col, sortCol, sortDir }) {
  if (sortCol !== col) return <span style={{ color: 'var(--text-muted)', marginLeft: 3, fontSize: 10 }}>⇅</span>
  return <span style={{ marginLeft: 3, fontSize: 10 }}>{sortDir === 'asc' ? '↑' : '↓'}</span>
}

export default function Alerts() {
  const navigate = useNavigate()
  const [devices, setDevices] = useState([])
  const [loading, setLoading] = useState(true)
  const [siteSearch, setSiteSearch] = useState('')
  const [sortCol, setSortCol] = useState(null)
  const [sortDir, setSortDir] = useState('asc')

  useEffect(() => {
    pumpDevicesApi.getAll()
      .then(d => setDevices(d || []))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  function handleSort(col) {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortCol(col); setSortDir('asc') }
  }

  const offlineDevices = useMemo(() => {
    let result = devices.filter(d => !d.online)
    if (siteSearch.trim()) {
      const q = siteSearch.trim().toLowerCase()
      result = result.filter(d =>
        (d.siteId || '').toLowerCase().includes(q) ||
        (d.deviceId || '').toLowerCase().includes(q)
      )
    }
    if (sortCol) {
      result = [...result].sort((a, b) => {
        const av = a[sortCol] ?? '', bv = b[sortCol] ?? ''
        const cmp = typeof av === 'number' && typeof bv === 'number'
          ? av - bv : String(av).localeCompare(String(bv), undefined, { numeric: true })
        return sortDir === 'asc' ? cmp : -cmp
      })
    }
    return result
  }, [devices, siteSearch, sortCol, sortDir])

  return (
    <ErrorBoundary fallback="Alerts page error.">
      <div className="page-header">
        <div>
          <div className="page-title">Alerts</div>
          <div className="page-subtitle">Active issues requiring attention</div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <span className="card-title">Offline Pumps — {offlineDevices.length} alert{offlineDevices.length !== 1 ? 's' : ''}</span>
        </div>

        <div className="filters-bar">
          <input
            type="text"
            className="filter-search"
            placeholder="Filter site ID / device…"
            value={siteSearch}
            onChange={e => setSiteSearch(e.target.value)}
            style={{ minWidth: 200 }}
          />
          {siteSearch && (
            <button className="btn btn-outline btn-sm" onClick={() => setSiteSearch('')}>Clear</button>
          )}
        </div>

        <div className="table-responsive">
          {loading ? (
            <div className="loading-state"><div className="spinner" /> Loading...</div>
          ) : offlineDevices.length === 0 && !siteSearch ? (
            <div className="empty-state" style={{ color: 'var(--green)' }}>✓ No alerts — all pumps online</div>
          ) : offlineDevices.length === 0 ? (
            <div className="empty-state">No results for "{siteSearch}"</div>
          ) : (
            <table className="evo-table">
              <thead>
                <tr>
                  {[['pumpDeviceId','Pump ID'],['deviceId','Device ID'],['siteId','Site ID'],['protocol','Protocol'],['offlineCount','Offline Count'],['lastSeenUtc','Last Seen'],['online','Status']].map(([col, label]) => (
                    <th key={col} onClick={() => handleSort(col)} style={{ cursor: 'pointer', userSelect: 'none' }}>
                      {label}<SortIcon col={col} sortCol={sortCol} sortDir={sortDir} />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {offlineDevices.map(d => (
                  <tr key={d.pumpDeviceId}>
                    <td className="font-mono" style={{ fontSize: 12 }}>{d.pumpDeviceId}</td>
                    <td style={{ fontWeight: 600 }}>{d.deviceId}</td>
                    <td>
                      <span
                        className="badge badge-blue"
                        style={{ cursor: 'pointer' }}
                        onClick={() => navigate(`/sites/${d.siteId}`)}
                      >{d.siteId}</span>
                    </td>
                    <td style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{d.protocol || '—'}</td>
                    <td>
                      <span className={`badge ${d.offlineCount > 5 ? 'badge-red' : 'badge-orange'}`}>
                        {d.offlineCount}x
                      </span>
                    </td>
                    <td style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                      {d.lastSeenUtc ? new Date(d.lastSeenUtc).toLocaleString() : '—'}
                    </td>
                    <td><span className="badge badge-red">Offline</span></td>
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
