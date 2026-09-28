import { useEffect, useMemo, useState, Fragment } from 'react'
import { Link } from 'react-router-dom'
import api from '../api/client'
import { RunOutChart, VarianceChart, ChartLegend } from './TankCharts'

// Compact, read-only views of the Run-out Prediction and Variance Analysis
// engines, scoped to one site, for embedding in the site detail page. Both read
// the same endpoints the full pages use, so the verdicts can never disagree.

const runOutApi = {
  getAll: (params) => api.get('/runoutprediction', { params }).then(r => r.data),
  getDetail: (siteId, tankId) =>
    api.get(`/runoutprediction/${encodeURIComponent(siteId)}/${encodeURIComponent(tankId)}/detail`)
       .then(r => r.data),
}
const varianceApi = {
  getAll: (params) => api.get('/varianceanalysis', { params }).then(r => r.data),
  getDetail: (siteId, tankId, params) =>
    api.get(`/varianceanalysis/${encodeURIComponent(siteId)}/${encodeURIComponent(tankId)}/detail`, { params })
       .then(r => r.data),
}

/**
 * Lazily loads one tank's detail payload and renders a chart from it. Used for
 * the expanded row inside each site panel; the worst tank is opened by default
 * so a chart is visible without a click, but seven charts are not drawn at once.
 */
function TankChartRow({ colSpan, load, render, deps }) {
  const [state, setState] = useState({ data: null, loading: true, error: null })
  useEffect(() => {
    let cancelled = false
    setState(s => ({ ...s, loading: true }))
    load()
      .then(d => { if (!cancelled) setState({ data: d, loading: false, error: null }) })
      .catch(e => {
        if (!cancelled) setState({ data: null, loading: false, error: e.response?.data?.message || e.message })
      })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  return (
    <tr>
      <td colSpan={colSpan} style={{ padding: 0, background: 'var(--input-bg)' }}>
        {state.loading ? (
          <div style={{ padding: 16, fontSize: 12.5, color: 'var(--text-secondary)' }}>Loading chart…</div>
        ) : state.error ? (
          <div style={{ padding: 16, fontSize: 12.5, color: 'var(--red)' }}>{state.error}</div>
        ) : (
          <div style={{ padding: '12px 16px 14px' }}>{render(state.data)}</div>
        )}
      </td>
    </tr>
  )
}

const RUNOUT_STATUS = {
  critical:      { label: 'Critical',    badge: 'badge-red',    colour: 'var(--red)',        rank: 0 },
  warning:       { label: 'Warning',     badge: 'badge-orange', colour: 'var(--orange)',     rank: 1 },
  expired:       { label: 'Stale',       badge: 'badge-gray',   colour: 'var(--text-muted)', rank: 2 },
  gauge_suspect: { label: 'Gauge fault', badge: 'badge-blue',   colour: 'var(--accent)',     rank: 3 },
  ok:            { label: 'OK',          badge: 'badge-green',  colour: 'var(--green)',      rank: 4 },
  no_data:       { label: 'No data',     badge: 'badge-gray',   colour: 'var(--text-muted)', rank: 5 },
}

const SEVERITY = {
  critical: { label: 'Critical', badge: 'badge-red',    colour: 'var(--red)',        rank: 0 },
  warning:  { label: 'Warning',  badge: 'badge-orange', colour: 'var(--orange)',     rank: 1 },
  info:     { label: 'Info',     badge: 'badge-blue',   colour: 'var(--accent)',     rank: 2 },
  ok:       { label: 'OK',       badge: 'badge-green',  colour: 'var(--green)',      rank: 3 },
  unknown:  { label: 'No data',  badge: 'badge-gray',   colour: 'var(--text-muted)', rank: 4 },
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

function fmtPct(v) {
  if (v === null || v === undefined) return '—'
  const n = Number(v)
  return `${n > 0 ? '+' : ''}${n.toFixed(2)}%`
}

function fmtDays(v) {
  if (v === null || v === undefined) return '—'
  return Number(v).toFixed(1)
}

function fmtDate(d) {
  if (!d) return '—'
  const dt = new Date(d)
  if (Number.isNaN(dt.getTime())) return '—'
  return dt.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })
}

function useSiteData(fetcher, siteId) {
  const [state, setState] = useState({ data: null, loading: true, error: null })
  useEffect(() => {
    let cancelled = false
    setState(s => ({ ...s, loading: true }))
    fetcher(siteId)
      .then(d => { if (!cancelled) setState({ data: d, loading: false, error: null }) })
      .catch(e => {
        if (!cancelled) setState({ data: null, loading: false, error: e.response?.data?.message || e.message || 'Failed to load' })
      })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siteId])
  return state
}

function PanelShell({ title, subtitle, hint, linkTo, linkLabel, loading, error, empty, children }) {
  return (
    <div className="card">
      <div className="card-header">
        <span className="card-title">{title}</span>
        <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
          {subtitle && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{subtitle}</span>}
          {hint && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{hint}</span>}
          <Link to={linkTo} className="btn btn-outline btn-sm" style={{ textDecoration: 'none' }}>
            {linkLabel}
          </Link>
        </span>
      </div>
      <div className="table-responsive">
        {loading ? <div className="loading-state"><div className="spinner" />Loading…</div>
          : error ? <div className="empty-state" style={{ color: '#dc2626' }}>{error}</div>
          : empty ? <div className="empty-state">{empty}</div>
          : children}
      </div>
    </div>
  )
}

/** Worst-first run-out forecast for every tank at one site. */
export function SiteRunOutPanel({ siteId }) {
  const { data, loading, error } = useSiteData(
    id => runOutApi.getAll({ siteId: id }), siteId)

  const rows = useMemo(
    () => [...(data?.rows || [])].sort((a, b) =>
      (RUNOUT_STATUS[a.status]?.rank ?? 9) - (RUNOUT_STATUS[b.status]?.rank ?? 9)
      || (a.daysRemaining ?? 1e9) - (b.daysRemaining ?? 1e9)),
    [data])

  const worst = rows.find(r => r.status === 'critical' || r.status === 'warning')
  // Open the tank needing attention first, so a chart is on screen without a
  // click, without drawing seven charts at once.
  const [openTank, setOpenTank] = useState(null)
  const autoOpen = worst?.tankId ?? rows[0]?.tankId ?? null
  const effectiveOpen = openTank === null ? autoOpen : openTank || null

  return (
    <PanelShell
      title="Run-out Forecast"
      subtitle={data?.asOf ? `from ${String(data.asOf).slice(0, 10)} readings · assumes no delivery` : null}
      hint="Click a tank for its chart"
      linkTo={`/run-out-prediction?siteId=${encodeURIComponent(siteId)}`}
      linkLabel="Full forecast →"
      loading={loading}
      error={error}
      empty={rows.length === 0 ? 'No tanks to forecast at this site.' : null}
    >
      <>
        {worst && (
          <div style={{
            padding: '9px 16px', fontSize: 12.5, lineHeight: 1.5,
            color: 'var(--text-secondary)', borderBottom: '1px solid var(--card-border)',
            background: 'var(--table-header-bg)',
          }}>
            <strong style={{ color: RUNOUT_STATUS[worst.status]?.colour }}>
              Tank {worst.tankId} ({worst.gradeName}) needs fuel first
            </strong>{' '}
            — {fmtDays(worst.daysRemaining)} days of cover left, deliver by {fmtDate(worst.recommendedDeliveryDate)}
            {worst.recommendedVolume ? `, order about ${fmtL(worst.recommendedVolume)} L` : ''}.
          </div>
        )}
        <table className="evo-table">
          <thead>
            <tr>
              <th>Tank</th>
              <th>Grade</th>
              <th>Status</th>
              <th>Gauged (L)</th>
              <th>L / day</th>
              <th>Days left</th>
              <th>Run-out</th>
              <th>Deliver by</th>
              <th>Order (L)</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => {
              const st = RUNOUT_STATUS[r.status] || RUNOUT_STATUS.no_data
              const isOpen = effectiveOpen === r.tankId
              return (
                <Fragment key={r.tankId}>
                <tr
                  title={r.explanation}
                  onClick={() => setOpenTank(isOpen ? '' : r.tankId)}
                  style={{ cursor: 'pointer', background: isOpen ? 'var(--input-bg)' : undefined }}
                >
                  <td className="font-mono" style={{ fontWeight: 700 }}>{r.tankId}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>{r.gradeName}</td>
                  <td><span className={`badge ${st.badge}`}>{st.label}</span></td>
                  <td style={{ fontVariantNumeric: 'tabular-nums' }}>
                    {fmtL(r.lastGauged)}
                    {r.readingAgeDays > 0 && (
                      <div style={{ fontSize: 10.5, color: r.readingAgeDays > 2 ? 'var(--orange)' : 'var(--text-muted)' }}>
                        {r.readingAgeDays}d old
                      </div>
                    )}
                  </td>
                  <td style={{ fontVariantNumeric: 'tabular-nums' }}>{fmtL(r.avgDailyThroughput)}</td>
                  <td style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 650, color: st.colour, whiteSpace: 'nowrap' }}>
                    {fmtDays(r.daysRemaining)}
                    {r.typicalDaysOfCover > 0 && (
                      <div style={{ fontSize: 10.5, fontWeight: 400, color: r.belowTypical ? 'var(--red)' : 'var(--text-muted)' }}>
                        {r.belowTypical ? '↓ ' : ''}usually {fmtDays(r.typicalDaysOfCover)}
                      </div>
                    )}
                  </td>
                  <td style={{ whiteSpace: 'nowrap', fontSize: 12 }}>{fmtDate(r.runOutDate)}</td>
                  <td style={{ whiteSpace: 'nowrap', fontSize: 12, fontWeight: 600 }}>{fmtDate(r.recommendedDeliveryDate)}</td>
                  <td style={{ fontVariantNumeric: 'tabular-nums', color: 'var(--text-secondary)' }}>
                    {r.recommendedVolume ? `~${fmtL(r.recommendedVolume)}` : '—'}
                  </td>
                </tr>
                {isOpen && (
                  <TankChartRow
                    colSpan={9}
                    deps={[siteId, r.tankId]}
                    load={() => runOutApi.getDetail(siteId, r.tankId)}
                    render={d => (
                      <>
                        <div style={{ fontSize: 12, fontWeight: 650, color: 'var(--text-primary)', marginBottom: 6 }}>
                          Tank {r.tankId} — gauged stock and projection
                        </div>
                        <RunOutChart
                          history={d.history}
                          projection={d.projection}
                          minStockLitres={d.tank?.minStockLitres}
                          runOutDate={d.tank?.runOutDate}
                          height={190}
                        />
                        <ChartLegend items={[
                          ['var(--accent)', 'Gauged stock'],
                          ['var(--orange)', 'Projected', true],
                          ['var(--red)', 'Minimum stock', true],
                        ]} />
                        <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 8, lineHeight: 1.5 }}>
                          {d.tank?.explanation}
                        </div>
                      </>
                    )}
                  />
                )}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </>
    </PanelShell>
  )
}

/** Reconciliation verdict and likely cause for every tank at one site. */
export function SiteVariancePanel({ siteId }) {
  const { data, loading, error } = useSiteData(
    id => varianceApi.getAll({ siteId: id, days: 28 }), siteId)

  const rows = useMemo(
    () => [...(data?.rows || [])].sort((a, b) =>
      (SEVERITY[a.severity]?.rank ?? 9) - (SEVERITY[b.severity]?.rank ?? 9)
      || (a.variancePct ?? 0) - (b.variancePct ?? 0)),
    [data])

  const headline = rows.find(r => r.severity === 'critical' || r.severity === 'warning')
    ?? rows.find(r => r.severity === 'info')
  const [openTank, setOpenTank] = useState(null)
  const autoOpen = headline?.tankId ?? rows[0]?.tankId ?? null
  const effectiveOpen = openTank === null ? autoOpen : openTank || null

  return (
    <PanelShell
      title="Variance Analysis"
      subtitle={data?.days ? `last ${data.days} days · cause, not just litres` : null}
      hint="Click a tank for its chart"
      linkTo={`/variance-analysis?siteId=${encodeURIComponent(siteId)}`}
      linkLabel="Full analysis →"
      loading={loading}
      error={error}
      empty={rows.length === 0 ? 'No reconcilable days for this site yet.' : null}
    >
      <>
        {headline && (
          <div style={{
            padding: '9px 16px', fontSize: 12.5, lineHeight: 1.5,
            color: 'var(--text-secondary)', borderBottom: '1px solid var(--card-border)',
            background: 'var(--table-header-bg)',
          }}>
            <strong style={{ color: SEVERITY[headline.severity]?.colour }}>
              Tank {headline.tankId}: {headline.causeLabel}
            </strong>{' '}
            — {headline.explanation}
            {headline.recommendation && headline.recommendation !== 'No action.' && (
              <div style={{ marginTop: 3, color: 'var(--text-primary)' }}>
                <strong>What to do:</strong> {headline.recommendation}
              </div>
            )}
          </div>
        )}
        <table className="evo-table">
          <thead>
            <tr>
              <th>Tank</th>
              <th>Grade</th>
              <th>Severity</th>
              <th>Likely cause</th>
              <th>Variance (L)</th>
              <th>% of throughput</th>
              <th>Throughput (L)</th>
              <th>Days used</th>
              <th>Confidence</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => {
              const sv = SEVERITY[r.severity] || SEVERITY.unknown
              const isOpen = effectiveOpen === r.tankId
              return (
                <Fragment key={r.tankId}>
                <tr
                  title={`${r.explanation}\n\n${r.recommendation}`}
                  onClick={() => setOpenTank(isOpen ? '' : r.tankId)}
                  style={{ cursor: 'pointer', background: isOpen ? 'var(--input-bg)' : undefined }}
                >
                  <td className="font-mono" style={{ fontWeight: 700 }}>{r.tankId}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>{r.gradeName}</td>
                  <td><span className={`badge ${sv.badge}`}>{sv.label}</span></td>
                  <td style={{ whiteSpace: 'nowrap', fontWeight: 600 }}>
                    {r.causeLabel}
                    {r.suddenLossCount > 0 && (
                      <div style={{ fontSize: 10.5, fontWeight: 400, color: 'var(--red)' }}>
                        {r.suddenLossCount} gauge alarm{r.suddenLossCount === 1 ? '' : 's'}
                      </div>
                    )}
                  </td>
                  <td style={{
                    fontVariantNumeric: 'tabular-nums', fontWeight: 600,
                    color: r.totalVarianceL < 0 ? 'var(--red)' : 'var(--text-primary)',
                  }}>
                    {fmtSignedL(r.totalVarianceL)}
                  </td>
                  <td style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 650, color: sv.colour }}>
                    {fmtPct(r.variancePct)}
                    {r.groupPeerTanks && r.groupVariancePct !== null && r.groupVariancePct !== undefined && (
                      <div style={{ fontSize: 10.5, fontWeight: 400, color: 'var(--text-muted)' }}>
                        grade group {fmtPct(r.groupVariancePct)}
                      </div>
                    )}
                  </td>
                  <td style={{ fontVariantNumeric: 'tabular-nums', color: 'var(--text-secondary)' }}>{fmtL(r.throughputL)}</td>
                  <td style={{ fontVariantNumeric: 'tabular-nums' }}>
                    {r.quietDays}
                    {r.deliveryDays > 0 && (
                      <span style={{ color: 'var(--text-muted)', fontSize: 10.5 }}> +{r.deliveryDays} dlv</span>
                    )}
                  </td>
                  <td style={{ fontSize: 11.5, fontWeight: 600, color: ({
                    high: 'var(--green)', medium: 'var(--orange)', low: 'var(--red)',
                  })[r.confidence] || 'var(--text-muted)' }}>
                    {r.confidence === 'none' ? '—' : r.confidence}
                  </td>
                </tr>
                {isOpen && (
                  <TankChartRow
                    colSpan={9}
                    deps={[siteId, r.tankId]}
                    load={() => varianceApi.getDetail(siteId, r.tankId, { days: 28 })}
                    render={d => (
                      <>
                        <div style={{ fontSize: 12, fontWeight: 650, color: 'var(--text-primary)', marginBottom: 6 }}>
                          Tank {r.tankId} — daily unexplained litres
                        </div>
                        <VarianceChart
                          series={d.series}
                          meanDailyVarianceL={d.tank?.meanDailyVarianceL}
                          height={185}
                        />
                        <ChartLegend items={[
                          ['var(--red)', 'Unaccounted loss'],
                          ['var(--green)', 'Unaccounted gain'],
                          ['var(--card-border)', 'Delivery day (excluded)'],
                          ['var(--accent)', 'Window mean', true],
                        ]} />
                        <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 8, lineHeight: 1.5 }}>
                          {d.tank?.explanation}
                        </div>
                      </>
                    )}
                  />
                )}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </>
    </PanelShell>
  )
}
