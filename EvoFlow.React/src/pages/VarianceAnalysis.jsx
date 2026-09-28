import { useEffect, useMemo, useState, Fragment } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import api, { sitesApi } from '../api/client'
import ErrorBoundary from '../components/ErrorBoundary'
import { VarianceChart, ChartLegend } from '../components/TankCharts'

const varianceApi = {
  getAll: (params = {}) => api.get('/varianceanalysis', { params }).then(r => r.data),
  getDetail: (siteId, tankId, params = {}) =>
    api.get(`/varianceanalysis/${encodeURIComponent(siteId)}/${encodeURIComponent(tankId)}/detail`, { params })
       .then(r => r.data),
}

const SEVERITY_META = {
  critical: { label: 'Critical', badge: 'badge-red',    colour: 'var(--red)',        rank: 0 },
  warning:  { label: 'Warning',  badge: 'badge-orange', colour: 'var(--orange)',     rank: 1 },
  info:     { label: 'Info',     badge: 'badge-blue',   colour: 'var(--accent)',     rank: 2 },
  ok:       { label: 'OK',       badge: 'badge-green',  colour: 'var(--green)',      rank: 3 },
  unknown:  { label: 'No data',  badge: 'badge-gray',   colour: 'var(--text-muted)', rank: 4 },
}

const CONFIDENCE_META = {
  high:   { label: 'High',   colour: 'var(--green)' },
  medium: { label: 'Medium', colour: 'var(--orange)' },
  low:    { label: 'Low',    colour: 'var(--red)' },
  none:   { label: '—',      colour: 'var(--text-muted)' },
}

// Ordered worst-first so the cause column sorts into something meaningful.
const CAUSE_RANK = {
  sudden_loss: 0, constant_loss: 1, unexplained: 2, meter_drift: 3,
  probe: 4, implausible: 5, mapping: 6, ok: 7, insufficient_data: 8,
}

const DEFAULT_DAYS = 28
const PAGE_SIZE = 100

function fmtL(v) {
  if (v === null || v === undefined) return '—'
  return Number(v).toLocaleString(undefined, { maximumFractionDigits: 0 })
}

function fmtSignedL(v) {
  if (v === null || v === undefined) return '—'
  const n = Number(v)
  return `${n > 0 ? '+' : ''}${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
}

function fmtPct(v, dp = 2) {
  if (v === null || v === undefined) return '—'
  const n = Number(v)
  return `${n > 0 ? '+' : ''}${n.toFixed(dp)}%`
}

function fmtDate(d) {
  if (!d) return '—'
  const dt = new Date(d)
  if (Number.isNaN(dt.getTime())) return '—'
  return dt.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })
}

function isoDate(d) {
  if (!d) return null
  return String(d).slice(0, 10)
}

function SortIcon({ col, sortCol, sortDir }) {
  if (sortCol !== col) return <span style={{ opacity: 0.3, marginLeft: 4, fontSize: 10 }}>↕</span>
  return <span style={{ marginLeft: 4, fontSize: 10 }}>{sortDir === 'asc' ? '↑' : '↓'}</span>
}

const COLUMNS = [
  { key: 'severity', label: 'Severity', placeholder: 'critical…', type: 'text',
    sort: r => SEVERITY_META[r.severity]?.rank ?? 99,
    text: r => SEVERITY_META[r.severity]?.label ?? r.severity },
  { key: 'cause', label: 'Likely cause', placeholder: 'drift…', type: 'text',
    sort: r => CAUSE_RANK[r.cause] ?? 99, text: r => r.causeLabel },
  { key: 'site', label: 'Site / Tank', placeholder: 'site or tank…', type: 'text',
    sort: r => `${r.siteName} ${r.tankId}`,
    text: r => `${r.siteName} ${r.siteId} tank ${r.tankId}` },
  { key: 'grade', label: 'Grade', placeholder: 'diesel…', type: 'text',
    sort: r => r.gradeName, text: r => r.gradeName },
  { key: 'variance', label: 'Variance (L)', placeholder: '<-1000', type: 'num',
    sort: r => r.totalVarianceL, text: r => r.totalVarianceL },
  { key: 'pct', label: '% of throughput', placeholder: '<-0.5', type: 'num',
    sort: r => r.variancePct ?? 0, text: r => r.variancePct },
  { key: 'throughput', label: 'Throughput (L)', placeholder: '>100000', type: 'num',
    sort: r => r.throughputL, text: r => r.throughputL },
  { key: 'days', label: 'Days used', placeholder: '>=10', type: 'num',
    sort: r => r.quietDays, text: r => r.quietDays },
  { key: 'evidence', label: 'Evidence', placeholder: 'corr…', type: 'text',
    sort: r => r.tStat ?? 0,
    text: r => `t ${r.tStat ?? ''} slope ${r.slopeVsThroughputPct ?? ''} corr ${r.corrWithLevel ?? ''}` },
  { key: 'confidence', label: 'Confidence', placeholder: 'high…', type: 'text',
    sort: r => ({ high: 0, medium: 1, low: 2, none: 3 })[r.confidence] ?? 99,
    text: r => CONFIDENCE_META[r.confidence]?.label ?? r.confidence },
]

const FILTER_LEGEND = [
  ['asda', 'contains'],
  ['!asda', 'does not contain'],
  ['asda !tamworth', 'both rules apply'],
  ['drift|probe', 'either one'],
  ['"tank / pump mapping"', 'exact phrase'],
  ['<-1000  >=5  <>0', 'compare (number columns)'],
  ['2..5', 'between (number columns)'],
  ['!', 'the button flips the whole box to exclude'],
]

const FILTER_HINT = [
  'Filter this column. Terms are combined, so "asda !tamworth" keeps Asda sites but drops Tamworth.',
  '  !term            exclude anything matching term',
  '  a|b              match either',
  '  "two words"      exact phrase',
  '  <-1000  >=5      compare (number columns)',
  '  2..5             between (number columns)',
  'The ! button beside the box flips the whole filter to exclude.',
].join('\n')

// Same filter grammar as the Run-out Prediction grid.
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

function StatTile({ label, value, sub, colour, active, onClick }) {
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
      {sub && <div style={{ fontSize: 10.5, color: 'var(--text-muted)', marginTop: 1 }}>{sub}</div>}
    </button>
  )
}

function Metric({ label, value, hint }) {
  return (
    <div title={hint} style={{ minWidth: 92 }}>
      <div style={{ fontSize: 10.5, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>{value}</div>
    </div>
  )
}

/** Expanded row: the daily variance that produced the verdict. */
function TankDetail({ siteId, tankId, days }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    varianceApi.getDetail(siteId, tankId, { days })
      .then(d => { if (!cancelled) { setData(d); setError(null) } })
      .catch(e => { if (!cancelled) setError(e.response?.data?.message || e.message) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [siteId, tankId, days])

  if (loading) return <div style={{ padding: 18, color: 'var(--text-secondary)', fontSize: 12.5 }}>Loading daily reconciliation…</div>
  if (error) return <div style={{ padding: 18, color: 'var(--red)', fontSize: 12.5 }}>{error}</div>
  if (!data) return null

  const t = data.tank
  const sev = SEVERITY_META[t.severity] || SEVERITY_META.unknown

  return (
    <div style={{ padding: '14px 16px', background: 'var(--input-bg)' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
        <div style={{ flex: '1 1 440px', minWidth: 300 }}>
          <div style={{ fontSize: 12, fontWeight: 650, color: 'var(--text-primary)', marginBottom: 6 }}>
            Daily variance — bars are unexplained litres, grey marks a delivery day
          </div>
          <VarianceChart series={data.series} meanDailyVarianceL={t.meanDailyVarianceL} />
          <ChartLegend items={[
            ['var(--red)', 'Unaccounted loss'],
            ['var(--green)', 'Unaccounted gain'],
            ['var(--card-border)', 'Delivery day (excluded)'],
            ['var(--accent)', 'Window mean', true],
          ]} />
        </div>

        <div style={{ flex: '1 1 300px', minWidth: 270 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <span className={`badge ${sev.badge}`}>{sev.label}</span>
            <span style={{ fontSize: 13, fontWeight: 650, color: 'var(--text-primary)' }}>{t.causeLabel}</span>
          </div>
          <p style={{ margin: '0 0 9px', fontSize: 12.5, lineHeight: 1.55, color: 'var(--text-secondary)' }}>
            {t.explanation}
          </p>
          <p style={{
            margin: '0 0 11px', fontSize: 12.5, lineHeight: 1.55, color: 'var(--text-primary)',
            background: 'var(--card-bg)', border: '1px solid var(--card-border)',
            borderLeft: `3px solid ${sev.colour}`, borderRadius: 6, padding: '8px 10px',
          }}>
            <strong>What to do:</strong> {t.recommendation}
          </p>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px 18px' }}>
            <Metric label="Mean / day" value={`${fmtSignedL(t.meanDailyVarianceL)} L`}
                    hint="Average unexplained litres per reconciled day" />
            <Metric label="Scatter" value={`± ${fmtL(t.sdDailyL)} L`}
                    hint="Standard deviation of the daily variance" />
            <Metric label="Signal" value={t.tStat ? `${t.tStat}σ` : '—'}
                    hint="How many standard errors the average sits from zero. Above 3 the bias is unlikely to be noise." />
            <Metric label="vs throughput" value={fmtPct(t.slopeVsThroughputPct)}
                    hint="How much the variance grows per litre dispensed. Large means meter drift; near zero means a fixed daily amount." />
            <Metric label="vs tank level" value={t.corrWithLevel ?? '—'}
                    hint="Correlation between variance and tank level. Near ±1 points at a probe or tank-chart fault." />
            <Metric label="Grade group" value={fmtPct(t.groupVariancePct)}
                    hint={`Same reconciliation across every ${t.gradeName} tank at this site${t.groupPeerTanks ? ` (with tanks ${t.groupPeerTanks})` : ''}. Near zero means the litres are at the site but on the wrong tank.`} />
            <Metric label="Worst day" value={`${fmtSignedL(t.worstDayVarianceL)} L`}
                    hint={fmtDate(t.worstDayDate)} />
            <Metric label="Deliveries" value={t.deliveryDays}
                    hint="Days excluded from the variance because fuel arrived" />
          </div>
        </div>
      </div>
    </div>
  )
}

export default function VarianceAnalysis() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  const [sites, setSites] = useState([])
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [filters, setFilters] = useState({
    siteId: searchParams.get('siteId') || '',
    days: DEFAULT_DAYS,
  })
  const [applied, setApplied] = useState({ siteId: searchParams.get('siteId') || '', days: DEFAULT_DAYS })
  const [sevFilter, setSevFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [colFilters, setColFilters] = useState({})
  const [colExclude, setColExclude] = useState({})
  const [showLegend, setShowLegend] = useState(false)
  const [sortCol, setSortCol] = useState('severity')
  const [sortDir, setSortDir] = useState('asc')
  const [expanded, setExpanded] = useState(null)
  const [page, setPage] = useState(1)

  useEffect(() => {
    sitesApi.getAll().then(s => setSites(s || [])).catch(() => {})
  }, [])

  useEffect(() => {
    setLoading(true)
    const params = { days: applied.days }
    if (applied.siteId) params.siteId = applied.siteId
    varianceApi.getAll(params)
      .then(d => { setData(d); setError(null) })
      .catch(e => setError(e.response?.data?.message || e.message || 'Failed to load variance analysis'))
      .finally(() => setLoading(false))
  }, [applied])

  const rows = useMemo(() => data?.rows || [], [data])
  const summary = data?.summary || {}

  const activeColFilters = useMemo(
    () => COLUMNS.filter(c => (colFilters[c.key] || '').trim() !== ''),
    [colFilters]
  )

  const displayRows = useMemo(() => {
    let out = rows

    if (sevFilter !== 'all') out = out.filter(r => r.severity === sevFilter)

    const q = search.trim().toLowerCase()
    if (q) {
      out = out.filter(r =>
        (r.siteId || '').toLowerCase().includes(q) ||
        (r.siteName || '').toLowerCase().includes(q) ||
        (r.gradeName || '').toLowerCase().includes(q) ||
        (r.causeLabel || '').toLowerCase().includes(q) ||
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
      if (av === bv) return (a.siteId + a.tankId).localeCompare(b.siteId + b.tankId)
      if (typeof av === 'string' || typeof bv === 'string') {
        return String(av).localeCompare(String(bv)) * dir
      }
      return (av - bv) * dir
    })
  }, [rows, sevFilter, search, colFilters, colExclude, activeColFilters, sortCol, sortDir])

  const totalPages = Math.max(1, Math.ceil(displayRows.length / PAGE_SIZE))
  const safePage = Math.min(Math.max(1, page), totalPages)
  const pageRows = useMemo(
    () => displayRows.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE),
    [displayRows, safePage]
  )

  function toggleSort(col) {
    if (sortCol === col) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortCol(col); setSortDir('asc') }
    setPage(1)
  }
  function setColFilter(key, value) {
    setColFilters(f => ({ ...f, [key]: value })); setExpanded(null); setPage(1)
  }
  function toggleColExclude(key) {
    setColExclude(e => ({ ...e, [key]: !e[key] })); setExpanded(null); setPage(1)
  }
  function clearColFilters() {
    setColFilters({}); setColExclude({}); setExpanded(null); setPage(1)
  }
  function changeSearch(v) { setSearch(v); setExpanded(null); setPage(1) }
  function changeSev(v) { setSevFilter(v); setExpanded(null); setPage(1) }
  function apply() { setExpanded(null); setApplied({ ...filters }) }
  function reset() {
    const next = { siteId: '', days: DEFAULT_DAYS }
    setFilters(next); setApplied(next)
    setSevFilter('all'); setSearch(''); setColFilters({}); setColExclude({})
    setExpanded(null); setPage(1)
  }

  const asOf = data?.asOf ? isoDate(data.asOf) : null

  return (
    <ErrorBoundary>
      <div className="page-content">
        <div className="page-header">
          <div>
            <h1 className="page-title">Intelligent Variance Analysis</h1>
            <p className="page-subtitle">
              Not just how many litres are unaccounted for, but the most likely reason why.
            </p>
          </div>
        </div>

        {/* How the number is produced - the verdicts are only trustworthy if this is stated. */}
        <div className="card" style={{ marginBottom: 14, borderLeft: '3px solid var(--accent)' }}>
          <div style={{ padding: '11px 14px', fontSize: 12.5, color: 'var(--text-secondary)', lineHeight: 1.55 }}>
            <strong style={{ color: 'var(--text-primary)' }}>Variance = (closing gauge − opening gauge) + dispensed.</strong>{' '}
            Zero means every litre is accounted for. Because no deliveries are recorded anywhere, a large
            positive result <em>is</em> the delivery, so days above{' '}
            {fmtL(data?.deliveryThresholdL ?? 2000)} L are detected as deliveries and excluded from the maths.
            Only consecutive days with a healthy probe are reconciled, and a cause is only asserted once the
            bias is bigger than day-to-day scatter.{' '}
            <strong style={{ color: 'var(--text-primary)' }}>Cheap explanations are ruled out first</strong> —
            a tank whose litres reappear on its neighbour is a mapping fault, not theft.
            {asOf && <> Latest reconciled activity date is <strong style={{ color: 'var(--text-primary)' }}>{asOf}</strong>.</>}
          </div>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 9, marginBottom: 14 }}>
          <StatTile label="Tanks" value={summary.tanks ?? '—'} colour="var(--text-primary)"
                    active={sevFilter === 'all'} onClick={() => changeSev('all')} />
          <StatTile label="Critical" value={summary.critical ?? '—'} colour="var(--red)"
                    active={sevFilter === 'critical'} onClick={() => changeSev('critical')} />
          <StatTile label="Warning" value={summary.warning ?? '—'} colour="var(--orange)"
                    active={sevFilter === 'warning'} onClick={() => changeSev('warning')} />
          <StatTile label="Info" value={summary.info ?? '—'} colour="var(--accent)"
                    active={sevFilter === 'info'} onClick={() => changeSev('info')} />
          <StatTile label="Within tolerance" value={summary.ok ?? '—'} colour="var(--green)"
                    active={sevFilter === 'ok'} onClick={() => changeSev('ok')} />
          <StatTile label="No data" value={summary.unknown ?? '—'} colour="var(--text-muted)"
                    active={sevFilter === 'unknown'} onClick={() => changeSev('unknown')} />
          <StatTile
            label="Unaccounted fuel"
            value={`${fmtL(summary.unexplainedLitres)} L`}
            sub={summary.dataFaultTanks ? `excludes ${summary.dataFaultTanks} data-fault tanks` : null}
            colour="var(--red)"
            active={false}
            onClick={() => changeSev('all')}
          />
        </div>

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

            <label style={{ fontSize: 12, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}
                   title="How many days of history to reconcile">Window (days)</label>
            <input
              type="number" className="filter-search" style={{ width: 84 }}
              min={7} max={180} step={1}
              value={filters.days}
              onChange={e => setFilters(f => ({ ...f, days: e.target.value === '' ? '' : Number(e.target.value) }))}
            />

            <button className="btn btn-primary btn-sm" onClick={apply} disabled={loading}>
              {loading ? 'Loading…' : 'Apply'}
            </button>
            <button className="btn btn-outline btn-sm" onClick={reset} disabled={loading}>Reset</button>

            <input
              type="text" className="filter-search" style={{ minWidth: 195 }}
              placeholder="Search site, tank, grade or cause…"
              value={search}
              onChange={e => changeSearch(e.target.value)}
            />
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <span className="card-title">
              Variance Analysis — {displayRows.length.toLocaleString()} tanks (page {safePage} of {totalPages})
              {sevFilter !== 'all' && <span style={{ color: 'var(--text-secondary)', fontWeight: 400 }}>
                {' '}· {SEVERITY_META[sevFilter]?.label}
              </span>}
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowLegend(v => !v)}
                      title="Show what you can type in the column filter boxes">
                {showLegend ? 'Hide' : 'Filter'} syntax
              </button>
              {activeColFilters.length > 0 && (
                <button className="btn btn-outline btn-sm" onClick={clearColFilters}>
                  Clear {activeColFilters.length} column filter{activeColFilters.length === 1 ? '' : 's'}
                </button>
              )}
              <span style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>Click a row for the daily breakdown</span>
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
              <div className="loading-state"><div className="spinner" />Reconciling tanks and testing for causes...</div>
            ) : error ? (
              <div className="empty-state" style={{ color: '#dc2626' }}>{error}</div>
            ) : (
            <table className="evo-table">
              <thead>
                <tr>
                  {COLUMNS.map(col => (
                    <th key={col.key} onClick={() => toggleSort(col.key)}
                        style={{ cursor: 'pointer', userSelect: 'none' }}>
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
                                ? 'Excluding matches — click to show only matches instead'
                                : 'Click to exclude these matches instead'}
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
                  const sev = SEVERITY_META[r.severity] || SEVERITY_META.unknown
                  const conf = CONFIDENCE_META[r.confidence] || CONFIDENCE_META.none
                  const isOpen = expanded === key
                  return (
                    <Fragment key={key}>
                      <tr
                        onClick={() => setExpanded(isOpen ? null : key)}
                        style={{ cursor: 'pointer', background: isOpen ? 'var(--input-bg)' : undefined }}
                      >
                        <td><span className={`badge ${sev.badge}`}>{sev.label}</span></td>
                        <td style={{ whiteSpace: 'nowrap' }}>
                          <div style={{ fontWeight: 600 }}>{r.causeLabel}</div>
                          {r.suddenLossCount > 0 && (
                            <div style={{ fontSize: 10.5, color: 'var(--red)' }}>{r.suddenLossCount} gauge alarm{r.suddenLossCount === 1 ? '' : 's'}</div>
                          )}
                        </td>
                        <td style={{ whiteSpace: 'nowrap' }}>
                          <button
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
                        <td style={{ fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap',
                                     color: r.totalVarianceL < 0 ? 'var(--red)' : 'var(--text-primary)', fontWeight: 600 }}>
                          {fmtSignedL(r.totalVarianceL)}
                        </td>
                        <td style={{ fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                          <span style={{ fontWeight: 650, color: sev.colour }}>{fmtPct(r.variancePct)}</span>
                          {r.groupVariancePct !== null && r.groupVariancePct !== undefined && r.groupPeerTanks && (
                            <div style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>
                              grade group {fmtPct(r.groupVariancePct)}
                            </div>
                          )}
                        </td>
                        <td style={{ fontVariantNumeric: 'tabular-nums' }}>{fmtL(r.throughputL)}</td>
                        <td style={{ fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                          {r.quietDays}
                          {r.deliveryDays > 0 && (
                            <span style={{ color: 'var(--text-muted)', fontSize: 10.5 }}> +{r.deliveryDays} dlv</span>
                          )}
                        </td>
                        <td style={{ fontSize: 11, color: 'var(--text-secondary)', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
                          {r.tStat ? `${r.tStat}σ` : '—'}
                          {r.corrWithLevel !== null && r.corrWithLevel !== undefined && Math.abs(r.corrWithLevel) >= 0.6 && (
                            <div style={{ color: 'var(--orange)' }}>level corr {r.corrWithLevel}</div>
                          )}
                          {r.slopeVsThroughputPct !== null && r.slopeVsThroughputPct !== undefined
                            && Math.abs(r.slopeVsThroughputPct) >= 0.2 && Math.abs(r.slopeVsThroughputPct) < 8 && (
                            <div style={{ color: 'var(--text-muted)' }}>slope {fmtPct(r.slopeVsThroughputPct)}</div>
                          )}
                        </td>
                        <td>
                          <span style={{ fontSize: 11.5, color: conf.colour, fontWeight: 600 }}>{conf.label}</span>
                        </td>
                      </tr>
                      {isOpen && (
                        <tr>
                          <td colSpan={COLUMNS.length} style={{ padding: 0 }}>
                            <TankDetail siteId={r.siteId} tankId={r.tankId} days={applied.days} />
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
