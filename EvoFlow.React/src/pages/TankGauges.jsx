import { useEffect, useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { sitesApi } from '../api/client'
import api from '../api/client'
import ErrorBoundary from '../components/ErrorBoundary'

const tankGaugesApi = {
  getAll: (params = {}) => api.get('/tankgauges', { params }).then(r => r.data),
}

function TankGaugeVisual({ fillPct, uid }) {
  const pct = parseFloat(fillPct)
  if (isNaN(pct)) return null

  const color = pct > 55 ? '#22c55e' : pct >= 25 ? '#f59e0b' : '#ef4444'
  const fillRatio = Math.min(100, Math.max(0, pct)) / 100

  const w = 42, h = 52
  const capW = 12, capH = 7, bodyY = capH, bodyH = h - capH - 2
  const fillH = Math.round(bodyH * fillRatio)
  const fillY = bodyY + bodyH - fillH
  const clipId = `tg-clip-${uid}`
  const rx = 9

  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ display: 'block' }}>
      <defs>
        <clipPath id={clipId}>
          <rect x={2} y={bodyY} width={w - 4} height={bodyH} rx={rx} />
        </clipPath>
      </defs>
      {/* Neck/cap — white in light mode, dark in dark mode */}
      <rect x={(w - capW) / 2} y={1} width={capW} height={capH} rx={2} style={{ fill: 'var(--tank-cap-color)' }} stroke="#475569" strokeWidth={1} />
      {/* Tank body background — theme-aware empty space */}
      <rect x={2} y={bodyY} width={w - 4} height={bodyH} rx={rx} style={{ fill: 'var(--tank-body-bg)' }} stroke="#475569" strokeWidth={1.5} />
      {/* Fuel fill — clipped to body shape */}
      {fillH > 0 && (
        <rect x={2} y={fillY} width={w - 4} height={fillH} fill={color} opacity={0.88} clipPath={`url(#${clipId})`} />
      )}
      {/* Body border on top */}
      <rect x={2} y={bodyY} width={w - 4} height={bodyH} rx={rx} fill="none" stroke="#475569" strokeWidth={1.5} />
    </svg>
  )
}

const defaultDate = new Date().toISOString().slice(0, 10)

function SortIcon({ col, sort }) {
  if (sort.col !== col) return <span style={{ opacity: 0.3, marginLeft: 4, fontSize: 10 }}>↕</span>
  return <span style={{ marginLeft: 4, fontSize: 10 }}>{sort.dir === 'asc' ? '↑' : '↓'}</span>
}

export default function TankGauges() {
  const navigate = useNavigate()
  const [rows, setRows] = useState([])
  const [sites, setSites] = useState([])
  const [loading, setLoading] = useState(false)
  const [filters, setFilters] = useState({ siteId: '', dateFrom: defaultDate, dateTo: defaultDate })
  const [showLowOnly, setShowLowOnly] = useState(false)
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState({ col: null, dir: 'asc' })
  const [page, setPage] = useState(1)
  const PAGE_SIZE = 100

  useEffect(() => {
    sitesApi.getAll().then(s => setSites(s || [])).catch(console.error)
    loadData({ siteId: '', dateFrom: defaultDate, dateTo: defaultDate })
  }, [])

  function loadData(f) {
    setLoading(true)
    const params = {}
    if (f.siteId) params.siteId = f.siteId
    if (f.dateFrom) params.dateFrom = f.dateFrom
    if (f.dateTo) params.dateTo = f.dateTo
    tankGaugesApi.getAll(params)
      .then(r => { setRows(r || []); setPage(1) })
      .catch(console.error)
      .finally(() => setLoading(false))
  }

  function handleSearch() { loadData(filters) }
  function handleClear() {
    const reset = { siteId: '', dateFrom: defaultDate, dateTo: defaultDate }
    setFilters(reset)
    setShowLowOnly(false)
    setSearch('')
    setSort({ col: null, dir: 'asc' })
    loadData(reset)
  }

  function handleSort(col) {
    setSort(s => s.col === col ? { col, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { col, dir: 'asc' })
    setPage(1)
  }

  const thStyle = { cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }

  const onlineCount = rows.filter(r => r.online).length
  const offlineCount = rows.filter(r => !r.online).length
  const avgFillPct = rows.length
    ? (rows.reduce((s, r) => s + (r.capacity > 0 ? (r.gauged / r.capacity) * 100 : 0), 0) / rows.length).toFixed(1)
    : '—'

  const displayRows = useMemo(() => {
    // Augment rows with computed fillPct for sorting/filtering
    let result = rows.map(r => ({
      ...r,
      _fillPct: r.capacity > 0 ? (r.gauged / r.capacity) * 100 : null,
    }))

    if (showLowOnly) result = result.filter(r => r._fillPct !== null && r._fillPct < 25)

    if (search.trim()) {
      const q = search.trim().toLowerCase()
      result = result.filter(r =>
        (r.siteId || '').toLowerCase().includes(q) ||
        (r.siteName || '').toLowerCase().includes(q)
      )
    }

    if (sort.col) {
      result = [...result].sort((a, b) => {
        let av = a[sort.col], bv = b[sort.col]
        if (av === null || av === undefined) av = sort.dir === 'asc' ? Infinity : -Infinity
        if (bv === null || bv === undefined) bv = sort.dir === 'asc' ? Infinity : -Infinity
        if (typeof av === 'string') return sort.dir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av)
        return sort.dir === 'asc' ? av - bv : bv - av
      })
    }

    return result
  }, [rows, showLowOnly, search, sort])

  const totalPages = Math.max(1, Math.ceil(displayRows.length / PAGE_SIZE))
  const pageRows = displayRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  return (
    <ErrorBoundary fallback="Tank Gauges page error.">
      <div className="page-header mb-4">
        <div>
          <div className="page-title">Tank Gauges</div>
          <div className="page-subtitle">Tank inventory — gauged levels, ullage, temperature and product height</div>
        </div>
      </div>

      <div className="stat-cards-row mb-5" style={{ gridTemplateColumns: 'repeat(4,1fr)' }}>
        <div className="stat-card">
          <div className="stat-card-label">Total Tanks</div>
          <div className="stat-card-value">{rows.length.toLocaleString()}</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-label">Online</div>
          <div className="stat-card-value" style={{ color: 'var(--green)' }}>{onlineCount}</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-label">Offline</div>
          <div className="stat-card-value" style={{ color: offlineCount > 0 ? 'var(--red)' : 'var(--text-muted)' }}>{offlineCount}</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-label">Avg Fill %</div>
          <div className="stat-card-value" style={{ color: 'var(--accent)' }}>{avgFillPct}{avgFillPct !== '—' ? '%' : ''}</div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <span className="card-title">Tank Gauges — {displayRows.length.toLocaleString()} rows (page {page} of {totalPages})</span>
        </div>

        <div className="filters-bar">
          <select className="filter-select" value={filters.siteId}
            onChange={e => setFilters(f => ({ ...f, siteId: e.target.value }))}>
            <option value="">All Sites</option>
            {sites.map(s => <option key={s.siteId} value={s.siteId}>{s.siteName}</option>)}
          </select>
          <label style={{ fontSize: 12, color: 'var(--text-secondary)' }}>From</label>
          <input type="date" className="filter-search" style={{ minWidth: 130 }} value={filters.dateFrom}
            onChange={e => setFilters(f => ({ ...f, dateFrom: e.target.value }))} />
          <label style={{ fontSize: 12, color: 'var(--text-secondary)' }}>To</label>
          <input type="date" className="filter-search" style={{ minWidth: 130 }} value={filters.dateTo}
            onChange={e => setFilters(f => ({ ...f, dateTo: e.target.value }))} />
          <input
            type="text"
            className="filter-search"
            placeholder="Search site ID or name..."
            style={{ minWidth: 180 }}
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1) }}
          />
          <button className="btn btn-primary btn-sm" onClick={handleSearch}>Search</button>
          <button className="btn btn-outline btn-sm" onClick={handleClear}>Clear</button>
          <button
            className="btn btn-sm"
            style={{
              background: showLowOnly ? '#ef4444' : 'transparent',
              color: showLowOnly ? '#fff' : '#ef4444',
              border: '2px solid #ef4444',
              fontWeight: 700,
            }}
            onClick={() => { setShowLowOnly(v => !v); setPage(1) }}
          >
            Low Tank
          </button>
        </div>

        <div className="table-responsive">
          {loading ? (
            <div className="loading-state"><div className="spinner" />Loading Tank Gauges...</div>
          ) : (
            <table className="evo-table">
              <thead>
                <tr>
                  <th style={thStyle} onClick={() => handleSort('businessDate')}>Date<SortIcon col="businessDate" sort={sort} /></th>
                  <th style={thStyle} onClick={() => handleSort('siteId')}>Site ID<SortIcon col="siteId" sort={sort} /></th>
                  <th style={thStyle} onClick={() => handleSort('siteName')}>Site Name<SortIcon col="siteName" sort={sort} /></th>
                  <th style={thStyle} onClick={() => handleSort('deviceId')}>Device<SortIcon col="deviceId" sort={sort} /></th>
                  <th style={thStyle} onClick={() => handleSort('tankId')}>Tank<SortIcon col="tankId" sort={sort} /></th>
                  <th style={thStyle} onClick={() => handleSort('online')}>Status<SortIcon col="online" sort={sort} /></th>
                  <th style={thStyle} onClick={() => handleSort('offlineCount')}>Offline Count<SortIcon col="offlineCount" sort={sort} /></th>
                  <th style={thStyle} onClick={() => handleSort('protocol')}>Protocol<SortIcon col="protocol" sort={sort} /></th>
                  <th style={thStyle} onClick={() => handleSort('capacity')}>Capacity (L)<SortIcon col="capacity" sort={sort} /></th>
                  <th style={thStyle} onClick={() => handleSort('tankHeight')}>Tank Height (mm)<SortIcon col="tankHeight" sort={sort} /></th>
                  <th style={thStyle} onClick={() => handleSort('shellCapacity')}>Shell Cap (L)<SortIcon col="shellCapacity" sort={sort} /></th>
                  <th style={thStyle} onClick={() => handleSort('gauged')}>Gauged (L)<SortIcon col="gauged" sort={sort} /></th>
                  <th style={thStyle} onClick={() => handleSort('_fillPct')}>Fill %<SortIcon col="_fillPct" sort={sort} /></th>
                  <th>Gauge</th>
                  <th style={thStyle} onClick={() => handleSort('gaugedDif')}>Daily Diff (L)<SortIcon col="gaugedDif" sort={sort} /></th>
                  <th style={thStyle} onClick={() => handleSort('ullage')}>Ullage (L)<SortIcon col="ullage" sort={sort} /></th>
                  <th style={thStyle} onClick={() => handleSort('prodHeight')}>Prod Height (mm)<SortIcon col="prodHeight" sort={sort} /></th>
                  <th style={thStyle} onClick={() => handleSort('temp')}>Temp (°C)<SortIcon col="temp" sort={sort} /></th>
                  <th style={thStyle} onClick={() => handleSort('tcCorrVol')}>TC Corr Vol<SortIcon col="tcCorrVol" sort={sort} /></th>
                  <th style={thStyle} onClick={() => handleSort('waterVol')}>Water Vol (L)<SortIcon col="waterVol" sort={sort} /></th>
                  <th style={thStyle} onClick={() => handleSort('waterHeight')}>Water Height (mm)<SortIcon col="waterHeight" sort={sort} /></th>
                  <th style={thStyle} onClick={() => handleSort('uptime')}>Uptime (min)<SortIcon col="uptime" sort={sort} /></th>
                </tr>
              </thead>
              <tbody>
                {displayRows.length === 0 ? (
                  <tr><td colSpan={22}><div className="empty-state">No data for selected filters</div></td></tr>
                ) : pageRows.map((r, i) => {
                  const fillPct = r._fillPct !== null ? r._fillPct.toFixed(1) : '—'
                  const pctVal = parseFloat(fillPct)
                  const fillColor = pctVal > 55 ? 'var(--green)' : pctVal >= 25 ? 'var(--orange)' : 'var(--red)'
                  return (
                    <tr key={i}>
                      <td style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{r.businessDate}</td>
                      <td><span className="badge badge-blue" style={{ cursor: 'pointer' }} onClick={() => navigate(`/sites/${r.siteId}`)}>{r.siteId}</span></td>
                      <td style={{ color: 'var(--text-secondary)' }}>{r.siteName}</td>
                      <td style={{ fontWeight: 700 }}><span className="site-id-link">{r.deviceId}</span></td>
                      <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{r.tankId}</td>
                      <td>
                        <span className={`badge ${r.online ? 'badge-green' : 'badge-red'}`}>
                          {r.online ? 'Online' : 'Offline'}
                        </span>
                      </td>
                      <td>
                        {r.offlineCount > 0
                          ? <span className="badge badge-orange">{r.offlineCount}x</span>
                          : <span style={{ color: 'var(--text-muted)' }}>0</span>}
                      </td>
                      <td style={{ fontSize: 11, color: 'var(--text-muted)' }}>{r.protocol}</td>
                      <td>{Number(r.capacity).toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                      <td>{Number(r.tankHeight).toLocaleString(undefined, { maximumFractionDigits: 1 })}</td>
                      <td style={{ color: 'var(--text-muted)' }}>{Number(r.shellCapacity).toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                      <td style={{ color: 'var(--accent)', fontWeight: 600 }}>
                        {Number(r.gauged).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                      </td>
                      <td style={{ color: fillColor, fontWeight: 600 }}>
                        {fillPct}{fillPct !== '—' ? '%' : ''}
                      </td>
                      <td style={{ textAlign: 'center', verticalAlign: 'middle', padding: '4px 6px' }}>
                        <TankGaugeVisual fillPct={fillPct} uid={i} />
                      </td>
                      <td style={{ color: r.gaugedDif < 0 ? 'var(--red)' : 'var(--green)', fontWeight: 600 }}>
                        {Number(r.gaugedDif).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                      </td>
                      <td>{Number(r.ullage).toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                      <td>{Number(r.prodHeight).toFixed(1)}</td>
                      <td style={{ color: 'var(--text-secondary)' }}>{Number(r.temp).toFixed(1)}</td>
                      <td style={{ color: 'var(--text-muted)' }}>{Number(r.tcCorrVol).toFixed(2)}</td>
                      <td style={{ color: r.waterVol > 0 ? 'var(--orange)' : 'var(--text-muted)' }}>
                        {Number(r.waterVol).toFixed(2)}
                      </td>
                      <td style={{ color: 'var(--text-muted)' }}>{Number(r.waterHeight).toFixed(1)}</td>
                      <td style={{ color: 'var(--text-secondary)' }}>{r.uptime.toLocaleString()}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>

        <div className="pagination">
          <span className="pagination-info">
            {displayRows.length.toLocaleString()} total rows · showing {Math.min((page - 1) * PAGE_SIZE + 1, displayRows.length)}–{Math.min(page * PAGE_SIZE, displayRows.length)}
          </span>
          <button className="page-btn" disabled={page <= 1} onClick={() => setPage(1)}>«</button>
          <button className="page-btn" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>‹</button>
          <button className="page-btn active">{page}</button>
          <button className="page-btn" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>›</button>
          <button className="page-btn" disabled={page >= totalPages} onClick={() => setPage(totalPages)}>»</button>
        </div>
      </div>
    </ErrorBoundary>
  )
}
