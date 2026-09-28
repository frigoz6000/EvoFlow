import { useEffect, useMemo, useState, Fragment } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import api, { sitesApi } from '../api/client'
import ErrorBoundary from '../components/ErrorBoundary'
import { RunOutChart, ChartLegend } from '../components/TankCharts'

const runOutApi = {
  getAll: (params = {}) => api.get('/runoutprediction', { params }).then(r => r.data),
  getDetail: (siteId, tankId, params = {}) =>
    api.get(`/runoutprediction/${encodeURIComponent(siteId)}/${encodeURIComponent(tankId)}/detail`, { params })
       .then(r => r.data),
}

const STATUS_META = {
  critical:      { label: 'Critical',     badge: 'badge-red',    colour: 'var(--red)',    rank: 0 },
  warning:       { label: 'Warning',      badge: 'badge-orange', colour: 'var(--orange)', rank: 1 },
  expired:       { label: 'Stale',        badge: 'badge-gray',   colour: 'var(--text-muted)', rank: 2 },
  gauge_suspect: { label: 'Gauge fault',  badge: 'badge-blue',   colour: 'var(--accent)', rank: 3 },
  ok:            { label: 'OK',           badge: 'badge-green',  colour: 'var(--green)',  rank: 4 },
  no_data:       { label: 'No data',      badge: 'badge-gray',   colour: 'var(--text-muted)', rank: 5 },
}

const CONFIDENCE_META = {
  high:   { label: 'High',   colour: 'var(--green)' },
  medium: { label: 'Medium', colour: 'var(--orange)' },
  low:    { label: 'Low',    colour: 'var(--red)' },
  none:   { label: '—',      colour: 'var(--text-muted)' },
}

const DEFAULTS = {
  lookbackDays: 28,
  minStockPct: 5,
  criticalDays: 1,
  warningDays: 2,
}

function fmtL(v) {
  if (v === null || v === undefined) return '—'
  return `${Number(v).toLocaleString(undefined, { maximumFractionDigits: 0 })}`
}

function fmtDays(v) {
  if (v === null || v === undefined) return '—'
  return Number(v).toFixed(1)
}

function fmtDate(d, opts = { day: 'numeric', month: 'short' }) {
  if (!d) return '—'
  const dt = new Date(d)
  if (Number.isNaN(dt.getTime())) return '—'
  return dt.toLocaleDateString(undefined, { weekday: 'short', ...opts })
}

function isoDate(d) {
  if (!d) return null
  return String(d).slice(0, 10)
}

function SortIcon({ col, sortCol, sortDir }) {
  if (sortCol !== col) return <span style={{ opacity: 0.3, marginLeft: 4, fontSize: 10 }}>↕</span>
  return <span style={{ marginLeft: 4, fontSize: 10 }}>{sortDir === 'asc' ? '↑' : '↓'}</span>
}

const PAGE_SIZE = 100

// Captured once at module load so render stays pure; only used to tell the user
// how far behind real time the loaded data is.
const TODAY_ISO = new Date().toISOString().slice(0, 10)

// Column definitions drive the header, the sort and the per-column filters, so
// the three can never drift apart.
//   sort: value used for ordering
//   text: what the filter box matches against (the displayed value, not the raw row)
//   type: 'num' also accepts >, <, >=, <=, = and "a-b" ranges
const COLUMNS = [
  { key: 'status', label: 'Status', placeholder: 'critical…', type: 'text',
    sort: r => STATUS_META[r.status]?.rank ?? 99,
    text: r => STATUS_META[r.status]?.label ?? r.status },
  { key: 'site', label: 'Site / Tank', placeholder: 'site or tank…', type: 'text',
    sort: r => `${r.siteName} ${r.tankId}`,
    text: r => `${r.siteName} ${r.siteId} tank ${r.tankId}` },
  { key: 'grade', label: 'Grade', placeholder: 'diesel…', type: 'text',
    sort: r => r.gradeName, text: r => r.gradeName },
  { key: 'fill', label: 'Fill', placeholder: '<25', type: 'num',
    sort: r => fillPct(r), text: r => fillPct(r) },
  { key: 'stock', label: 'Gauged (L)', placeholder: '<5000', type: 'num',
    sort: r => r.lastGauged, text: r => r.lastGauged },
  { key: 'rate', label: 'L / day', placeholder: '>10000', type: 'num',
    sort: r => r.avgDailyThroughput ?? -1, text: r => r.avgDailyThroughput },
  { key: 'cover', label: 'Days left', placeholder: '<1', type: 'num',
    sort: r => r.daysRemaining ?? Number.MAX_SAFE_INTEGER, text: r => r.daysRemaining },
  { key: 'runout', label: 'Run-out', placeholder: 'date…', type: 'text',
    sort: r => r.runOutDate || '9999', text: r => isoDate(r.runOutDate) },
  { key: 'order', label: 'Deliver by / order', placeholder: 'date or litres…', type: 'text',
    sort: r => r.recommendedVolume ?? -1,
    text: r => `${isoDate(r.recommendedDeliveryDate) ?? ''} ${r.recommendedVolume ?? ''}` },
  { key: 'confidence', label: 'Confidence', placeholder: 'high…', type: 'text',
    sort: r => CONFIDENCE_RANK[r.confidence] ?? 99,
    text: r => CONFIDENCE_META[r.confidence]?.label ?? r.confidence },
]

const CONFIDENCE_RANK = { high: 0, medium: 1, low: 2, none: 3 }

const FILTER_LEGEND = [
  ['asda', 'contains'],
  ['!asda', 'does not contain'],
  ['asda !tamworth', 'both rules apply'],
  ['critical|warning', 'either one'],
  ['"bridge of dee"', 'exact phrase'],
  ['<1  >=5  <>0', 'compare (number columns)'],
  ['2..5', 'between (number columns)'],
  ['!', 'the button flips the whole box to exclude'],
]

const FILTER_HINT = [
  'Filter this column. Terms are combined, so "asda !tamworth" keeps Asda sites but drops Tamworth.',
  '  !term            exclude anything matching term',
  '  a|b              match either',
  '  "two words"      exact phrase',
  '  <1  >=5  <>0     compare (number columns)',
  '  2..5             between (number columns)',
  'The ! button beside the box flips the whole filter to exclude.',
].join('\n')

function fillPct(r) {
  return r.capacity > 0 ? Math.round((r.lastGauged / r.capacity) * 100) : 0
}

// A column filter is a list of whitespace-separated terms, ANDed together.
// A term may be quoted ("bridge of dee"), negated (!asda), or a set of
// alternatives (critical|warning). A leading "-" also negates, but only when it
// is not part of a negative number - "Days left" genuinely goes negative.
const FILTER_TOKEN_RE = /(!|-(?![\d.]))?(?:"([^"]*)"|(\S+))/g

function parseFilterTerms(query) {
  const terms = []
  let m
  FILTER_TOKEN_RE.lastIndex = 0
  while ((m = FILTER_TOKEN_RE.exec(query)) !== null) {
    const body = (m[2] !== undefined ? m[2] : m[3] || '').trim().toLowerCase()
    if (!body) continue
    const alternatives = body.split('|').filter(Boolean)
    if (alternatives.length) terms.push({ negate: Boolean(m[1]), alternatives })
  }
  return terms
}

/** One alternative against one cell value. Numeric columns also understand
 *  >, <, >=, <=, <>, = and "a..b" ranges; anything else is a substring match. */
function matchesAtom(col, atom, value) {
  if (col.type === 'num') {
    const n = typeof value === 'number' ? value : parseFloat(value)
    const cmp = atom.match(/^(>=|<=|<>|>|<|=)(-?\d+(?:\.\d+)?)$/)
    if (cmp) {
      if (!Number.isFinite(n)) return false
      const target = parseFloat(cmp[2])
      switch (cmp[1]) {
        case '>':  return n >  target
        case '<':  return n <  target
        case '>=': return n >= target
        case '<=': return n <= target
        case '<>': return n !== target
        default:   return n === target
      }
    }
    const range = atom.match(/^(-?\d+(?:\.\d+)?)\.\.(-?\d+(?:\.\d+)?)$/)
    if (range) {
      if (!Number.isFinite(n)) return false
      return n >= parseFloat(range[1]) && n <= parseFloat(range[2])
    }
  }
  return String(value ?? '').toLowerCase().includes(atom)
}

/** Matches one column filter. `exclude` inverts the whole result, which is what
 *  the "!" button next to the box toggles. */
function matchesFilter(col, query, row, exclude = false) {
  const terms = parseFilterTerms(query)
  if (!terms.length) return true

  const value = col.text(row)
  let hit = true
  for (const term of terms) {
    const found = term.alternatives.some(a => matchesAtom(col, a, value))
    if (term.negate ? found : !found) { hit = false; break }
  }
  return exclude ? !hit : hit
}

function StatTile({ label, value, colour, active, onClick }) {
  return (
    <button
      onClick={onClick}
      className="card"
      style={{
        flex: '1 1 130px', minWidth: 118, padding: '11px 13px', textAlign: 'left',
        cursor: 'pointer', border: active ? `1.5px solid ${colour}` : '1px solid var(--card-border)',
        background: active ? 'var(--input-bg)' : 'var(--card-bg)',
      }}
    >
      <div style={{ fontSize: 22, fontWeight: 700, color: colour, lineHeight: 1.1 }}>{value}</div>
      <div style={{ fontSize: 11.5, color: 'var(--text-secondary)', marginTop: 2 }}>{label}</div>
    </button>
  )
}

/** Horizontal fill gauge, with the minimum-stock line marked. */
function FillBar({ percent, minPct, colour }) {
  const p = Math.max(0, Math.min(100, Number(percent) || 0))
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
      <div style={{
        position: 'relative', width: 58, height: 8, borderRadius: 4,
        background: 'var(--input-bg)', border: '1px solid var(--card-border)', overflow: 'hidden', flexShrink: 0,
      }}>
        <div style={{ width: `${p}%`, height: '100%', background: colour }} />
        {minPct > 0 && minPct < 100 && (
          <div style={{
            position: 'absolute', left: `${minPct}%`, top: 0, bottom: 0,
            width: 1.5, background: 'var(--text-primary)', opacity: 0.55,
          }} />
        )}
      </div>
      <span style={{ fontSize: 11.5, color: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums' }}>
        {p.toFixed(0)}%
      </span>
    </div>
  )
}

/** Expanded row: actual gauged history plus the forward projection. */
function TankDetail({ siteId, tankId, params }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    runOutApi.getDetail(siteId, tankId, params)
      .then(d => { if (!cancelled) { setData(d); setError(null) } })
      .catch(e => { if (!cancelled) setError(e.response?.data?.message || e.message) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siteId, tankId, JSON.stringify(params)])

  if (loading) {
    return <div style={{ padding: 18, color: 'var(--text-secondary)', fontSize: 12.5 }}>Loading tank history…</div>
  }
  if (error) {
    return <div style={{ padding: 18, color: 'var(--red)', fontSize: 12.5 }}>{error}</div>
  }
  if (!data) return null

  const t = data.tank
  const minStock = Number(t.minStockLitres) || 0
  const dowIndex = data.dowIndex || []
  const dowNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

  return (
    <div style={{ padding: '14px 16px', background: 'var(--input-bg)' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
        <div style={{ flex: '1 1 460px', minWidth: 300 }}>
          <div style={{ fontSize: 12, fontWeight: 650, color: 'var(--text-primary)', marginBottom: 6 }}>
            Gauged stock and projection
          </div>
          <RunOutChart
            history={data.history}
            projection={data.projection}
            minStockLitres={minStock}
            runOutDate={t.runOutDate}
          />
          <ChartLegend items={[
            ['var(--accent)', 'Gauged stock'],
            ['var(--orange)', 'Projected', true],
            ['var(--red)', 'Minimum stock', true],
          ]} />
        </div>

        <div style={{ flex: '1 1 260px', minWidth: 240 }}>
          <div style={{ fontSize: 12, fontWeight: 650, color: 'var(--text-primary)', marginBottom: 6 }}>
            Why this forecast
          </div>
          <p style={{ margin: '0 0 10px', fontSize: 12.5, lineHeight: 1.55, color: 'var(--text-secondary)' }}>
            {t.explanation}
          </p>

          <div style={{ fontSize: 11.5, fontWeight: 650, color: 'var(--text-primary)', marginBottom: 4 }}>
            Day-of-week demand shape
          </div>
          <div style={{ display: 'flex', gap: 3, alignItems: 'flex-end', height: 42, marginBottom: 4 }}>
            {dowIndex.map((v, i) => {
              const h = Math.max(4, Math.min(100, (Number(v) / 1.6) * 100))
              return (
                <div key={i} style={{ flex: 1, textAlign: 'center' }} title={`${dowNames[i]}: ${Number(v).toFixed(2)}×`}>
                  <div style={{
                    height: `${h}%`, minHeight: 4, borderRadius: '3px 3px 0 0',
                    background: Number(v) >= 1 ? 'var(--accent)' : 'var(--card-border)',
                  }} />
                </div>
              )
            })}
          </div>
          <div style={{ display: 'flex', gap: 3 }}>
            {dowNames.map(n => (
              <div key={n} style={{ flex: 1, textAlign: 'center', fontSize: 9.5, color: 'var(--text-muted)' }}>{n}</div>
            ))}
          </div>

          <div style={{
            marginTop: 11, paddingTop: 9, borderTop: '1px solid var(--card-border)',
            display: 'grid', gridTemplateColumns: '1fr auto', gap: '3px 10px', fontSize: 12,
          }}>
            <span style={{ color: 'var(--text-secondary)' }}>Capacity</span>
            <span style={{ fontVariantNumeric: 'tabular-nums' }}>{fmtL(t.capacity)} L</span>
            <span style={{ color: 'var(--text-secondary)' }}>Minimum stock</span>
            <span style={{ fontVariantNumeric: 'tabular-nums' }}>{fmtL(t.minStockLitres)} L</span>
            <span style={{ color: 'var(--text-secondary)' }}>Throughput variability</span>
            <span style={{ fontVariantNumeric: 'tabular-nums' }}>
              {t.throughputCv === null || t.throughputCv === undefined ? '—' : `±${Math.round(t.throughputCv * 100)}%`}
            </span>
            <span style={{ color: 'var(--text-secondary)' }}>Next day's expected draw</span>
            <span style={{ fontVariantNumeric: 'tabular-nums' }}>{fmtL(t.tomorrowThroughput)} L</span>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function RunOutPrediction() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  const [sites, setSites] = useState([])
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [filters, setFilters] = useState({
    siteId: searchParams.get('siteId') || '',
    ...DEFAULTS,
  })
  const [applied, setApplied] = useState({ siteId: searchParams.get('siteId') || '', ...DEFAULTS })
  const [statusFilter, setStatusFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [colFilters, setColFilters] = useState({})
  const [colExclude, setColExclude] = useState({})
  const [showLegend, setShowLegend] = useState(false)
  const [sortCol, setSortCol] = useState('status')
  const [sortDir, setSortDir] = useState('asc')
  const [expanded, setExpanded] = useState(null)
  const [page, setPage] = useState(1)

  useEffect(() => {
    sitesApi.getAll().then(s => setSites(s || [])).catch(() => {})
  }, [])

  useEffect(() => {
    setLoading(true)
    const params = { ...applied }
    if (!params.siteId) delete params.siteId
    runOutApi.getAll(params)
      .then(d => { setData(d); setError(null) })
      .catch(e => setError(e.response?.data?.message || e.message || 'Failed to load run-out predictions'))
      .finally(() => setLoading(false))
  }, [applied])

  const rows = useMemo(() => data?.rows || [], [data])
  const summary = data?.summary || {}

  const detailParams = useMemo(() => ({
    lookbackDays: applied.lookbackDays,
    minStockPct: applied.minStockPct,
    criticalDays: applied.criticalDays,
    warningDays: applied.warningDays,
  }), [applied])

  const activeColFilters = useMemo(
    () => COLUMNS.filter(c => (colFilters[c.key] || '').trim() !== ''),
    [colFilters]
  )

  const displayRows = useMemo(() => {
    let out = rows

    if (statusFilter !== 'all') out = out.filter(r => r.status === statusFilter)

    const q = search.trim().toLowerCase()
    if (q) {
      out = out.filter(r =>
        (r.siteId || '').toLowerCase().includes(q) ||
        (r.siteName || '').toLowerCase().includes(q) ||
        (r.gradeName || '').toLowerCase().includes(q) ||
        (r.tankId || '').toLowerCase().includes(q))
    }

    for (const col of activeColFilters) {
      out = out.filter(r => matchesFilter(col, colFilters[col.key], r, !!colExclude[col.key]))
    }

    const col = COLUMNS.find(c => c.key === sortCol)
    if (!col) return out

    const dir = sortDir === 'asc' ? 1 : -1
    return [...out].sort((a, b) => {
      const av = col.sort(a), bv = col.sort(b)
      // Ties fall back to site/tank so the order never jitters between renders.
      if (av === bv) return (a.siteId + a.tankId).localeCompare(b.siteId + b.tankId)
      if (typeof av === 'string' || typeof bv === 'string') {
        return String(av).localeCompare(String(bv)) * dir
      }
      return (av - bv) * dir
    })
  }, [rows, statusFilter, search, colFilters, colExclude, activeColFilters, sortCol, sortDir])

  const totalPages = Math.max(1, Math.ceil(displayRows.length / PAGE_SIZE))
  // Derived rather than corrected in an effect, so filtering down to fewer pages
  // while on a high page number can never render an empty grid.
  const safePage = Math.min(Math.max(1, page), totalPages)
  const pageRows = useMemo(
    () => displayRows.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE),
    [displayRows, safePage]
  )

  // Anything that changes what is shown sends the user back to page 1.
  function toggleSort(col) {
    if (sortCol === col) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortCol(col); setSortDir('asc') }
    setPage(1)
  }

  function setColFilter(key, value) {
    setColFilters(f => ({ ...f, [key]: value }))
    setExpanded(null)
    setPage(1)
  }

  function toggleColExclude(key) {
    setColExclude(e => ({ ...e, [key]: !e[key] }))
    setExpanded(null)
    setPage(1)
  }

  function clearColFilters() {
    setColFilters({})
    setColExclude({})
    setExpanded(null)
    setPage(1)
  }

  function changeSearch(value) {
    setSearch(value)
    setExpanded(null)
    setPage(1)
  }

  function changeStatusFilter(value) {
    setStatusFilter(value)
    setExpanded(null)
    setPage(1)
  }

  function apply() {
    setExpanded(null)
    setApplied({ ...filters })
  }

  function reset() {
    const next = { siteId: '', ...DEFAULTS }
    setFilters(next)
    setApplied(next)
    setStatusFilter('all')
    setSearch('')
    setColFilters({})
    setColExclude({})
    setExpanded(null)
    setPage(1)
  }

  const asOf = data?.asOf ? isoDate(data.asOf) : null
  const staleDays = asOf
    ? Math.round(
        (new Date(`${TODAY_ISO}T00:00:00`).getTime() - new Date(`${asOf}T00:00:00`).getTime()) / 86400000
      )
    : null

  return (
    <ErrorBoundary>
      <div className="page-content">
        <div className="page-header">
          <div>
            <h1 className="page-title">Run-out Prediction</h1>
            <p className="page-subtitle">
              When each tank reaches minimum stock if nothing is delivered, and the latest day fuel can still arrive.
            </p>
          </div>
        </div>

        {/* Assumption banner - the forecast is only honest if these are stated. */}
        <div className="card" style={{ marginBottom: 14, borderLeft: '3px solid var(--accent)' }}>
          <div style={{ padding: '11px 14px', fontSize: 12.5, color: 'var(--text-secondary)', lineHeight: 1.55 }}>
            <strong style={{ color: 'var(--text-primary)' }}>Assumes no further deliveries.</strong>{' '}
            Nothing in the database records planned or actual deliveries, so this answers
            “when must fuel arrive by”, not “will the tank run dry”. Minimum stock defaults to{' '}
            {applied.minStockPct}% of capacity because unusable bottom stock is not recorded either.
            Cover is measured from each tank's own last gauged reading; where that reading is old
            enough that the run-out date has already passed, the tank is marked{' '}
            <strong style={{ color: 'var(--text-primary)' }}>Stale</strong> rather than Critical — it has
            almost certainly been delivered since, and needs a fresh gauge reading, not a tanker.
            {asOf && (
              <> Latest loaded activity date is <strong style={{ color: 'var(--text-primary)' }}>{asOf}</strong>
                {staleDays > 1 && <>, {staleDays} days behind today, so re-import before acting on this</>}.
              </>
            )}
          </div>
        </div>

        {/* Summary tiles double as status filters */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 9, marginBottom: 14 }}>
          <StatTile label="Tanks" value={summary.tanks ?? '—'} colour="var(--text-primary)"
                    active={statusFilter === 'all'} onClick={() => changeStatusFilter('all')} />
          <StatTile label="Critical" value={summary.critical ?? '—'} colour="var(--red)"
                    active={statusFilter === 'critical'} onClick={() => changeStatusFilter('critical')} />
          <StatTile label="Warning" value={summary.warning ?? '—'} colour="var(--orange)"
                    active={statusFilter === 'warning'} onClick={() => changeStatusFilter('warning')} />
          <StatTile label="OK" value={summary.ok ?? '—'} colour="var(--green)"
                    active={statusFilter === 'ok'} onClick={() => changeStatusFilter('ok')} />
          <StatTile label="Stale forecast" value={summary.expired ?? '—'} colour="var(--text-muted)"
                    active={statusFilter === 'expired'} onClick={() => changeStatusFilter('expired')} />
          <StatTile label="Gauge fault" value={summary.gaugeSuspect ?? '—'} colour="var(--accent)"
                    active={statusFilter === 'gauge_suspect'} onClick={() => changeStatusFilter('gauge_suspect')} />
          <StatTile label="No data" value={summary.noData ?? '—'} colour="var(--text-muted)"
                    active={statusFilter === 'no_data'} onClick={() => changeStatusFilter('no_data')} />
        </div>

        {/* Controls */}
        <div className="card" style={{ marginBottom: 14 }}>
          <div className="filters-bar">
            <select
              className="filter-select" style={{ minWidth: 190 }}
              value={filters.siteId}
              onChange={e => setFilters(f => ({ ...f, siteId: e.target.value }))}
            >
              <option value="">All sites</option>
              {sites.map(s => (
                <option key={s.siteId} value={s.siteId}>{s.siteId} — {s.siteName}</option>
              ))}
            </select>

            {[
              ['lookbackDays', 'Lookback', 7, 180, 1, 'days of throughput history used for the average'],
              ['minStockPct', 'Min stock %', 0, 50, 1, 'unusable bottom stock, as a % of capacity'],
              ['criticalDays', 'Critical <', 0.5, 30, 0.5, 'days of cover below which a tank is critical'],
              ['warningDays', 'Warning <', 0.5, 60, 0.5, 'days of cover below which a tank is a warning'],
            ].map(([key, label, min, max, step, hint]) => (
              <Fragment key={key}>
                <label title={hint} style={{ fontSize: 12, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{label}</label>
                <input
                  type="number" className="filter-search" style={{ width: 78 }}
                  min={min} max={max} step={step} title={hint}
                  value={filters[key]}
                  onChange={e => setFilters(f => ({ ...f, [key]: e.target.value === '' ? '' : Number(e.target.value) }))}
                />
              </Fragment>
            ))}

            <button className="btn btn-primary btn-sm" onClick={apply} disabled={loading}>
              {loading ? 'Loading…' : 'Apply'}
            </button>
            <button className="btn btn-outline btn-sm" onClick={reset} disabled={loading}>Reset</button>

            <input
              type="text" className="filter-search" style={{ minWidth: 185 }}
              placeholder="Search site, tank or grade…"
              value={search}
              onChange={e => changeSearch(e.target.value)}
            />
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <span className="card-title">
              Run-out Prediction — {displayRows.length.toLocaleString()} tanks (page {safePage} of {totalPages})
              {statusFilter !== 'all' && <span style={{ color: 'var(--text-secondary)', fontWeight: 400 }}>
                {' '}· {STATUS_META[statusFilter]?.label}
              </span>}
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => setShowLegend(v => !v)}
                title="Show what you can type in the column filter boxes"
              >
                {showLegend ? 'Hide' : 'Filter'} syntax
              </button>
              {activeColFilters.length > 0 && (
                <button className="btn btn-outline btn-sm" onClick={clearColFilters}>
                  Clear {activeColFilters.length} column filter{activeColFilters.length === 1 ? '' : 's'}
                </button>
              )}
              <span style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>Click a row for history and projection</span>
            </span>
          </div>

          {showLegend && (
            <div className="filter-legend">
              {FILTER_LEGEND.map(([example, meaning]) => (
                <span key={example}><code>{example}</code>{meaning}</span>
              ))}
            </div>
          )}
          <div className="table-responsive">
            {loading ? (
              <div className="loading-state"><div className="spinner" />Forecasting run-out dates...</div>
            ) : error ? (
              <div className="empty-state" style={{ color: '#dc2626' }}>{error}</div>
            ) : (
            <table className="evo-table">
              <thead>
                <tr>
                  {COLUMNS.map(col => (
                    <th
                      key={col.key}
                      onClick={() => toggleSort(col.key)}
                      style={{ cursor: 'pointer', userSelect: 'none' }}
                    >
                      {col.label}<SortIcon col={col.key} sortCol={sortCol} sortDir={sortDir} />
                    </th>
                  ))}
                </tr>
                <tr className="filter-row">
                  {COLUMNS.map(col => {
                    const value = colFilters[col.key] || ''
                    const excluded = !!colExclude[col.key]
                    return (
                      <th key={col.key}>
                        <div className="col-filter-wrap">
                          <input
                            type="text"
                            className={`col-filter${value ? (excluded ? ' excluded' : ' active') : ''}`}
                            placeholder={col.placeholder}
                            title={FILTER_HINT}
                            value={value}
                            onChange={e => setColFilter(col.key, e.target.value)}
                          />
                          {value && (
                            <button
                              type="button"
                              className={`col-filter-neg${excluded ? ' active' : ''}`}
                              onClick={() => toggleColExclude(col.key)}
                              title={excluded
                                ? `Excluding matches — click to show only matches instead`
                                : `Click to exclude these matches instead`}
                              aria-pressed={excluded}
                            >
                              !
                            </button>
                          )}
                        </div>
                      </th>
                    )
                  })}
                </tr>
              </thead>
              <tbody>
                {displayRows.length === 0 ? (
                  <tr><td colSpan={COLUMNS.length}><div className="empty-state">No tanks match the current filters</div></td></tr>
                ) : pageRows.map(r => {
                  const key = `${r.siteId}|${r.tankId}`
                  const meta = STATUS_META[r.status] || STATUS_META.no_data
                  const conf = CONFIDENCE_META[r.confidence] || CONFIDENCE_META.none
                  const minPct = r.capacity > 0 ? (r.minStockLitres / r.capacity) * 100 : 0
                  const gaugedPct = r.capacity > 0 ? (r.lastGauged / r.capacity) * 100 : 0
                  const isOpen = expanded === key
                  return (
                    <Fragment key={key}>
                      <tr
                        onClick={() => setExpanded(isOpen ? null : key)}
                        style={{ cursor: 'pointer', background: isOpen ? 'var(--input-bg)' : undefined }}
                      >
                        <td><span className={`badge ${meta.badge}`}>{meta.label}</span></td>
                        <td style={{ whiteSpace: 'nowrap' }}>
                          <button
                            className="btn-link"
                            onClick={e => { e.stopPropagation(); navigate(`/sites/${r.siteId}`) }}
                            style={{
                              background: 'none', border: 'none', padding: 0, cursor: 'pointer',
                              color: 'var(--accent)', fontWeight: 600, fontSize: 'inherit',
                            }}
                          >
                            {r.siteName}
                          </button>
                          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                            {r.siteId} · Tank {r.tankId}
                          </div>
                        </td>
                        <td style={{ whiteSpace: 'nowrap' }}>{r.gradeName}</td>
                        <td><FillBar percent={gaugedPct} minPct={minPct} colour={meta.colour} /></td>
                        <td style={{ fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                          {fmtL(r.lastGauged)}
                          <div style={{ fontSize: 10.5, color: r.readingAgeDays > 2 ? 'var(--orange)' : 'var(--text-muted)' }}>
                            {fmtDate(r.lastReadingDate)}
                            {r.readingAgeDays > 0 && ` · ${r.readingAgeDays}d old`}
                          </div>
                        </td>
                        <td style={{ fontVariantNumeric: 'tabular-nums' }}>{fmtL(r.avgDailyThroughput)}</td>
                        <td style={{ fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                          <span style={{ fontWeight: 650, color: meta.colour }}>{fmtDays(r.daysRemaining)}</span>
                          {r.daysRemaining !== null && r.daysRemaining !== undefined && (
                            <span style={{ color: 'var(--text-muted)', fontSize: 11 }}> d</span>
                          )}
                          {r.typicalDaysOfCover > 0 && (
                            <div style={{ fontSize: 10.5, color: r.belowTypical ? 'var(--red)' : 'var(--text-muted)' }}>
                              {r.belowTypical ? '↓ ' : ''}usually {fmtDays(r.typicalDaysOfCover)} d
                            </div>
                          )}
                        </td>
                        <td style={{ whiteSpace: 'nowrap' }}>{fmtDate(r.runOutDate)}</td>
                        <td style={{ whiteSpace: 'nowrap' }}>
                          {r.recommendedDeliveryDate ? (
                            <>
                              <div style={{ fontWeight: 600 }}>{fmtDate(r.recommendedDeliveryDate)}</div>
                              <div style={{ fontSize: 11, color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>
                                order ~{fmtL(r.recommendedVolume)} L
                              </div>
                            </>
                          ) : '—'}
                        </td>
                        <td>
                          <span style={{ fontSize: 11.5, color: conf.colour, fontWeight: 600 }}>{conf.label}</span>
                          {r.sampleDays > 0 && (
                            <div style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>{r.sampleDays}d history</div>
                          )}
                        </td>
                      </tr>
                      {isOpen && (
                        <tr>
                          <td colSpan={COLUMNS.length} style={{ padding: 0 }}>
                            <TankDetail siteId={r.siteId} tankId={r.tankId} params={detailParams} />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
            )}
          </div>

          <div className="pagination">
            <span className="pagination-info">
              {displayRows.length.toLocaleString()} total rows · showing {Math.min((safePage - 1) * PAGE_SIZE + 1, displayRows.length)}–{Math.min(safePage * PAGE_SIZE, displayRows.length)}
            </span>
            <button className="page-btn" disabled={safePage <= 1} onClick={() => setPage(1)}>«</button>
            <button className="page-btn" disabled={safePage <= 1} onClick={() => setPage(safePage - 1)}>‹</button>
            <button className="page-btn active">{safePage}</button>
            <button className="page-btn" disabled={safePage >= totalPages} onClick={() => setPage(safePage + 1)}>›</button>
            <button className="page-btn" disabled={safePage >= totalPages} onClick={() => setPage(totalPages)}>»</button>
          </div>
        </div>
      </div>
    </ErrorBoundary>
  )
}
