import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import api from '../api/client'
import ErrorBoundary from '../components/ErrorBoundary'

const newIdeasApi = {
  getDataReadiness: () => api.get('/newideas/data-readiness').then(r => r.data),
}

// ---------------------------------------------------------------------------
// Roadmap content
//
// `needs` entries are keys returned by /api/newideas/data-readiness, so each
// feature's readiness badge is derived from what the database actually holds
// rather than being hardcoded here.
// ---------------------------------------------------------------------------

const GOALS = [
  { n: 1,  goal: 'Know exactly how much fuel exists',   detail: 'Accurate real-time tank inventory.',                                  needs: ['tank_readings', 'tank_capacity'] },
  { n: 2,  goal: 'Account for every litre',             detail: 'Opening + deliveries − sales = expected closing stock.',              needs: ['tank_readings', 'pump_dispensed', 'deliveries'] },
  { n: 3,  goal: 'Detect unexplained loss',             detail: 'Automatically identify abnormal variance.',                           needs: ['tank_readings', 'pump_dispensed'] },
  { n: 4,  goal: 'Explain the loss',                    detail: 'Suggest leak, theft, meter drift, delivery discrepancy, gauge issue.', needs: ['tank_readings', 'pump_dispensed', 'system_events', 'sudden_loss'], flagship: true },
  { n: 5,  goal: 'Prevent run-outs',                    detail: 'Predict when each tank reaches a critical level.',                    needs: ['tank_readings', 'tank_capacity', 'pump_dispensed'] },
  { n: 6,  goal: 'Validate deliveries',                 detail: 'Compare ordered / delivered / ATG-measured quantities.',              needs: ['deliveries', 'intraday_tank'] },
  { n: 7,  goal: 'Monitor equipment health',            detail: 'Tank gauges, probes, pumps, nozzles and communications.',             needs: ['pump_health', 'tank_gauge_health', 'flow_rates', 'flow_nominal'] },
  { n: 8,  goal: 'Prioritise alarms',                   detail: 'Say what actually needs attention instead of flooding users.',        needs: ['system_events'] },
  { n: 9,  goal: 'Manage many sites centrally',         detail: 'One dashboard showing the health of the entire estate.',              needs: ['sites', 'tank_readings', 'pump_health', 'system_events'] },
  { n: 10, goal: 'Quantify the money',                  detail: 'Convert losses, variance and downtime into £.',                       needs: ['retail_prices', 'cost_prices', 'price_history'] },
]

const FEATURES = [
  {
    n: 1,
    title: 'Fuel reconciliation engine',
    tagline: 'Opening + deliveries − sales = expected. Actual − expected = variance.',
    body: [
      'For every site / tank / product / day, compute expected closing stock and compare it to the gauged closing stock.',
      'Report variance both in litres and as a percentage of throughput — 100 L means something very different on a site selling 2,000 L than on one selling 50,000 L.',
    ],
    needs: ['tank_readings', 'pump_dispensed', 'deliveries'],
    build: 'Foundation. Everything below depends on it.',
    note: 'Buildable today with deliveries inferred rather than recorded. The day-over-day gauged change plus PumpTankConsumption already reconciles to roughly ±750 L mean absolute residual on quiet days, which is your starting noise floor.',
  },
  {
    n: 2,
    title: 'Automatic delivery detection',
    tagline: 'Spot the overnight level jump and match it to a delivery record.',
    body: [
      'Detect a sharp rise in tank level, size it, timestamp it, then associate it with the expected delivery.',
      'Report ordered vs measured vs difference, and flag short deliveries.',
    ],
    needs: ['intraday_tank', 'deliveries'],
    build: 'Blocked on data, not on code.',
    note: 'Daily gauge snapshots give you a delivery size but no window and no counterparty to compare against. A day-level "implied delivery" figure is achievable now; the timestamped version needs intraday readings.',
  },
  {
    n: 3,
    title: 'Sudden loss detection',
    tagline: 'Tank volume falls while pumps are idle.',
    body: [
      'Volume down with zero dispensing means theft, a leak, siphoning, unrecorded dispensing or a probe fault.',
      'Already partly in place: the DOMS importer parses Veeder-Root PSS "Sudden Loss" alarms into SuddenLossEvents, and the Sudden Loss page reads them.',
      'The extension is to detect loss yourself from the level series rather than only relaying the gauge\'s own alarm.',
    ],
    needs: ['intraday_tank', 'sudden_loss', 'pump_dispensed'],
    build: 'Partly shipped — the gauge-reported half works.',
    note: 'Own-detection needs intraday levels plus a time-aligned view of pump activity. Right now you are dependent on the ATG raising the alarm.',
  },
  {
    n: 4,
    title: 'Intelligent variance analysis',
    tagline: 'Do not show "−146 L". Show a likely cause and a confidence.',
    body: [
      'Meter over-dispense: tank readings consistently show ~0.7% more loss than pump totals over a rolling window.',
      'Delivery discrepancy: variance appears immediately after a delivery.',
      'Probe or tank-chart issue: variance repeats around the same tank level.',
      'This is where the product stops being a calculator and starts being useful.',
    ],
    needs: ['tank_readings', 'pump_dispensed', 'pump_vs_fp', 'system_events'],
    build: 'Built — see Variance Analysis.',
    note: 'Daily data separates most causes as predicted. In practice the biggest finding was one the list above missed: on several sites the tank-to-pump mapping is wrong, so litres show up on a neighbouring tank and look like huge losses. Ruling that out first is what stops the page crying theft.',
    done: '/variance-analysis',
  },
  {
    n: 5,
    title: 'Water monitoring',
    tagline: 'Per-tank water status, trended, with a jump alert after deliveries.',
    body: [
      'Show current water height and volume per tank with a normal / warning / critical status.',
      'Trend it and alert on a step change, especially one that coincides with a delivery.',
    ],
    needs: ['tank_water'],
    build: 'Cheap to build, but check the data first.',
    note: 'WaterVol and WaterHeight are imported but read zero on almost every row. Either the probes are not reporting water or it is being dropped on import — worth confirming against a raw DOMS file before building a page on it.',
  },
  {
    n: 6,
    title: 'Run-out prediction',
    tagline: 'Not "4,821 L" but "2.4 days left, deliver tomorrow".',
    body: [
      'Divide current stock (less unusable bottom stock) by average daily throughput to get days of cover.',
      'Later, forecast by day-of-week and hour-of-day rather than a flat average.',
    ],
    needs: ['tank_readings', 'tank_capacity', 'pump_dispensed'],
    build: 'Built — see Run-out Prediction.',
    note: 'Most tanks only have ~22 days of history (the estate-wide import began 31 Aug 2026), which is 3 samples per weekday — enough for a rough day-of-week shape, not a confident one. Hour-of-day forecasting needs intraday data.',
    done: '/run-out-prediction',
  },
  {
    n: 7,
    title: 'Flow-rate monitoring',
    tagline: 'Nozzle running at 21 L/min against a 38 L/min nominal — down 45%.',
    body: [
      'Compare average and peak flow rate to the nominal rate per nozzle and grade, and trend the degradation.',
      'Surfaces clogged filters, failing pumps, line restrictions and dispenser faults before they cause downtime.',
    ],
    needs: ['flow_rates', 'flow_nominal'],
    build: 'Measured rates are there; the baseline is not.',
    note: 'PumpFlowInfo carries average and peak rate plus time-to-flow on roughly 40,000 rows, but NominalFlowRate is 0.00 on every single row. Either fix that in the importer or derive the baseline yourself from a rolling median of each nozzle\'s own history — the latter is arguably better anyway, since it adapts per site.',
  },
  {
    n: 8,
    title: 'Estate-wide exception dashboard',
    tagline: 'The first screen should be about problems, not tanks.',
    body: [
      'Headline counts: sites, healthy, warnings, critical.',
      'Then a critical list — possible fuel loss, run-out in 9 hours, water level high, delivery discrepancy, probe offline.',
      'Drill down Company → Site → Tank → Pump → Nozzle → Event.',
    ],
    needs: ['sites', 'tank_readings', 'pump_health', 'system_events', 'sudden_loss'],
    build: 'Build once #1, #3 and #6 produce exceptions to show.',
    note: 'All the inputs exist. This is a presentation layer over the detectors above, so it should come after them rather than before.',
  },
  {
    n: 9,
    title: 'Alarm intelligence',
    tagline: 'Group 27 repeats into one incident with a duration and an impact.',
    body: [
      'Collapse repeated raw events into a single incident: what failed, when it started, how long it has run, how many events were suppressed.',
      'State the consequence — "tank stock cannot currently be reconciled" — rather than only the symptom.',
    ],
    needs: ['system_events'],
    build: 'Strong differentiator and entirely buildable now.',
    note: 'SystemEvents is already categorised with group / code / subcode and paired on/off events, which is exactly what incident grouping needs. POS online/offline alone accounts for over half of all events — a clear candidate for collapsing.',
  },
  {
    n: 10,
    title: 'Fuel-loss cost',
    tagline: '428 L is abstract. £612 is not.',
    body: [
      'Value every variance at cost and at retail, and show the margin impact.',
      'Roll it up to "potential fuel losses this month: £38,420" across the estate.',
    ],
    needs: ['retail_prices', 'cost_prices', 'price_history'],
    build: 'Retail valuation now; margin needs new data.',
    note: 'You can value a current loss at retail from FuelGradePrices. You cannot calculate margin impact (no cost price anywhere in the schema) and you cannot value a historical loss at the price of the day (FuelGradePriceHistory is empty).',
  },
  {
    n: 11,
    title: 'Fuel investigation timeline',
    tagline: 'One chronological view of everything that happened to one tank.',
    body: [
      'Interleave tank volume readings, pump activity, deliveries, alarms and POS transactions into a single timeline for an incident.',
      'Far more useful to support staff than having the same facts scattered across five screens.',
    ],
    needs: ['intraday_tank', 'system_events', 'pos_transactions', 'sudden_loss'],
    build: 'Built (day resolution) — see Fuel Timeline.',
    note: 'Built in two layers: alarms and device events at real timestamps, litres per day. It already pays for itself — at site 3188 the sudden-loss alarms land on delivery days, one of them one second before a pump totals-mismatch error, i.e. probe disturbance rather than theft. The minute-by-minute litres in the sketch below still need intraday tank levels and POS transactions.',
    done: '/fuel-timeline',
    flagship: true,
  },
]

const TIMELINE_EXAMPLE = [
  { time: '01:52', label: 'Tank volume', value: '8,921 L' },
  { time: '02:01', label: 'Pump sales stopped', value: '' },
  { time: '02:14', label: 'Tank volume', value: '8,904 L' },
  { time: '02:25', label: 'Tank volume', value: '8,861 L' },
  { time: '02:36', label: 'Tank volume', value: '8,817 L' },
  { time: '02:42', label: 'ALERT — Unexpected loss detected', value: 'Loss 104 L · POS 0 L · Deliveries 0 L · Water 0 mm → probable unrecorded fuel movement', alert: true },
  { time: '03:04', label: 'Tank volume', value: '8,802 L' },
  { time: '03:07', label: 'Pump 2 transaction', value: '42.6 L' },
]

const LAYERS = [
  { name: 'MONITOR',   detail: 'Tank levels, water, temperature, pumps, nozzles, deliveries, sales and equipment.' },
  { name: 'RECONCILE', detail: 'What physically moved versus what the POS says moved.' },
  { name: 'DETECT',    detail: 'Leaks, theft, short deliveries, meter drift, probe faults, run-outs, abnormal flow.' },
  { name: 'EXPLAIN',   detail: 'What happened, when it started, likely cause, litres affected and financial impact.' },
]

const BUILD_ORDER = [
  'Fuel reconciliation engine',
  'Automatic delivery detection',
  'Sudden loss detection',
  'Investigation timeline',
  'Estate exception dashboard',
]

// ---------------------------------------------------------------------------

const STATUS_META = {
  ready:   { badge: 'badge-green',  label: 'Ready',       rank: 0 },
  partial: { badge: 'badge-orange', label: 'Partial',     rank: 1 },
  missing: { badge: 'badge-red',    label: 'Not in DB',   rank: 2 },
  unknown: { badge: 'badge-gray',   label: 'Unknown',     rank: 3 },
}

function fmtInt(n) {
  if (n === null || n === undefined) return '—'
  return Number(n).toLocaleString()
}

function fmtDate(d) {
  if (!d) return null
  return String(d).slice(0, 10)
}

// A feature is only as ready as its weakest input.
function rollUpStatus(needs, byKey) {
  let worst = 'ready'
  for (const key of needs) {
    const s = byKey[key]?.status || 'unknown'
    if (STATUS_META[s].rank > STATUS_META[worst].rank) worst = s
  }
  return needs.length ? worst : 'unknown'
}

function StatusBadge({ status, children }) {
  const meta = STATUS_META[status] || STATUS_META.unknown
  return <span className={`badge ${meta.badge}`}>{children || meta.label}</span>
}

function SectionHeading({ kicker, title, blurb }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 0.8, textTransform: 'uppercase', color: 'var(--highlight-text)' }}>
        {kicker}
      </div>
      <h2 style={{ margin: '4px 0 0', fontSize: 18, fontWeight: 650, color: 'var(--text-primary)' }}>{title}</h2>
      {blurb && <p style={{ margin: '5px 0 0', fontSize: 12.5, color: 'var(--text-secondary)', maxWidth: 820, lineHeight: 1.55 }}>{blurb}</p>}
    </div>
  )
}

function NeedChip({ srcKey, byKey }) {
  const src = byKey[srcKey]
  const status = src?.status || 'unknown'
  const meta = STATUS_META[status]
  const dot = status === 'ready' ? 'var(--green)' : status === 'partial' ? 'var(--orange)' : status === 'missing' ? 'var(--red)' : 'var(--text-muted)'
  return (
    <span
      title={src ? `${src.source}\n${src.note}` : srcKey}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 5,
        padding: '2px 8px', borderRadius: 11, fontSize: 11,
        background: 'var(--input-bg)', color: 'var(--text-secondary)',
        border: '1px solid var(--card-border)', whiteSpace: 'nowrap',
      }}
    >
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: dot, flexShrink: 0 }} />
      {src?.label || srcKey}
      <span style={{ color: 'var(--text-muted)', fontSize: 10 }}>{meta.label}</span>
    </span>
  )
}

export default function NewIdeas() {
  const [sources, setSources] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [filter, setFilter] = useState('all')

  useEffect(() => {
    setLoading(true)
    newIdeasApi.getDataReadiness()
      .then(d => { setSources(d?.sources || []); setError(null) })
      .catch(e => setError(e.response?.data?.message || e.message || 'Failed to load data readiness'))
      .finally(() => setLoading(false))
  }, [])

  const byKey = useMemo(() => Object.fromEntries(sources.map(s => [s.key, s])), [sources])

  const counts = useMemo(() => {
    const c = { ready: 0, partial: 0, missing: 0 }
    for (const s of sources) if (c[s.status] !== undefined) c[s.status]++
    return c
  }, [sources])

  const gaps = useMemo(
    () => sources.filter(s => s.status === 'missing' || s.status === 'partial')
                 .sort((a, b) => STATUS_META[b.status].rank - STATUS_META[a.status].rank),
    [sources]
  )

  const visibleSources = useMemo(
    () => filter === 'all' ? sources : sources.filter(s => s.status === filter),
    [sources, filter]
  )

  return (
    <ErrorBoundary>
      <div className="page-content">
        <div className="page-header">
          <div>
            <h1 className="page-title">New Ideas</h1>
            <p className="page-subtitle">
              Where EvoFlow could go next, and whether the database can support it yet.
            </p>
          </div>
        </div>

        {/* ---------------- The target ---------------- */}
        <div className="card" style={{ marginBottom: 16, borderLeft: '3px solid var(--accent)' }}>
          <div style={{ padding: '14px 16px' }}>
            <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 0.8, textTransform: 'uppercase', color: 'var(--accent)', marginBottom: 6 }}>
              Longer-term target
            </div>
            <p style={{ margin: 0, fontSize: 14.5, lineHeight: 1.6, color: 'var(--text-primary)', maxWidth: 900 }}>
              EvoFlow should account for every litre of fuel from <strong>delivery → tank → pump → nozzle → POS transaction</strong>,
              and automatically identify anything that doesn't reconcile.
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 14 }}>
              {LAYERS.map((l, i) => (
                <div key={l.name} style={{ display: 'flex', alignItems: 'stretch', gap: 8, flex: '1 1 200px', minWidth: 190 }}>
                  <div style={{
                    flex: 1, background: 'var(--input-bg)', border: '1px solid var(--card-border)',
                    borderRadius: 8, padding: '9px 11px',
                  }}>
                    <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.6, color: 'var(--accent)' }}>{l.name}</div>
                    <div style={{ fontSize: 11.5, color: 'var(--text-secondary)', marginTop: 3, lineHeight: 1.45 }}>{l.detail}</div>
                  </div>
                  {i < LAYERS.length - 1 && (
                    <div style={{ alignSelf: 'center', color: 'var(--text-muted)', fontSize: 15 }}>→</div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ---------------- Data readiness ---------------- */}
        <div style={{ marginTop: 22 }}>
          <SectionHeading
            kicker="Section 1"
            title="Data readiness"
            blurb="Checked live against the EvoFlow database each time this page loads. A feature can only be as ready as its weakest input, so start here before committing to anything below."
          />
        </div>

        {error && (
          <div className="card" style={{ padding: 14, marginBottom: 14, borderLeft: '3px solid var(--red)' }}>
            <span style={{ color: 'var(--red)', fontSize: 13 }}>{error}</span>
          </div>
        )}

        {loading ? (
          <div className="card" style={{ padding: 22, textAlign: 'center', color: 'var(--text-secondary)', fontSize: 13 }}>
            Checking the database…
          </div>
        ) : (
          <>
            {/* What's missing — the headline answer */}
            {gaps.length > 0 && (
              <div className="card" style={{ marginBottom: 14, borderLeft: '3px solid var(--red)' }}>
                <div className="card-header">
                  <h3 className="card-title">What you don't have yet</h3>
                  <span className="badge badge-gray">{gaps.length} gap{gaps.length === 1 ? '' : 's'}</span>
                </div>
                <div style={{ padding: '0 16px 14px' }}>
                  {gaps.map(g => (
                    <div key={g.key} style={{
                      display: 'flex', gap: 10, alignItems: 'flex-start',
                      padding: '9px 0', borderTop: '1px solid var(--card-border)',
                    }}>
                      <StatusBadge status={g.status} />
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{g.label}</div>
                        <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2, lineHeight: 1.5 }}>{g.note}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3, fontFamily: 'ui-monospace, monospace' }}>{g.source}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="card" style={{ marginBottom: 14 }}>
              <div className="card-header">
                <h3 className="card-title">All data sources</h3>
                <div style={{ display: 'flex', gap: 6 }}>
                  {[
                    ['all', `All ${sources.length}`],
                    ['ready', `Ready ${counts.ready}`],
                    ['partial', `Partial ${counts.partial}`],
                    ['missing', `Missing ${counts.missing}`],
                  ].map(([k, label]) => (
                    <button
                      key={k}
                      className={`btn-tag${filter === k ? ' active' : ''}`}
                      onClick={() => setFilter(k)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="table-responsive">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Status</th>
                      <th>Data</th>
                      <th style={{ textAlign: 'right' }}>Rows</th>
                      <th>Covering</th>
                      <th>Where it lives / what's missing</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleSources.map(s => (
                      <tr key={s.key}>
                        <td><StatusBadge status={s.status} /></td>
                        <td style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{s.label}</td>
                        <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                          {s.rows > 0 ? fmtInt(s.rows) : <span style={{ color: 'var(--text-muted)' }}>0</span>}
                        </td>
                        <td style={{ whiteSpace: 'nowrap', fontSize: 11.5, color: 'var(--text-secondary)' }}>
                          {s.firstDate ? `${fmtDate(s.firstDate)} → ${fmtDate(s.lastDate)}` : '—'}
                        </td>
                        <td style={{ maxWidth: 520 }}>
                          <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'ui-monospace, monospace' }}>{s.source}</div>
                          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2, lineHeight: 1.45 }}>{s.note}</div>
                        </td>
                      </tr>
                    ))}
                    {visibleSources.length === 0 && (
                      <tr><td colSpan={5} style={{ textAlign: 'center', padding: 18, color: 'var(--text-secondary)' }}>Nothing in this category.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {/* ---------------- Product goals ---------------- */}
        <div style={{ marginTop: 26 }}>
          <SectionHeading
            kicker="Section 2"
            title="Ten product goals"
            blurb="Organise development around outcomes rather than screens. Goal 4 — explaining the loss rather than just reporting it — is the one that decides whether EvoFlow is a report or a product."
          />
        </div>
        <div className="card" style={{ marginBottom: 14 }}>
          <div className="table-responsive">
            <table className="table">
              <thead>
                <tr>
                  <th style={{ width: 34 }}>#</th>
                  <th>Goal</th>
                  <th>What it means</th>
                  <th style={{ whiteSpace: 'nowrap' }}>Data ready?</th>
                </tr>
              </thead>
              <tbody>
                {GOALS.map(g => {
                  const status = rollUpStatus(g.needs, byKey)
                  return (
                    <tr key={g.n} style={g.flagship ? { background: 'var(--accent-light)' } : undefined}>
                      <td style={{ fontWeight: 700, color: 'var(--text-muted)' }}>{g.n}</td>
                      <td style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>
                        {g.goal}
                        {g.flagship && <span className="badge badge-blue" style={{ marginLeft: 7 }}>Most important</span>}
                      </td>
                      <td style={{ color: 'var(--text-secondary)' }}>{g.detail}</td>
                      <td>{loading ? '—' : <StatusBadge status={status} />}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* ---------------- Feature roadmap ---------------- */}
        <div style={{ marginTop: 26 }}>
          <SectionHeading
            kicker="Section 3"
            title="Feature roadmap"
            blurb="Roughly in build order. Each card lists the data it depends on, colour-coded by what the database actually holds — hover a chip to see the underlying table."
          />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(380px, 1fr))', gap: 12 }}>
          {FEATURES.map(f => {
            const status = rollUpStatus(f.needs, byKey)
            return (
              <div
                key={f.n}
                className="card"
                style={{
                  padding: '14px 16px',
                  borderLeft: `3px solid ${f.flagship ? 'var(--accent)' : 'var(--card-border)'}`,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 9, minWidth: 0 }}>
                    <span style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-muted)', lineHeight: 1 }}>{f.n}</span>
                    <div style={{ minWidth: 0 }}>
                      <h3 style={{ margin: 0, fontSize: 14.5, fontWeight: 650, color: 'var(--text-primary)' }}>
                        {f.title}
                        {f.flagship && <span className="badge badge-blue" style={{ marginLeft: 7, verticalAlign: 'middle' }}>Flagship</span>}
                        {f.done && (
                          <Link to={f.done} className="badge badge-green" style={{ marginLeft: 7, verticalAlign: 'middle', textDecoration: 'none' }}>
                            Built — open →
                          </Link>
                        )}
                      </h3>
                      <div style={{ fontSize: 12, color: 'var(--accent)', marginTop: 2 }}>{f.tagline}</div>
                    </div>
                  </div>
                  {!loading && <StatusBadge status={status} />}
                </div>

                <ul style={{ margin: '11px 0 0', paddingLeft: 17, fontSize: 12.5, color: 'var(--text-secondary)', lineHeight: 1.55 }}>
                  {f.body.map((b, i) => <li key={i} style={{ marginBottom: 3 }}>{b}</li>)}
                </ul>

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 11 }}>
                  {f.needs.map(k => <NeedChip key={k} srcKey={k} byKey={byKey} />)}
                </div>

                <div style={{
                  marginTop: 11, paddingTop: 10, borderTop: '1px solid var(--card-border)',
                  fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5,
                }}>
                  <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: 2 }}>{f.build}</div>
                  {f.note}
                </div>
              </div>
            )
          })}
        </div>

        {/* ---------------- Investigation timeline ---------------- */}
        <div style={{ marginTop: 26 }}>
          <SectionHeading
            kicker="Section 4"
            title="Fuel investigation timeline"
            blurb="The feature that would make EvoFlow genuinely good: one chronological view of an incident, instead of tank readings, transactions, deliveries and DOMS events scattered across five screens."
          />
        </div>
        <div className="card" style={{ marginBottom: 14 }}>
          <div className="card-header">
            <h3 className="card-title">Site 1001 — Tank 2 — Diesel</h3>
            <span className="badge badge-gray">Sketch, not live data</span>
          </div>
          <div style={{ padding: '4px 16px 16px' }}>
            {TIMELINE_EXAMPLE.map((e, i) => (
              <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', padding: '7px 0' }}>
                <div style={{
                  fontFamily: 'ui-monospace, monospace', fontSize: 12,
                  color: 'var(--text-muted)', width: 46, flexShrink: 0, paddingTop: 1,
                }}>
                  {e.time}
                </div>
                <div style={{
                  width: 9, height: 9, borderRadius: '50%', marginTop: 4, flexShrink: 0,
                  background: e.alert ? 'var(--red)' : 'var(--accent)',
                  boxShadow: e.alert ? '0 0 0 3px var(--red-light)' : 'none',
                }} />
                <div style={{ minWidth: 0 }}>
                  <div style={{
                    fontSize: 13, fontWeight: e.alert ? 700 : 500,
                    color: e.alert ? 'var(--red)' : 'var(--text-primary)',
                  }}>
                    {e.label}
                  </div>
                  {e.value && (
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 1, lineHeight: 1.45 }}>{e.value}</div>
                  )}
                </div>
              </div>
            ))}
            <div style={{
              marginTop: 10, padding: '10px 12px', borderRadius: 8,
              background: 'var(--input-bg)', border: '1px solid var(--card-border)',
              fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.55,
            }}>
              <strong style={{ color: 'var(--text-primary)' }}>To build this as shown</strong> you need tank levels every few
              minutes and POS transactions — neither of which is in the database today. A day-resolution version
              (opening stock, dispensed, implied delivery, alarms raised that day) is buildable now from TankGauges,
              PumpTankConsumption and SystemEvents, and would already beat jumping between screens.
            </div>
          </div>
        </div>

        {/* ---------------- Build order ---------------- */}
        <div style={{ marginTop: 26 }}>
          <SectionHeading
            kicker="Section 5"
            title="Suggested order"
            blurb="Do these before trying to replicate every feature of the big ATG platforms. It gets you to a genuinely useful monitoring product quickly."
          />
        </div>
        <div className="card" style={{ marginBottom: 24 }}>
          <div style={{ padding: 16, display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
            {BUILD_ORDER.map((step, i) => (
              <div key={step} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '8px 13px', borderRadius: 8,
                  background: 'var(--input-bg)', border: '1px solid var(--card-border)',
                }}>
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    width: 19, height: 19, borderRadius: '50%',
                    background: 'var(--accent)', color: '#fff', fontSize: 11, fontWeight: 700,
                  }}>
                    {i + 1}
                  </span>
                  <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-primary)' }}>{step}</span>
                </div>
                {i < BUILD_ORDER.length - 1 && <span style={{ color: 'var(--text-muted)' }}>→</span>}
              </div>
            ))}
          </div>
        </div>
      </div>
    </ErrorBoundary>
  )
}
