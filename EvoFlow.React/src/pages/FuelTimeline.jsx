import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import api, { sitesApi } from '../api/client'
import ErrorBoundary from '../components/ErrorBoundary'

const timelineApi = {
  get: (params = {}) => api.get('/fueltimeline', { params }).then(r => r.data),
  sitesWithEvents: () => api.get('/fueltimeline/sites-with-events').then(r => r.data),
}

const TANK_STATUS = {
  delivery:    { label: 'Delivery',    badge: 'badge-blue',   colour: 'var(--accent)' },
  loss:        { label: 'Loss',        badge: 'badge-red',    colour: 'var(--red)' },
  gain:        { label: 'Gain',        badge: 'badge-orange', colour: 'var(--orange)' },
  quiet:       { label: 'Balanced',    badge: 'badge-green',  colour: 'var(--green)' },
  gauge_fault: { label: 'Gauge fault', badge: 'badge-gray',   colour: 'var(--text-muted)' },
}

const SEVERITY = {
  critical: { colour: 'var(--red)',    badge: 'badge-red',    label: 'Critical' },
  warning:  { colour: 'var(--orange)', badge: 'badge-orange', label: 'Warning' },
  info:     { colour: 'var(--text-muted)', badge: 'badge-gray', label: 'Info' },
}

const LAYER_LABEL = {
  tank: 'Tank', pump: 'Pump', pos: 'POS', system: 'System', loss: 'Tank',
}

// "POS · POS Offline" reads badly, so drop the layer tag when the category
// already leads with it.
function layerTag(layer, category) {
  const label = LAYER_LABEL[layer] || layer
  if (!label) return null
  return (category || '').toLowerCase().startsWith(label.toLowerCase()) ? null : label
}

function fmtL(v) {
  if (v === null || v === undefined) return '—'
  return Number(v).toLocaleString(undefined, { maximumFractionDigits: 0 })
}

function fmtSignedL(v) {
  if (v === null || v === undefined) return '—'
  const n = Number(v)
  return `${n > 0 ? '+' : ''}${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
}

function isoDate(d) {
  if (!d) return null
  return String(d).slice(0, 10)
}

function fmtDayHeading(d) {
  const dt = new Date(isoDate(d) + 'T00:00:00')
  if (Number.isNaN(dt.getTime())) return '—'
  return dt.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })
}

function fmtTime(d) {
  const s = String(d || '')
  const m = s.match(/T(\d{2}:\d{2}:\d{2})/)
  return m ? m[1] : '—'
}

function daysAgoIso(days) {
  const d = new Date()
  d.setDate(d.getDate() - days)
  return d.toISOString().slice(0, 10)
}

/** Stock bar showing where the tank opened and closed on the day. */
function StockMove({ opening, closing, capacity }) {
  const cap = Number(capacity) || 0
  if (cap <= 0) return null
  const o = Math.max(0, Math.min(100, (Number(opening) / cap) * 100))
  const c = Math.max(0, Math.min(100, (Number(closing) / cap) * 100))
  const lo = Math.min(o, c), hi = Math.max(o, c)
  const rose = c > o
  return (
    <div style={{
      position: 'relative', height: 8, borderRadius: 4, background: 'var(--input-bg)',
      border: '1px solid var(--card-border)', overflow: 'hidden', minWidth: 90,
    }}>
      <div style={{ position: 'absolute', left: 0, width: `${lo}%`, top: 0, bottom: 0, background: 'var(--card-border)' }} />
      <div style={{
        position: 'absolute', left: `${lo}%`, width: `${Math.max(1, hi - lo)}%`, top: 0, bottom: 0,
        background: rose ? 'var(--accent)' : 'var(--red)', opacity: 0.85,
      }} />
    </div>
  )
}

export default function FuelTimeline() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  const [sites, setSites] = useState([])
  const [eventSites, setEventSites] = useState([])
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const [filters, setFilters] = useState({
    siteId: searchParams.get('siteId') || '',
    tankId: searchParams.get('tankId') || '',
    dateFrom: searchParams.get('dateFrom') || daysAgoIso(21),
    dateTo: searchParams.get('dateTo') || daysAgoIso(0),
  })
  const [applied, setApplied] = useState(null)
  const [minSeverity, setMinSeverity] = useState('warning')
  const [expandedDays, setExpandedDays] = useState({})
  const [quietDays, setQuietDays] = useState(true)

  useEffect(() => {
    sitesApi.getAll().then(s => setSites(s || [])).catch(() => {})
    timelineApi.sitesWithEvents()
      .then(rows => {
        setEventSites(rows || [])
        // Land on a site that actually has an event history unless one was asked for.
        if (!searchParams.get('siteId') && rows?.length) {
          const best = rows[0]
          const next = {
            siteId: best.siteId, tankId: '',
            dateFrom: isoDate(best.firstDate) || daysAgoIso(21),
            dateTo: isoDate(best.lastDate) || daysAgoIso(0),
          }
          setFilters(next)
          setApplied(next)
        }
      })
      .catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (searchParams.get('siteId')) setApplied({ ...filters })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!applied?.siteId) return
    setLoading(true)
    timelineApi.get({
      siteId: applied.siteId,
      tankId: applied.tankId || undefined,
      dateFrom: applied.dateFrom || undefined,
      dateTo: applied.dateTo || undefined,
    })
      .then(d => { setData(d); setError(null); setExpandedDays({}) })
      .catch(e => setError(e.response?.data?.message || e.message || 'Failed to load timeline'))
      .finally(() => setLoading(false))
  }, [applied])

  const tanksAtSite = useMemo(() => {
    const set = new Set()
    for (const d of data?.days || []) for (const t of d.tanks || []) set.add(t.tankId)
    return [...set].sort()
  }, [data])

  const severityRank = { critical: 0, warning: 1, info: 2 }
  const minRank = severityRank[minSeverity] ?? 2

  const days = useMemo(() => {
    let out = data?.days || []
    if (!quietDays) {
      out = out.filter(d =>
        d.flags?.delivery || d.flags?.loss || d.flags?.gaugeFault || d.flags?.critical ||
        (d.eventGroups || []).some(g => (severityRank[g.severity] ?? 2) <= 1))
    }
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, quietDays])

  const siteHasEvents = (data?.site?.eventCount ?? 0) > 0

  function apply() { setApplied({ ...filters }) }
  function reset() {
    const next = {
      siteId: filters.siteId, tankId: '',
      dateFrom: daysAgoIso(21), dateTo: daysAgoIso(0),
    }
    setFilters(next); setApplied(next)
    setMinSeverity('warning'); setQuietDays(true); setExpandedDays({})
  }

  return (
    <ErrorBoundary>
      <div className="page-content">
        <div className="page-header">
          <div>
            <h1 className="page-title">Fuel Investigation Timeline</h1>
            <p className="page-subtitle">
              Stock, dispensing, deliveries, alarms and losses for one tank, in one chronological view.
            </p>
          </div>
        </div>

        {/* Resolution has to be stated or the timeline implies precision it does not have. */}
        <div className="card" style={{ marginBottom: 14, borderLeft: '3px solid var(--accent)' }}>
          <div style={{ padding: '11px 14px', fontSize: 12.5, color: 'var(--text-secondary)', lineHeight: 1.55 }}>
            <strong style={{ color: 'var(--text-primary)' }}>Two resolutions, because that is what exists.</strong>{' '}
            Alarms and device events carry real timestamps, so they appear to the second. Tank stock and
            dispensing do not — <strong style={{ color: 'var(--text-primary)' }}>one gauge reading per tank
            per day</strong> (at about 23:59) and one daily pump total — so the litres are shown per day,
            not per minute. Deliveries are not recorded anywhere, so a jump above{' '}
            {fmtL(data?.deliveryThresholdL ?? 2000)} L is inferred as one.
            {eventSites.length > 0 && (
              <> Only <strong style={{ color: 'var(--text-primary)' }}>{eventSites.length} site
                {eventSites.length === 1 ? '' : 's'}</strong> currently import system events
                ({eventSites.map(s => `${s.siteId} ${s.siteName}`).join(', ')}); elsewhere the
                timeline shows the daily litres only.
              </>
            )}
          </div>
        </div>

        <div className="card" style={{ marginBottom: 14 }}>
          <div className="filters-bar">
            <select
              className="filter-select" style={{ minWidth: 210 }}
              value={filters.siteId}
              onChange={e => setFilters(f => ({ ...f, siteId: e.target.value, tankId: '' }))}
            >
              <option value="">Select a site…</option>
              {eventSites.length > 0 && (
                <optgroup label="Sites with system events">
                  {eventSites.map(s => (
                    <option key={s.siteId} value={s.siteId}>
                      {s.siteId} — {s.siteName} ({s.eventCount} events)
                    </option>
                  ))}
                </optgroup>
              )}
              <optgroup label="All sites (daily litres only)">
                {sites.map(s => (
                  <option key={s.siteId} value={s.siteId}>{s.siteId} — {s.siteName}</option>
                ))}
              </optgroup>
            </select>

            <select
              className="filter-select" style={{ minWidth: 120 }}
              value={filters.tankId}
              onChange={e => setFilters(f => ({ ...f, tankId: e.target.value }))}
            >
              <option value="">All tanks</option>
              {tanksAtSite.map(t => <option key={t} value={t}>Tank {t}</option>)}
            </select>

            <label style={{ fontSize: 12, color: 'var(--text-secondary)' }}>From</label>
            <input type="date" className="filter-search" style={{ minWidth: 130 }}
                   value={filters.dateFrom}
                   onChange={e => setFilters(f => ({ ...f, dateFrom: e.target.value }))} />
            <label style={{ fontSize: 12, color: 'var(--text-secondary)' }}>To</label>
            <input type="date" className="filter-search" style={{ minWidth: 130 }}
                   value={filters.dateTo}
                   onChange={e => setFilters(f => ({ ...f, dateTo: e.target.value }))} />

            <button className="btn btn-primary btn-sm" onClick={apply} disabled={loading || !filters.siteId}>
              {loading ? 'Loading…' : 'Show timeline'}
            </button>
            <button className="btn btn-outline btn-sm" onClick={reset} disabled={loading}>Reset</button>

            <select className="filter-select" style={{ minWidth: 155 }}
                    value={minSeverity} onChange={e => setMinSeverity(e.target.value)}
                    title="Which events to list individually">
              <option value="critical">Critical events only</option>
              <option value="warning">Critical + warnings</option>
              <option value="info">All events</option>
            </select>

            <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 5 }}>
              <input type="checkbox" checked={quietDays} onChange={e => setQuietDays(e.target.checked)} />
              Show quiet days
            </label>
          </div>
        </div>

        {error && (
          <div className="card" style={{ padding: 14, marginBottom: 14, borderLeft: '3px solid var(--red)' }}>
            <span style={{ color: 'var(--red)', fontSize: 13 }}>{error}</span>
          </div>
        )}

        {data?.site && (
          <div className="card" style={{ marginBottom: 14 }}>
            <div className="card-header">
              <span className="card-title">
                <button
                  onClick={() => navigate(`/sites/${data.site.siteId}`)}
                  style={{
                    background: 'none', border: 'none', padding: 0, cursor: 'pointer',
                    color: 'var(--accent)', fontWeight: 700, fontSize: 'inherit',
                  }}
                >
                  {data.site.siteId} — {data.site.siteName}
                </button>
                {data.tankId && <span style={{ color: 'var(--text-secondary)', fontWeight: 400 }}> · Tank {data.tankId}</span>}
              </span>
              <span style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>
                {data.summary.days} day{data.summary.days === 1 ? '' : 's'} ·{' '}
                {fmtL(data.summary.deliveries)} deliveries ·{' '}
                {fmtL(data.summary.events)} events ·{' '}
                <span style={{ color: data.summary.criticalEvents > 0 ? 'var(--red)' : undefined }}>
                  {fmtL(data.summary.criticalEvents)} critical
                </span>
              </span>
            </div>
            {!siteHasEvents && (
              <div style={{ padding: '10px 16px', fontSize: 12, color: 'var(--orange)', borderTop: '1px solid var(--card-border)' }}>
                This site has no system events imported, so the timeline below shows the daily litres only —
                no alarms, deliveries confirmations or device faults.
              </div>
            )}
          </div>
        )}

        {loading && (
          <div className="card"><div className="loading-state"><div className="spinner" />Building timeline...</div></div>
        )}

        {!loading && applied?.siteId && days.length === 0 && (
          <div className="card"><div className="empty-state">Nothing to show for this site and date range.</div></div>
        )}

        {!loading && !applied?.siteId && (
          <div className="card"><div className="empty-state">Pick a site and date range, then choose Show timeline.</div></div>
        )}

        {/* The timeline itself: newest day first, each day a block. */}
        {!loading && days.map(day => {
          const key = isoDate(day.date)
          const isOpen = !!expandedDays[key]
          const groups = day.eventGroups || []
          const listed = (day.events || []).filter(e => (severityRank[e.severity] ?? 2) <= minRank)
          const accent = day.flags?.critical || day.flags?.loss ? 'var(--red)'
            : day.flags?.delivery ? 'var(--accent)'
            : day.flags?.gaugeFault ? 'var(--text-muted)'
            : 'var(--card-border)'

          return (
            <div key={key} className="card" style={{ marginBottom: 10, borderLeft: `3px solid ${accent}` }}>
              {/* Day header */}
              <div style={{
                display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10,
                padding: '10px 14px', borderBottom: '1px solid var(--card-border)',
              }}>
                <span style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text-primary)', minWidth: 190 }}>
                  {fmtDayHeading(day.date)}
                </span>
                {day.flags?.delivery && <span className="badge badge-blue">Delivery</span>}
                {day.flags?.loss && <span className="badge badge-red">Unaccounted loss</span>}
                {day.flags?.gaugeFault && <span className="badge badge-gray">Gauge fault</span>}
                {day.flags?.critical && <span className="badge badge-red">Critical alarm</span>}
                <span style={{ marginLeft: 'auto', display: 'flex', gap: 14, fontSize: 11.5, color: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums' }}>
                  <span>Dispensed <strong style={{ color: 'var(--text-primary)' }}>{fmtL(day.totals?.dispensed)} L</strong></span>
                  {day.totals?.delivered > 0 && (
                    <span>Delivered <strong style={{ color: 'var(--accent)' }}>{fmtL(day.totals.delivered)} L</strong></span>
                  )}
                  {day.tanks?.length > 0 && (
                    <span>Unaccounted{' '}
                      <strong style={{ color: day.totals?.variance < 0 ? 'var(--red)' : 'var(--text-primary)' }}>
                        {fmtSignedL(day.totals?.variance)} L
                      </strong>
                    </span>
                  )}
                </span>
              </div>

              {/* Day layer: what the litres did, per tank */}
              {day.tanks?.length > 0 && (
                <div className="table-responsive">
                  <table className="evo-table">
                    <thead>
                      <tr>
                        <th>Tank</th>
                        <th>Grade</th>
                        <th>Status</th>
                        <th>Stock move</th>
                        <th>Opening → Closing</th>
                        <th>Dispensed</th>
                        <th>Delivery</th>
                        <th>Unaccounted</th>
                        <th>What happened</th>
                      </tr>
                    </thead>
                    <tbody>
                      {day.tanks.map(t => {
                        const st = TANK_STATUS[t.status] || TANK_STATUS.quiet
                        return (
                          <tr key={t.tankId}>
                            <td className="font-mono" style={{ fontWeight: 700 }}>{t.tankId}</td>
                            <td style={{ whiteSpace: 'nowrap' }}>{t.gradeName}</td>
                            <td><span className={`badge ${st.badge}`}>{st.label}</span></td>
                            <td><StockMove opening={t.opening} closing={t.closing} capacity={t.capacity} /></td>
                            <td style={{ whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums', fontSize: 12 }}>
                              {fmtL(t.opening)} → {fmtL(t.closing)} L
                            </td>
                            <td style={{ fontVariantNumeric: 'tabular-nums' }}>{fmtL(t.dispensed)}</td>
                            <td style={{ fontVariantNumeric: 'tabular-nums', color: 'var(--accent)', fontWeight: t.impliedDelivery ? 600 : 400 }}>
                              {t.impliedDelivery ? `~${fmtL(t.impliedDelivery)}` : '—'}
                            </td>
                            <td style={{
                              fontVariantNumeric: 'tabular-nums', fontWeight: 600,
                              color: t.status === 'loss' ? 'var(--red)' : t.status === 'gain' ? 'var(--orange)' : 'var(--text-secondary)',
                            }}>
                              {t.status === 'delivery' ? '—' : fmtSignedL(t.variance)}
                            </td>
                            <td style={{ fontSize: 12, color: 'var(--text-secondary)', maxWidth: 340 }}>{t.narrative}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Collapsed event summary - keeps a flapping POS from burying a real alarm */}
              {groups.length > 0 && (
                <div style={{
                  display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center',
                  padding: '9px 14px', borderTop: '1px solid var(--card-border)', background: 'var(--table-header-bg)',
                }}>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.6, marginRight: 4 }}>
                    Events
                  </span>
                  {groups.map((g, i) => {
                    const sv = SEVERITY[g.severity] || SEVERITY.info
                    return (
                      <span
                        key={i}
                        title={`${g.sampleText}\n${fmtTime(g.firstTime)} – ${fmtTime(g.lastTime)}`}
                        style={{
                          display: 'inline-flex', alignItems: 'center', gap: 5,
                          padding: '2px 8px', borderRadius: 11, fontSize: 11,
                          background: 'var(--card-bg)', border: `1px solid ${g.severity === 'info' ? 'var(--card-border)' : sv.colour}`,
                          color: g.severity === 'info' ? 'var(--text-secondary)' : sv.colour,
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {layerTag(g.layer, g.category) && (
                          <span style={{ fontSize: 9.5, opacity: 0.7 }}>{layerTag(g.layer, g.category)}</span>
                        )}
                        {g.category}
                        {g.count > 1 && <strong>×{g.count}</strong>}
                      </span>
                    )
                  })}
                  {listed.length > 0 && (
                    <button
                      className="btn btn-ghost btn-sm" style={{ marginLeft: 'auto' }}
                      onClick={() => setExpandedDays(s => ({ ...s, [key]: !s[key] }))}
                    >
                      {isOpen ? 'Hide' : `Show ${listed.length}`} timestamped event{listed.length === 1 ? '' : 's'}
                    </button>
                  )}
                </div>
              )}

              {/* Timestamped layer, in time order */}
              {isOpen && listed.length > 0 && (
                <div style={{ padding: '10px 14px 14px' }}>
                  {listed.map((e, i) => {
                    const sv = SEVERITY[e.severity] || SEVERITY.info
                    return (
                      <div key={i} style={{ display: 'flex', gap: 11, alignItems: 'flex-start', padding: '5px 0' }}>
                        <span style={{
                          fontFamily: 'ui-monospace, monospace', fontSize: 11.5, color: 'var(--text-muted)',
                          width: 58, flexShrink: 0, paddingTop: 2,
                        }}>
                          {fmtTime(e.eventDateTime)}
                        </span>
                        <span style={{
                          width: 8, height: 8, borderRadius: '50%', marginTop: 5, flexShrink: 0,
                          background: sv.colour,
                          boxShadow: e.severity === 'critical' ? '0 0 0 3px var(--red-light)' : 'none',
                        }} />
                        <span style={{ minWidth: 0 }}>
                          <span style={{
                            fontSize: 12.5, fontWeight: e.severity === 'critical' ? 700 : 600,
                            color: e.severity === 'critical' ? 'var(--red)' : 'var(--text-primary)',
                          }}>
                            {e.category}
                          </span>
                          {(layerTag(e.layer, e.category) || e.deviceId) && (
                            <span style={{ fontSize: 10.5, color: 'var(--text-muted)', marginLeft: 6 }}>
                              {layerTag(e.layer, e.category)}
                              {e.deviceId ? ` ${e.deviceId}` : ''}
                            </span>
                          )}
                          {e.volumeLostLitres != null && (
                            <span className="badge badge-red" style={{ marginLeft: 6 }}>{fmtL(e.volumeLostLitres)} L lost</span>
                          )}
                          {e.text && e.text !== e.category && (
                            <div style={{ fontSize: 11.5, color: 'var(--text-secondary)', marginTop: 1, lineHeight: 1.45 }}>
                              {e.text}
                            </div>
                          )}
                        </span>
                      </div>
                    )
                  })}
                </div>
              )}

              {day.tanks?.length === 0 && groups.length > 0 && (
                <div style={{ padding: '9px 14px', fontSize: 11.5, color: 'var(--text-muted)' }}>
                  No gauge reading loaded for this day, so the litres cannot be reconciled — events only.
                </div>
              )}
            </div>
          )
        })}
      </div>
    </ErrorBoundary>
  )
}
