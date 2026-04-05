import { useEffect, useState, useMemo } from 'react'
import { useOutletContext, useNavigate } from 'react-router-dom'
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line,
  PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer
} from 'recharts'
import { sitesApi, pumpDevicesApi, pumpTotalsApi } from '../api/client'
import ErrorBoundary from '../components/ErrorBoundary'

const PINK   = '#e91e8c'
const PURPLE = '#7c3aed'
const BLUE   = '#0ea5e9'
const GREEN  = '#22c55e'
const ORANGE = '#f59e0b'

function fmt(n, decimals = 0) {
  if (n === null || n === undefined || isNaN(n)) return '—'
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return Number(n).toFixed(decimals)
}

function fmtGbp(n) {
  if (n === null || n === undefined || isNaN(n)) return '—'
  if (Math.abs(n) >= 1_000_000) return `£${(n / 1_000_000).toFixed(2)}M`
  if (Math.abs(n) >= 1_000) return `£${(n / 1_000).toFixed(1)}K`
  return `£${Number(n).toFixed(2)}`
}

function KpiCard({ label, value, sub, icon, accent, trend, trendLabel }) {
  const color = accent || PINK
  const bg = color + '18'
  return (
    <div className="kpi-card" style={{ '--kc': color }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 }}>
        <div>
          <div className="kpi-label">{label}</div>
          <div className="kpi-value">{value}</div>
        </div>
        <div className="kpi-icon-wrap" style={{ background: bg, color }}>
          {icon}
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {trend !== undefined && (
          <span className={`kpi-trend ${trend >= 0 ? 'up' : 'down'}`}>
            {trend >= 0 ? '↑' : '↓'} {Math.abs(trend).toFixed(1)}%
          </span>
        )}
        <span className="kpi-sub">{sub}</span>
      </div>
    </div>
  )
}

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  return (
    <div style={{
      background: 'var(--card-bg)', border: '1px solid var(--card-border)',
      borderRadius: 8, padding: '10px 14px', fontSize: 12,
      boxShadow: 'var(--card-shadow)'
    }}>
      <div style={{ fontWeight: 700, marginBottom: 6, color: 'var(--text-primary)' }}>{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ color: p.color, marginBottom: 2 }}>
          {p.name}: <strong>{typeof p.value === 'number' && p.name?.includes('£') ? fmtGbp(p.value) : fmt(p.value)}</strong>
        </div>
      ))}
    </div>
  )
}

export default function Dashboard() {
  const [sites, setSites] = useState([])
  const [devices, setDevices] = useState([])
  const [totals, setTotals] = useState([])
  const [loading, setLoading] = useState(true)
  const [apiError, setApiError] = useState(null)

  useEffect(() => {
    Promise.allSettled([
      sitesApi.getAll(),
      pumpDevicesApi.getAll(),
      pumpTotalsApi.getAll({ pageSize: 10000 }),
    ]).then(([sRes, dRes, tRes]) => {
      if (sRes.status === 'fulfilled') setSites(sRes.value || [])
      if (dRes.status === 'fulfilled') setDevices(dRes.value || [])
      if (tRes.status === 'fulfilled') setTotals(tRes.value || [])
      const errs = [sRes, dRes, tRes].filter(r => r.status === 'rejected')
      if (errs.length) setApiError(`${errs.length} data source(s) unavailable — some metrics may be incomplete.`)
    }).finally(() => setLoading(false))
  }, [])

  // Pump totals — only type='pump' with positive money diff
  const pumpData = useMemo(() =>
    totals.filter(t => t.totType === 'pump' && t.moneyDiff > 0),
    [totals]
  )

  // KPIs
  const totalRevenue = useMemo(() => pumpData.reduce((s, t) => s + (t.moneyDiff || 0), 0), [pumpData])
  const totalVolume  = useMemo(() => pumpData.reduce((s, t) => s + (t.volumeDiff || 0), 0), [pumpData])
  const onlinePumps  = useMemo(() => devices.filter(d => d.online).length, [devices])
  const tradingDays  = useMemo(() => new Set(pumpData.map(t => t.businessDate)).size, [pumpData])
  const avgDailyRev  = tradingDays > 0 ? totalRevenue / tradingDays : 0
  const avgPerPump   = devices.length > 0 ? totalRevenue / devices.length : 0

  // Daily revenue/volume chart data
  const dailyChart = useMemo(() => {
    const map = {}
    pumpData.forEach(t => {
      const d = t.businessDate?.slice(0, 10) || 'Unknown'
      if (!map[d]) map[d] = { date: d, revenue: 0, volume: 0 }
      map[d].revenue += t.moneyDiff || 0
      map[d].volume  += t.volumeDiff || 0
    })
    return Object.values(map).sort((a, b) => a.date.localeCompare(b.date)).map(d => ({
      ...d,
      date: d.date.slice(5), // MM-DD
    }))
  }, [pumpData])

  // Per-site revenue (join through devices)
  const siteRevMap = useMemo(() => {
    const devSite = {}
    devices.forEach(d => { devSite[d.pumpDeviceId] = d.siteId })
    const map = {}
    pumpData.forEach(t => {
      const siteId = devSite[t.pumpDeviceId]
      if (!siteId) return
      map[siteId] = (map[siteId] || 0) + (t.moneyDiff || 0)
    })
    return map
  }, [pumpData, devices])

  // Top sites
  const topSites = useMemo(() => {
    const siteMap = {}
    sites.forEach(s => { siteMap[s.siteId] = s.siteName || s.siteId })
    const max = Math.max(...Object.values(siteRevMap), 1)
    return Object.entries(siteRevMap)
      .sort(([,a],[,b]) => b - a)
      .slice(0, 6)
      .map(([id, rev]) => ({ id, name: siteMap[id] || id, rev, pct: (rev / max) * 100 }))
  }, [siteRevMap, sites])

  // Pump status donut
  const pumpPie = useMemo(() => {
    const online = onlinePumps
    const offline = devices.length - online
    const data = []
    if (online > 0) data.push({ name: 'Online', value: online })
    if (offline > 0) data.push({ name: 'Offline', value: offline })
    if (data.length === 0) data.push({ name: 'No pumps', value: 1 })
    return data
  }, [devices, onlinePumps])

  const PIE_COLORS = [GREEN, '#e4e6ef']

  if (loading) {
    return (
      <div className="loading-state">
        <div className="spinner" />
        Loading dashboard...
      </div>
    )
  }

  return (
    <ErrorBoundary fallback="Dashboard failed to render. Please refresh.">
      {apiError && (
        <div style={{
          background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 6,
          padding: '8px 14px', marginBottom: 14, fontSize: 12, color: '#92400e'
        }}>
          ⚠ {apiError}
        </div>
      )}

      {/* Page header */}
      <div className="page-header" style={{ marginBottom: 18 }}>
        <div>
          <div className="page-title">Sales Dashboard</div>
          <div className="page-subtitle">Fuel analytics overview across all sites</div>
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-secondary)', background: 'var(--card-bg)', border: '1px solid var(--card-border)', borderRadius: 7, padding: '6px 12px' }}>
          {tradingDays} trading day{tradingDays !== 1 ? 's' : ''} of data
        </div>
      </div>

      {/* 6 KPI tiles */}
      <div className="kpi-row">
        <ErrorBoundary fallback={<div className="kpi-card">—</div>}>
          <KpiCard
            label="Total Revenue"
            value={fmtGbp(totalRevenue)}
            sub="All pump transactions"
            accent={PINK}
            icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>}
          />
        </ErrorBoundary>
        <ErrorBoundary fallback={<div className="kpi-card">—</div>}>
          <KpiCard
            label="Total Volume"
            value={`${fmt(totalVolume)} L`}
            sub="Fuel dispensed (litres)"
            accent={PURPLE}
            icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 3h18v13a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V3z"/><line x1="3" y1="8" x2="21" y2="8"/><line x1="12" y1="8" x2="12" y2="18"/></svg>}
          />
        </ErrorBoundary>
        <ErrorBoundary fallback={<div className="kpi-card">—</div>}>
          <KpiCard
            label="Total Sites"
            value={sites.length.toLocaleString()}
            sub="Registered locations"
            accent={BLUE}
            icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>}
          />
        </ErrorBoundary>
        <ErrorBoundary fallback={<div className="kpi-card">—</div>}>
          <KpiCard
            label="Total Pumps"
            value={devices.length.toLocaleString()}
            sub={`${onlinePumps} currently online`}
            accent={ORANGE}
            icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="3" width="13" height="18" rx="2"/><path d="M15 8h2a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2h-2"/><line x1="8" y1="7" x2="8" y2="7"/></svg>}
          />
        </ErrorBoundary>
        <ErrorBoundary fallback={<div className="kpi-card">—</div>}>
          <KpiCard
            label="Avg Daily Revenue"
            value={fmtGbp(avgDailyRev)}
            sub={`Over ${tradingDays} trading days`}
            accent={PINK}
            icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>}
          />
        </ErrorBoundary>
        <ErrorBoundary fallback={<div className="kpi-card">—</div>}>
          <KpiCard
            label="Avg Revenue / Pump"
            value={fmtGbp(avgPerPump)}
            sub="Across all pump devices"
            accent={GREEN}
            icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>}
          />
        </ErrorBoundary>
      </div>

      {/* Charts row */}
      <div className="chart-row" style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 14, marginBottom: 14 }}>
        {/* Fuel Sales Overview */}
        <ErrorBoundary fallback={<div className="card" style={{padding:24}}>Chart unavailable</div>}>
          <div className="card">
            <div className="card-header">
              <span className="card-title">Fuel Sales Overview</span>
              <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-muted)' }}>Revenue &amp; Volume by Day</span>
            </div>
            <div style={{ padding: '16px 18px 12px' }}>
              {dailyChart.length === 0 ? (
                <div className="empty-state" style={{ padding: 32 }}>No daily data available</div>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <AreaChart data={dailyChart} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="gradRev" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={PINK} stopOpacity={0.25}/>
                        <stop offset="95%" stopColor={PINK} stopOpacity={0.02}/>
                      </linearGradient>
                      <linearGradient id="gradVol" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={PURPLE} stopOpacity={0.2}/>
                        <stop offset="95%" stopColor={PURPLE} stopOpacity={0.02}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--table-border)" />
                    <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} tickFormatter={v => fmt(v)} />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                    <Area type="monotone" dataKey="revenue" name="£ Revenue" stroke={PINK} strokeWidth={2.5} fill="url(#gradRev)" dot={false} />
                    <Area type="monotone" dataKey="volume" name="Vol (L)" stroke={PURPLE} strokeWidth={2} fill="url(#gradVol)" dot={false} strokeDasharray="4 2" />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        </ErrorBoundary>

        {/* Pump Status donut */}
        <ErrorBoundary fallback={<div className="card" style={{padding:24}}>Chart unavailable</div>}>
          <div className="card">
            <div className="card-header">
              <span className="card-title">Pump Status</span>
            </div>
            <div style={{ padding: '8px 0 0', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <div style={{ position: 'relative', width: 180, height: 180 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pumpPie}
                      cx="50%"
                      cy="50%"
                      innerRadius={55}
                      outerRadius={80}
                      dataKey="value"
                      paddingAngle={3}
                    >
                      {pumpPie.map((_, i) => (
                        <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip content={<CustomTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
                <div style={{
                  position: 'absolute', top: '50%', left: '50%',
                  transform: 'translate(-50%,-50%)', textAlign: 'center'
                }}>
                  <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-primary)' }}>{devices.length}</div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 1 }}>Total</div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 16, marginTop: 4, marginBottom: 16 }}>
                {pumpPie.map((p, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12 }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: PIE_COLORS[i % PIE_COLORS.length] }} />
                    <span style={{ color: 'var(--text-secondary)' }}>{p.name}</span>
                    <strong style={{ color: 'var(--text-primary)' }}>{p.value}</strong>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </ErrorBoundary>
      </div>

      {/* Bottom row: top sites + bar chart */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
        {/* Top Sites by Revenue */}
        <ErrorBoundary fallback={<div className="card" style={{padding:24}}>Chart unavailable</div>}>
          <div className="card">
            <div className="card-header">
              <span className="card-title">Top Sites by Revenue</span>
              <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-muted)' }}>Sort by highest</span>
            </div>
            <div style={{ padding: '14px 18px' }}>
              {topSites.length === 0 ? (
                <div style={{ color: 'var(--text-muted)', fontSize: 12, padding: '16px 0' }}>No site revenue data available</div>
              ) : topSites.map((s, i) => (
                <div key={s.id} style={{ marginBottom: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ fontSize: 12, color: 'var(--text-primary)', fontWeight: 600 }}>
                      <span style={{ color: 'var(--text-muted)', marginRight: 6, fontSize: 11 }}>#{i + 1}</span>
                      {s.name}
                    </span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: PINK }}>{fmtGbp(s.rev)}</span>
                  </div>
                  <div style={{ height: 5, background: 'var(--table-border)', borderRadius: 4, overflow: 'hidden' }}>
                    <div style={{
                      height: '100%',
                      width: `${s.pct}%`,
                      background: `linear-gradient(90deg, ${PINK}, ${PURPLE})`,
                      borderRadius: 4,
                      transition: 'width 0.6s ease'
                    }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </ErrorBoundary>

        {/* Revenue by day bar chart */}
        <ErrorBoundary fallback={<div className="card" style={{padding:24}}>Chart unavailable</div>}>
          <div className="card">
            <div className="card-header">
              <span className="card-title">Daily Revenue Breakdown</span>
              <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-muted)' }}>£ Revenue per trading day</span>
            </div>
            <div style={{ padding: '16px 18px 12px' }}>
              {dailyChart.length === 0 ? (
                <div className="empty-state" style={{ padding: 32 }}>No data available</div>
              ) : (
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={dailyChart} margin={{ top: 4, right: 4, left: 0, bottom: 0 }} barSize={32}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--table-border)" vertical={false} />
                    <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} tickFormatter={v => fmt(v)} />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar dataKey="revenue" name="£ Revenue" radius={[4, 4, 0, 0]}>
                      {dailyChart.map((_, i) => (
                        <Cell key={i} fill={i % 2 === 0 ? PINK : PURPLE} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        </ErrorBoundary>
      </div>

      {/* Sites summary table */}
      <ErrorBoundary fallback={<div className="card" style={{padding:24}}>Table unavailable</div>}>
        <div className="card">
          <div className="card-header">
            <span className="card-title">Sites Overview</span>
            <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-muted)' }}>
              {sites.length} registered site{sites.length !== 1 ? 's' : ''}
            </span>
          </div>
          <div className="table-responsive">
            <table className="evo-table">
              <thead>
                <tr>
                  <th>Site ID</th>
                  <th>Site Name</th>
                  <th>City</th>
                  <th>Post Code</th>
                  <th>Pumps</th>
                  <th>Status</th>
                  <th>Revenue</th>
                </tr>
              </thead>
              <tbody>
                {sites.slice(0, 10).map(site => {
                  const sitePumps = devices.filter(d => d.siteId === site.siteId)
                  const online = sitePumps.filter(d => d.online).length
                  const rev = siteRevMap[site.siteId] || 0
                  return (
                    <tr key={site.siteId}>
                      <td className="font-mono" style={{ fontSize: 12, color: 'var(--accent)', fontWeight: 600 }}>{site.siteId}</td>
                      <td style={{ fontWeight: 600 }}>{site.siteName}</td>
                      <td style={{ color: 'var(--text-secondary)' }}>{site.city || '—'}</td>
                      <td className="font-mono" style={{ fontSize: 12 }}>{site.postCode || '—'}</td>
                      <td style={{ color: 'var(--text-secondary)' }}>{sitePumps.length || '—'}</td>
                      <td>
                        {sitePumps.length > 0 ? (
                          <span className={`badge ${online > 0 ? 'badge-green' : 'badge-red'}`}>
                            {online > 0 ? `${online}/${sitePumps.length} Online` : 'Offline'}
                          </span>
                        ) : <span className="badge badge-gray">No Pumps</span>}
                      </td>
                      <td style={{ fontWeight: 700, color: rev > 0 ? PINK : 'var(--text-muted)' }}>
                        {rev > 0 ? fmtGbp(rev) : '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {sites.length > 10 && (
            <div style={{ padding: '10px 18px', fontSize: 12, color: 'var(--text-muted)', borderTop: '1px solid var(--table-border)' }}>
              Showing 10 of {sites.length} sites. Visit the Sites page for the full list.
            </div>
          )}
        </div>
      </ErrorBoundary>
    </ErrorBoundary>
  )
}
