import { useEffect, useState, useCallback } from 'react'
import { deliverectApi } from '../api/client'
import ErrorBoundary from '../components/ErrorBoundary'

function fmt(val) {
  if (!val) return '—'
  const d = new Date(val)
  return d.toLocaleString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

function fmtDate(val) {
  if (!val) return '—'
  return val.substring(0, 10)
}

export default function Deliverect() {
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(false)

  // Filters — default to today
  const [siteId, setSiteId] = useState('')
  const [from, setFrom] = useState(() => new Date().toISOString().substring(0, 10))
  const [to, setTo] = useState(() => new Date().toISOString().substring(0, 10))
  const [workStation, setWorkStation] = useState('')
  const [latePickedNotCollected, setLatePickedNotCollected] = useState(false)

  const load = useCallback(() => {
    setLoading(true)
    const params = {}
    if (siteId.trim()) params.siteId = siteId.trim()
    if (from) params.from = from
    if (to) params.to = to
    if (workStation) params.workStationId = workStation
    if (latePickedNotCollected) params.latePickedNotCollected = true

    deliverectApi.getAll(params)
      .then(data => setOrders(Array.isArray(data) ? data : []))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [siteId, from, to, workStation, latePickedNotCollected])

  useEffect(() => { load() }, [load])

  function clearFilters() {
    setSiteId('')
    setFrom('')
    setTo('')
    setWorkStation('')
    setLatePickedNotCollected(false)
  }

  const hasFilters = siteId || from || to || workStation || latePickedNotCollected

  return (
    <ErrorBoundary fallback="Deliverect page error.">
      <div className="page-header mb-4">
        <div>
          <div className="page-title">Deliverect Orders</div>
          <div className="page-subtitle">{orders.length.toLocaleString()} orders</div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-header">
          <span className="card-title">Filters</span>
          {hasFilters && (
            <button className="btn btn-ghost btn-sm" onClick={clearFilters} style={{ fontSize: 11 }}>
              Clear all
            </button>
          )}
        </div>
        <div className="filters-bar" style={{ flexWrap: 'wrap', gap: 12 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <label style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>Site ID</label>
            <input
              type="text"
              className="filter-search"
              placeholder="e.g. 3095"
              value={siteId}
              onChange={e => setSiteId(e.target.value)}
              style={{ width: 110 }}
            />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <label style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>Order Date From</label>
            <input
              type="date"
              className="filter-search"
              value={from}
              onChange={e => setFrom(e.target.value)}
              style={{ width: 145 }}
            />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <label style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>Order Date To</label>
            <input
              type="date"
              className="filter-search"
              value={to}
              onChange={e => setTo(e.target.value)}
              style={{ width: 145 }}
            />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <label style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>Workstation</label>
            <select
              className="filter-search"
              value={workStation}
              onChange={e => setWorkStation(e.target.value)}
              style={{ width: 110 }}
            >
              <option value="">All</option>
              {['WS-1', 'WS-2', 'WS-3', 'WS-4', 'WS-5'].map(ws => (
                <option key={ws} value={ws}>{ws}</option>
              ))}
            </select>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <label style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>Outstanding Orders</label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 12, paddingTop: 4 }}>
              <input
                type="checkbox"
                checked={latePickedNotCollected}
                onChange={e => setLatePickedNotCollected(e.target.checked)}
              />
              Picked &gt;2h ago, not collected
            </label>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <span className="card-title">Orders — {orders.length.toLocaleString()} result{orders.length !== 1 ? 's' : ''}</span>
        </div>
        <div className="table-responsive">
          {loading ? (
            <div className="loading-state"><div className="spinner" /> Loading orders…</div>
          ) : orders.length === 0 ? (
            <div className="empty-state">No orders match the selected filters.</div>
          ) : (
            <table className="evo-table">
              <thead>
                <tr>
                  <th>Order ID</th>
                  <th>Site ID</th>
                  <th>Order Date</th>
                  <th>Received At Site</th>
                  <th>Picked</th>
                  <th>Ready for Collection</th>
                  <th>Collected</th>
                  <th>Transaction</th>
                  <th>Workstation</th>
                  <th>Txn Number</th>
                </tr>
              </thead>
              <tbody>
                {orders.map(o => {
                  const isLate = o.orderPickedDateTime && !o.orderCollectedDateTime &&
                    new Date(o.orderPickedDateTime) < new Date(Date.now() - 2 * 60 * 60 * 1000)
                  return (
                    <tr key={o.orderId} style={isLate ? { background: 'rgba(239,68,68,0.07)' } : undefined}>
                      <td className="font-mono" style={{ fontSize: 11 }}>{o.orderId}</td>
                      <td style={{ fontWeight: 700, color: 'var(--accent)' }}>{o.siteId}</td>
                      <td style={{ fontSize: 12 }}>{fmtDate(o.orderDate)}</td>
                      <td style={{ fontSize: 11 }}>{fmt(o.orderReceivedAtSiteDateTime)}</td>
                      <td style={{ fontSize: 11 }}>{fmt(o.orderPickedDateTime)}</td>
                      <td style={{ fontSize: 11 }}>{fmt(o.orderReadyForCollectionDateTime)}</td>
                      <td style={{ fontSize: 11 }}>
                        {o.orderCollectedDateTime ? (
                          fmt(o.orderCollectedDateTime)
                        ) : (
                          <span style={{ color: isLate ? 'var(--danger, #ef4444)' : 'var(--text-muted)', fontWeight: isLate ? 700 : 400 }}>
                            {isLate ? '⚠ Not collected' : '—'}
                          </span>
                        )}
                      </td>
                      <td style={{ fontSize: 11 }}>{fmt(o.transactionDateTime)}</td>
                      <td style={{ fontSize: 12 }}>{o.workStationId}</td>
                      <td className="font-mono" style={{ fontSize: 11 }}>{o.transactionNumber}</td>
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
