import { useEffect, useState } from 'react'
import { pumpDevicesApi } from '../api/client'
import ErrorBoundary from '../components/ErrorBoundary'

export default function Alerts() {
  const [devices, setDevices] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    pumpDevicesApi.getAll()
      .then(d => setDevices(d || []))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  const offlineDevices = devices.filter(d => !d.online)

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
        <div className="table-responsive">
          {loading ? (
            <div className="loading-state"><div className="spinner" /> Loading...</div>
          ) : offlineDevices.length === 0 ? (
            <div className="empty-state" style={{ color: 'var(--green)' }}>✓ No alerts — all pumps online</div>
          ) : (
            <table className="evo-table">
              <thead>
                <tr>
                  <th>Pump ID</th>
                  <th>Device ID</th>
                  <th>Site ID</th>
                  <th>Protocol</th>
                  <th>Offline Count</th>
                  <th>Last Seen</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {offlineDevices.map(d => (
                  <tr key={d.pumpDeviceId}>
                    <td className="font-mono" style={{ fontSize: 12 }}>{d.pumpDeviceId}</td>
                    <td style={{ fontWeight: 600 }}>{d.deviceId}</td>
                    <td><span className="badge badge-blue">{d.siteId}</span></td>
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
