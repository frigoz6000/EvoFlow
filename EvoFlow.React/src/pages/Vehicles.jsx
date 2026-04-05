import { useEffect, useState } from 'react'
import { vehiclesApi, fuelRecordsApi } from '../api/client'
import { useOutletContext } from 'react-router-dom'
import ErrorBoundary from '../components/ErrorBoundary'

export default function Vehicles() {
  const [vehicles, setVehicles] = useState([])
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)
  const [filterActive, setFilterActive] = useState('all')
  const { globalSearch = '' } = useOutletContext() || {}

  useEffect(() => {
    Promise.allSettled([
      vehiclesApi.getAll(),
      fuelRecordsApi.getAll({ pageSize: 500 }),
    ]).then(([vRes, rRes]) => {
      if (vRes.status === 'fulfilled') setVehicles(vRes.value || [])
      if (rRes.status === 'fulfilled') setRecords(rRes.value || [])
    }).finally(() => setLoading(false))
  }, [])

  const filtered = vehicles.filter(v => {
    const q = globalSearch.toLowerCase()
    const matchSearch = !q ||
      (v.registration || '').toLowerCase().includes(q) ||
      (v.fleetNumber || '').toLowerCase().includes(q) ||
      (v.description || '').toLowerCase().includes(q) ||
      (v.vehicleType || '').toLowerCase().includes(q)
    const matchActive =
      filterActive === 'all' ||
      (filterActive === 'active' && v.active) ||
      (filterActive === 'inactive' && !v.active)
    return matchSearch && matchActive
  })

  const recordsByVehicle = {}
  records.forEach(r => {
    if (r.vehicleId) {
      if (!recordsByVehicle[r.vehicleId]) recordsByVehicle[r.vehicleId] = { count: 0, volume: 0 }
      recordsByVehicle[r.vehicleId].count++
      recordsByVehicle[r.vehicleId].volume += Number(r.volumeL) || 0
    }
  })

  const activeCount = vehicles.filter(v => v.active).length

  return (
    <ErrorBoundary fallback="Vehicles page error.">
      <div className="page-header mb-4">
        <div>
          <div className="page-title">Vehicles</div>
          <div className="page-subtitle">{vehicles.length} registered — {activeCount} active</div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <span className="card-title">Vehicle Fleet — {filtered.length} vehicle{filtered.length !== 1 ? 's' : ''}</span>
          <div style={{ flex: 1 }} />
          <div style={{ display: 'flex', gap: 4 }}>
            {['all', 'active', 'inactive'].map(v => (
              <button key={v} className={`btn-tag ${filterActive === v ? 'active' : ''}`}
                onClick={() => setFilterActive(v)}>
                {v.charAt(0).toUpperCase() + v.slice(1)}
              </button>
            ))}
          </div>
        </div>

        <div className="table-responsive">
          {loading ? (
            <div className="loading-state"><div className="spinner" />Loading vehicles...</div>
          ) : (
            <table className="evo-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Registration</th>
                  <th>Fleet No.</th>
                  <th>Description</th>
                  <th>Type</th>
                  <th>Status</th>
                  <th>Transactions</th>
                  <th>Total Volume (L)</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={8}><div className="empty-state">No vehicles found</div></td></tr>
                ) : filtered.map(v => {
                  const stats = recordsByVehicle[v.vehicleId] || { count: 0, volume: 0 }
                  return (
                    <tr key={v.vehicleId}>
                      <td className="font-mono" style={{ fontSize: 11, color: 'var(--text-muted)' }}>{v.vehicleId}</td>
                      <td style={{ fontWeight: 700 }}>{v.registration}</td>
                      <td>{v.fleetNumber || '—'}</td>
                      <td style={{ color: 'var(--text-secondary)' }}>{v.description || '—'}</td>
                      <td>
                        {v.vehicleType
                          ? <span className="badge badge-gray">{v.vehicleType}</span>
                          : '—'}
                      </td>
                      <td>
                        <span className={`badge ${v.active ? 'badge-green' : 'badge-gray'}`}>
                          {v.active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td style={{ color: 'var(--text-secondary)' }}>{stats.count || '—'}</td>
                      <td style={{ fontWeight: 600, color: stats.volume > 0 ? 'var(--green)' : 'var(--text-muted)' }}>
                        {stats.volume > 0
                          ? stats.volume.toLocaleString(undefined, { maximumFractionDigits: 0 })
                          : '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </ErrorBoundary>
  )
}
