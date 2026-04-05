import { useEffect, useState } from 'react'
import { fuelRecordsApi, sitesApi, fuelTypesApi } from '../api/client'
import ErrorBoundary from '../components/ErrorBoundary'

export default function FuelRecords() {
  const [records, setRecords] = useState([])
  const [sites, setSites] = useState([])
  const [fuelTypes, setFuelTypes] = useState([])
  const [loading, setLoading] = useState(false)

  const today = new Date().toISOString().slice(0, 10)
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10)
  const [filters, setFilters] = useState({ siteId: '', from: weekAgo, to: today, page: 1, pageSize: 100 })

  useEffect(() => {
    Promise.allSettled([sitesApi.getAll(), fuelTypesApi.getAll()])
      .then(([sRes, ftRes]) => {
        if (sRes.status === 'fulfilled') setSites(sRes.value || [])
        if (ftRes.status === 'fulfilled') setFuelTypes(ftRes.value || [])
      })
  }, [])

  useEffect(() => { loadRecords() }, [filters.page])

  function loadRecords() {
    setLoading(true)
    const params = { page: filters.page, pageSize: filters.pageSize }
    if (filters.siteId) params.siteId = filters.siteId
    if (filters.from) params.from = filters.from
    if (filters.to) params.to = filters.to
    fuelRecordsApi.getAll(params)
      .then(r => setRecords(r || []))
      .catch(console.error)
      .finally(() => setLoading(false))
  }

  function handleSearch() { setFilters(f => ({ ...f, page: 1 })); loadRecords() }

  const fuelTypeMap = Object.fromEntries(fuelTypes.map(ft => [ft.fuelTypeId, ft.name]))
  const totalVolume = records.reduce((s, r) => s + (Number(r.volumeL) || 0), 0)
  const totalAmount = records.reduce((s, r) => s + (Number(r.amountGBP) || 0), 0)

  return (
    <ErrorBoundary fallback="Fuel Records page error.">
      <div className="page-header mb-4">
        <div>
          <div className="page-title">Fuel Records</div>
          <div className="page-subtitle">Transaction history</div>
        </div>
      </div>

      <div className="stat-cards-row mb-5" style={{ gridTemplateColumns: 'repeat(3,1fr)' }}>
        <div className="stat-card">
          <div className="stat-card-label">Records Shown</div>
          <div className="stat-card-value">{records.length}</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-label">Total Volume</div>
          <div className="stat-card-value">{totalVolume.toLocaleString(undefined, { maximumFractionDigits: 0 })} L</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-label">Total Amount</div>
          <div className="stat-card-value">£{totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <span className="card-title">Fuel Transactions</span>
        </div>
        <div className="filters-bar">
          <select className="filter-select" value={filters.siteId}
            onChange={e => setFilters(f => ({ ...f, siteId: e.target.value }))}>
            <option value="">All Sites</option>
            {sites.map(s => <option key={s.siteId} value={s.siteId}>{s.siteName}</option>)}
          </select>
          <label style={{ fontSize: 12, color: 'var(--text-secondary)' }}>From</label>
          <input type="date" className="filter-search" style={{ minWidth: 130 }} value={filters.from}
            onChange={e => setFilters(f => ({ ...f, from: e.target.value }))} />
          <label style={{ fontSize: 12, color: 'var(--text-secondary)' }}>To</label>
          <input type="date" className="filter-search" style={{ minWidth: 130 }} value={filters.to}
            onChange={e => setFilters(f => ({ ...f, to: e.target.value }))} />
          <button className="btn btn-primary btn-sm" onClick={handleSearch}>Search</button>
          <button className="btn btn-outline btn-sm"
            onClick={() => setFilters(f => ({ ...f, siteId: '', from: weekAgo, to: today, page: 1 }))}>
            Clear
          </button>
        </div>

        <div className="table-responsive">
          {loading ? (
            <div className="loading-state"><div className="spinner" />Loading records...</div>
          ) : (
            <table className="evo-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Date</th>
                  <th>Time (UTC)</th>
                  <th>Site</th>
                  <th>Fuel Type</th>
                  <th>Volume (L)</th>
                  <th>Amount (£)</th>
                  <th>Vehicle</th>
                  <th>Odometer (km)</th>
                </tr>
              </thead>
              <tbody>
                {records.length === 0 ? (
                  <tr><td colSpan={9}><div className="empty-state">No records found for selected filters</div></td></tr>
                ) : records.map(r => (
                  <tr key={r.fuelRecordId}>
                    <td className="font-mono" style={{ fontSize: 11, color: 'var(--text-muted)' }}>{r.fuelRecordId}</td>
                    <td>{r.businessDate}</td>
                    <td style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                      {r.transactionUtc ? new Date(r.transactionUtc).toLocaleTimeString() : '—'}
                    </td>
                    <td><span className="badge badge-blue">{r.siteId}</span></td>
                    <td><span className="badge badge-gray">{fuelTypeMap[r.fuelTypeId] || r.fuelTypeId}</span></td>
                    <td style={{ fontWeight: 600, color: 'var(--green)' }}>
                      {(Number(r.volumeL) || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td style={{ fontWeight: 600 }}>
                      £{(Number(r.amountGBP) || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td style={{ color: 'var(--text-secondary)' }}>{r.vehicleId || '—'}</td>
                    <td style={{ color: 'var(--text-secondary)' }}>{r.odometerKm ? r.odometerKm.toLocaleString() : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="pagination">
          <span className="pagination-info">Page {filters.page}</span>
          <button className="page-btn" disabled={filters.page <= 1}
            onClick={() => setFilters(f => ({ ...f, page: f.page - 1 }))}>‹</button>
          <button className="page-btn active">{filters.page}</button>
          <button className="page-btn" disabled={records.length < filters.pageSize}
            onClick={() => setFilters(f => ({ ...f, page: f.page + 1 }))}>›</button>
        </div>
      </div>
    </ErrorBoundary>
  )
}
