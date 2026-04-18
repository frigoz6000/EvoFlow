import { useEffect, useState, useMemo } from 'react'
import { useLanguage } from '../i18n/LanguageContext'
import { useParams, useNavigate } from 'react-router-dom'
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts'
import { sitesApi } from '../api/client'
import ErrorBoundary from '../components/ErrorBoundary'

const PINK   = '#e91e8c'
const PURPLE = '#7c3aed'
const BLUE   = '#0ea5e9'
const GREEN  = '#22c55e'
const ORANGE = '#f59e0b'
const RED    = '#ef4444'
const PIE_COLORS = [PINK, PURPLE, BLUE, GREEN, ORANGE, RED, '#8b5cf6', '#06b6d4']

function TankGaugeVisual({ fillPct, uid }) {
  const pct = parseFloat(fillPct)
  if (isNaN(pct)) return null
  const color = pct > 55 ? '#22c55e' : pct >= 25 ? '#f59e0b' : '#ef4444'
  const fillRatio = Math.min(100, Math.max(0, pct)) / 100
  const w = 42, h = 52
  const capW = 12, capH = 7, bodyY = capH, bodyH = h - capH - 2
  const fillH = Math.round(bodyH * fillRatio)
  const fillY = bodyY + bodyH - fillH
  const clipId = `sd-tg-clip-${uid}`
  const rx = 9
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ display: 'block' }}>
      <defs>
        <clipPath id={clipId}>
          <rect x={2} y={bodyY} width={w - 4} height={bodyH} rx={rx} />
        </clipPath>
      </defs>
      <rect x={(w - capW) / 2} y={1} width={capW} height={capH} rx={2} style={{ fill: 'var(--tank-cap-color)' }} stroke="#475569" strokeWidth={1} />
      <rect x={2} y={bodyY} width={w - 4} height={bodyH} rx={rx} style={{ fill: 'var(--tank-body-bg)' }} stroke="#475569" strokeWidth={1.5} />
      {fillH > 0 && (
        <rect x={2} y={fillY} width={w - 4} height={fillH} fill={color} opacity={0.88} clipPath={`url(#${clipId})`} />
      )}
      <rect x={2} y={bodyY} width={w - 4} height={bodyH} rx={rx} fill="none" stroke="#475569" strokeWidth={1.5} />
    </svg>
  )
}

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

function fmtDate(s) {
  if (!s) return '—'
  return s.slice(0, 10)
}

function fmtDateTime(s) {
  if (!s) return '—'
  return s.replace('T', ' ').slice(0, 16)
}

function KpiCard({ label, value, sub, icon, accent }) {
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
      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{sub}</div>
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
          {p.name}: <strong>{typeof p.value === 'number' && (p.name?.startsWith('£') || p.name?.includes('Revenue')) ? fmtGbp(p.value) : fmt(p.value, 1)}</strong>
        </div>
      ))}
    </div>
  )
}

export default function SiteDetail() {
  const { siteId } = useParams()
  const navigate = useNavigate()
  const { t } = useLanguage()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    setLoading(true)
    setError(null)
    sitesApi.getDetail(siteId)
      .then(d => setData(d))
      .catch(e => setError(e.response?.status === 404 ? 'Site not found.' : 'Failed to load site data.'))
      .finally(() => setLoading(false))
  }, [siteId])

  const dailyChart = useMemo(() => {
    if (!data?.dailyStats) return []
    return data.dailyStats.map(d => ({
      date: (d.date || '').slice(5),
      revenue: Number(d.revenue || 0),
      volume: Number(d.volume || 0),
    }))
  }, [data])

  const fuelChart = useMemo(() => {
    if (!data?.fuelBreakdown) return []
    return data.fuelBreakdown.map(f => ({
      name: f.fuelType || 'Unknown',
      revenue: Number(f.totalRevenue || 0),
      volume: Number(f.totalVolume || 0),
      transactions: Number(f.transactions || 0),
    }))
  }, [data])

  if (loading) {
    return (
      <div className="loading-state">
        <div className="spinner" />
        Loading site data...
      </div>
    )
  }

  if (error) {
    return (
      <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)' }}>
        <div style={{ fontSize: 48, marginBottom: 12 }}>⚠</div>
        <div style={{ fontSize: 16, marginBottom: 16 }}>{error}</div>
        <button className="btn btn-secondary" onClick={() => navigate('/sites')}>← Back to Sites</button>
      </div>
    )
  }

  if (!data) return null

  const { site, pumps, totalPumps, onlinePumps, totalRevenue, totalVolume, totalTransactions, recentTransactions, tankReadings } = data

  const address = [site.address1, site.address2, site.city, site.county, site.postCode]
    .filter(Boolean).join(', ') || 'No address recorded'

  return (
    <ErrorBoundary fallback="Site detail page error.">
      {/* Header */}
      <div className="page-header mb-4" style={{ alignItems: 'flex-start' }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
            <button
              onClick={() => navigate('/sites')}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                color: 'var(--text-muted)', fontSize: 13, padding: '2px 0',
                display: 'flex', alignItems: 'center', gap: 4
              }}
            >
              ← Sites
            </button>
            <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>/</span>
            <span className="font-mono" style={{ fontSize: 13, color: 'var(--accent)', fontWeight: 700 }}>{site.siteId}</span>
          </div>
          <div className="page-title">{site.siteName}</div>
          <div className="page-subtitle" style={{ marginTop: 2 }}>
            {address}
            {(site.openingHour || site.closingHour) && (
              <span style={{ marginLeft: 12, color: 'var(--text-muted)' }}>
                · {(site.openingHour || '').substring(0, 5)} – {(site.closingHour || '').substring(0, 5)}
              </span>
            )}
            {site.poleSign && (
              <span style={{ marginLeft: 12, color: 'var(--text-muted)' }}>· Pole: {site.poleSign}</span>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 4, alignItems: 'center' }}>
          <span className={`badge ${onlinePumps > 0 ? 'badge-green' : 'badge-red'}`}>
            {onlinePumps}/{totalPumps} Pumps Online
          </span>
          <button
            onClick={() => navigate(`/site-map?siteId=${site.siteId}`)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '5px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600,
              background: 'var(--accent)', color: '#fff', border: 'none', cursor: 'pointer'
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0 1 18 0z"/>
              <circle cx="12" cy="10" r="3"/>
            </svg>
            View on Map
          </button>
        </div>
      </div>

      {/* KPI row */}
      <div className="kpi-row" style={{ marginBottom: 14 }}>
        <KpiCard
          label="Total Revenue"
          value={fmtGbp(totalRevenue)}
          sub="All pump transactions"
          accent={PINK}
          icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>}
        />
        <KpiCard
          label="Total Volume"
          value={`${fmt(totalVolume)} L`}
          sub="Fuel dispensed (litres)"
          accent={PURPLE}
          icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 3h18v13a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V3z"/><line x1="3" y1="8" x2="21" y2="8"/><line x1="12" y1="8" x2="12" y2="18"/></svg>}
        />
        <KpiCard
          label="Transactions"
          value={Number(totalTransactions).toLocaleString()}
          sub="Fuel records at this site"
          accent={BLUE}
          icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>}
        />
        <KpiCard
          label="Pump Devices"
          value={totalPumps}
          sub={`${onlinePumps} currently online`}
          accent={onlinePumps > 0 ? GREEN : RED}
          icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="3" width="13" height="18" rx="2"/><path d="M15 8h2a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2h-2"/><line x1="8" y1="7" x2="8" y2="7"/></svg>}
        />
        <KpiCard
          label="Tank Gauges"
          value={tankReadings?.length || 0}
          sub="Tanks with gauge data"
          accent={ORANGE}
          icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22c4.97 0 9-2.69 9-6v-4l-3-6H6L3 12v4c0 3.31 4.03 6 9 6z"/><path d="M3 12c0 3.31 4.03 6 9 6s9-2.69 9-6"/></svg>}
        />
      </div>

      {/* Charts row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: 14, marginBottom: 14 }}>
        {/* Revenue & Volume trend */}
        <ErrorBoundary fallback={<div className="card" style={{padding:24}}>Chart unavailable</div>}>
          <div className="card">
            <div className="card-header">
              <span className="card-title">{t('card_revenue_volume_trend')}</span>
              <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-muted)' }}>By trading day</span>
            </div>
            <div style={{ padding: '16px 18px 12px' }}>
              {dailyChart.length === 0 ? (
                <div className="empty-state" style={{ padding: 32 }}>{t('no_trading_data')}</div>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <AreaChart data={dailyChart} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="sdGradRev" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={PINK} stopOpacity={0.25}/>
                        <stop offset="95%" stopColor={PINK} stopOpacity={0.02}/>
                      </linearGradient>
                      <linearGradient id="sdGradVol" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={PURPLE} stopOpacity={0.2}/>
                        <stop offset="95%" stopColor={PURPLE} stopOpacity={0.02}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--table-border)" />
                    <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} tickFormatter={v => fmt(v)} />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                    <Area type="monotone" dataKey="revenue" name="£ Revenue" stroke={PINK} strokeWidth={2.5} fill="url(#sdGradRev)" dot={false} />
                    <Area type="monotone" dataKey="volume" name="Vol (L)" stroke={PURPLE} strokeWidth={2} fill="url(#sdGradVol)" dot={false} strokeDasharray="4 2" />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        </ErrorBoundary>

        {/* Fuel type breakdown */}
        <ErrorBoundary fallback={<div className="card" style={{padding:24}}>Chart unavailable</div>}>
          <div className="card">
            <div className="card-header">
              <span className="card-title">{t('card_fuel_type_breakdown')}</span>
            </div>
            <div style={{ padding: '8px 0 0', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              {fuelChart.length === 0 ? (
                <div className="empty-state" style={{ padding: 32 }}>{t('no_fuel_data')}</div>
              ) : (
                <>
                  <ResponsiveContainer width="100%" height={160}>
                    <PieChart>
                      <Pie data={fuelChart} cx="50%" cy="50%" outerRadius={65} dataKey="revenue" paddingAngle={3}>
                        {fuelChart.map((_, i) => (
                          <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip content={<CustomTooltip />} formatter={(v) => fmtGbp(v)} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div style={{ padding: '0 16px 14px', width: '100%' }}>
                    {fuelChart.map((f, i) => (
                      <div key={f.name} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6, fontSize: 12 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <div style={{ width: 8, height: 8, borderRadius: '50%', background: PIE_COLORS[i % PIE_COLORS.length], flexShrink: 0 }} />
                          <span style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>{f.name}</span>
                        </div>
                        <div style={{ display: 'flex', gap: 10 }}>
                          <span style={{ color: 'var(--text-muted)' }}>{fmt(f.volume)} L</span>
                          <span style={{ fontWeight: 700, color: PIE_COLORS[i % PIE_COLORS.length] }}>{fmtGbp(f.revenue)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        </ErrorBoundary>
      </div>

      {/* Bottom row: pumps + tanks */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
        {/* Pump devices */}
        <div className="card">
          <div className="card-header">
            <span className="card-title">{t('card_pump_devices')}</span>
            <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-muted)' }}>{totalPumps} device{totalPumps !== 1 ? 's' : ''}</span>
          </div>
          <div className="table-responsive">
            {pumps.length === 0 ? (
              <div className="empty-state">{t('no_pump_devices')}</div>
            ) : (
              <table className="evo-table">
                <thead>
                  <tr>
                    <th>Device ID</th>
                    <th>Protocol</th>
                    <th>Status</th>
                    <th>Offline Count</th>
                    <th>Last Seen</th>
                  </tr>
                </thead>
                <tbody>
                  {pumps.map(p => (
                    <tr key={p.pumpDeviceId}>
                      <td className="font-mono" style={{ fontSize: 12, fontWeight: 600 }}>{p.deviceId}</td>
                      <td style={{ color: 'var(--text-secondary)', fontSize: 12 }}>{p.protocol || '—'}</td>
                      <td>
                        <span className={`badge ${p.online ? 'badge-green' : 'badge-red'}`}>
                          {p.online ? 'Online' : 'Offline'}
                        </span>
                      </td>
                      <td style={{ color: p.offlineCount > 0 ? 'var(--accent-warning, #f59e0b)' : 'var(--text-muted)', fontSize: 12 }}>
                        {p.offlineCount ?? 0}
                      </td>
                      <td style={{ color: 'var(--text-muted)', fontSize: 11 }}>
                        {p.lastSeenUtc ? fmtDateTime(p.lastSeenUtc) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Tank gauges */}
        <div className="card">
          <div className="card-header">
            <span className="card-title">{t('card_tank_gauge_readings')}</span>
            <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-muted)' }}>
              Latest reading per tank
              {tankReadings?.length > 0 && tankReadings[0].businessDate && (
                <span style={{ marginLeft: 6 }}>· {fmtDate(tankReadings[0].businessDate)}</span>
              )}
            </span>
          </div>
          <div className="table-responsive">
            {!tankReadings?.length ? (
              <div className="empty-state">{t('no_tank_data')}</div>
            ) : (
              <table className="evo-table">
                <thead>
                  <tr>
                    <th>Tank</th>
                    <th>Status</th>
                    <th>Time</th>
                    <th>Fill Level</th>
                    <th>Gauged (L)</th>
                    <th>Daily Diff (L)</th>
                    <th>Ullage (L)</th>
                    <th>Capacity (L)</th>
                    <th>Temp (°C)</th>
                    <th>Water (L)</th>
                  </tr>
                </thead>
                <tbody>
                  {tankReadings.map((t, i) => {
                    const pct = t.capacity > 0 ? (t.gauged / t.capacity) * 100 : 0
                    const barColor = pct > 50 ? GREEN : pct > 20 ? ORANGE : RED
                    const dailyDiff = Number(t.gaugedDif || 0)
                    return (
                      <tr key={i}>
                        <td className="font-mono" style={{ fontSize: 12, fontWeight: 700 }}>{t.tankId || '—'}</td>
                        <td>
                          <span className={`badge ${t.online ? 'badge-green' : 'badge-red'}`}>
                            {t.online ? 'Online' : 'Offline'}
                          </span>
                        </td>
                        <td style={{ fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                          {(t.dataTime || '').substring(0, 5)}
                        </td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <TankGaugeVisual fillPct={pct} uid={i} />
                            <span style={{ fontSize: 11, color: barColor, fontWeight: 600, minWidth: 30 }}>{pct.toFixed(0)}%</span>
                          </div>
                        </td>
                        <td style={{ fontWeight: 600, fontSize: 12 }}>{fmt(t.gauged)}</td>
                        <td style={{ fontSize: 12, color: dailyDiff < 0 ? RED : dailyDiff > 0 ? GREEN : 'var(--text-muted)', fontWeight: dailyDiff !== 0 ? 600 : undefined }}>
                          {dailyDiff !== 0 ? `${dailyDiff > 0 ? '+' : ''}${fmt(dailyDiff)}` : '—'}
                        </td>
                        <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{fmt(t.ullage)}</td>
                        <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{fmt(t.capacity)}</td>
                        <td style={{ fontSize: 12 }}>{t.temp != null ? `${Number(t.temp).toFixed(1)}°` : '—'}</td>
                        <td style={{ fontSize: 12, color: Number(t.waterVol) > 0 ? RED : 'var(--text-muted)' }}>
                          {t.waterVol != null && Number(t.waterVol) > 0 ? fmt(t.waterVol, 1) : '—'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      {/* Recent transactions */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">{t('card_recent_transactions')}</span>
          <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-muted)' }}>Latest 20</span>
        </div>
        <div className="table-responsive">
          {!recentTransactions?.length ? (
            <div className="empty-state">{t('no_transactions')}</div>
          ) : (
            <table className="evo-table">
              <thead>
                <tr>
                  <th>Date/Time</th>
                  <th>Fuel Type</th>
                  <th>Volume (L)</th>
                  <th>Amount (£)</th>
                  <th>Vehicle</th>
                  <th>Odometer</th>
                </tr>
              </thead>
              <tbody>
                {recentTransactions.map((r, i) => (
                  <tr key={i}>
                    <td className="font-mono" style={{ fontSize: 11 }}>{fmtDateTime(r.transactionUtc)}</td>
                    <td>
                      <span className="badge badge-blue">{r.fuelTypeId}</span>
                    </td>
                    <td style={{ fontWeight: 600 }}>{fmt(r.volumeL, 2)}</td>
                    <td style={{ fontWeight: 700, color: PINK }}>{fmtGbp(r.amountGBP)}</td>
                    <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{r.vehicleReg || '—'}</td>
                    <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                      {r.odometerKm ? `${r.odometerKm.toLocaleString()} km` : '—'}
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
