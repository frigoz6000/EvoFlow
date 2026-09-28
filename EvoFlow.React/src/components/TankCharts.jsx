import { useMemo } from 'react'
import {
  ComposedChart, Area, Bar, Line, ReferenceLine, ReferenceArea, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts'

// The two tank charts, shared by the Run-out Prediction page, the Variance
// Analysis page and the site detail panels, so a chart can never drift between
// the place it was designed and the place it is reused.

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

function isoDate(d) {
  if (!d) return null
  return String(d).slice(0, 10)
}

/** "2026-09-21" -> "21 Sep", for axis ticks. */
function tickDate(d) {
  const dt = new Date(`${isoDate(d)}T00:00:00`)
  if (Number.isNaN(dt.getTime())) return d
  return dt.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
}

function TooltipShell({ label, children, footer }) {
  return (
    <div style={{
      background: 'var(--card-bg)', border: '1px solid var(--card-border)',
      borderRadius: 7, padding: '8px 10px', fontSize: 12, boxShadow: '0 4px 14px rgba(0,0,0,0.12)',
    }}>
      <div style={{ fontWeight: 650, marginBottom: 4, color: 'var(--text-primary)' }}>{label}</div>
      {children}
      {footer && (
        <div style={{ color: 'var(--text-muted)', marginTop: 4, borderTop: '1px solid var(--card-border)', paddingTop: 4 }}>
          {footer}
        </div>
      )}
    </div>
  )
}

function StockTooltip({ active, payload, label, minStock }) {
  if (!active || !payload?.length) return null
  return (
    <TooltipShell label={label} footer={`Min stock ${fmtL(minStock)} L`}>
      {payload.filter(p => p.value !== null && p.value !== undefined).map(p => (
        <div key={p.dataKey} style={{ color: p.color, display: 'flex', gap: 10, justifyContent: 'space-between' }}>
          <span>{p.name}</span>
          <span style={{ fontVariantNumeric: 'tabular-nums' }}>{fmtL(p.value)} L</span>
        </div>
      ))}
    </TooltipShell>
  )
}

function VarianceTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  const p = payload[0]?.payload || {}
  return (
    <TooltipShell label={label} footer={`Stock ${fmtL(p.opening)} → ${fmtL(p.closing)} L`}>
      {p.isDelivery ? (
        <div style={{ color: 'var(--accent)' }}>Delivery — {fmtL(p.residual)} L in, excluded from variance</div>
      ) : (
        <>
          <div style={{ color: p.variance < 0 ? 'var(--red)' : 'var(--green)' }}>
            Variance {fmtSignedL(p.variance)} L
            {p.residualPct !== null && p.residualPct !== undefined ? ` (${fmtPct(p.residualPct)})` : ''}
          </div>
          <div style={{ color: 'var(--text-secondary)' }}>Dispensed {fmtL(p.dispensed)} L</div>
        </>
      )}
    </TooltipShell>
  )
}

/**
 * Gauged stock history as a filled area, with the forward projection dashed on
 * the end, the minimum-stock floor marked and the run-out day flagged.
 * Takes the payload of GET /api/runoutprediction/{site}/{tank}/detail.
 */
export function RunOutChart({ history, projection, minStockLitres, runOutDate, height = 210 }) {
  const data = useMemo(() => {
    const rows = (history || []).map(h => ({
      date: isoDate(h.date),
      actual: h.gauged,
      dispensed: h.dispensed,
    }))
    // Stitch the projection onto the last actual point so the lines join up.
    if (rows.length) rows[rows.length - 1].projected = rows[rows.length - 1].actual
    for (const p of projection || []) {
      rows.push({ date: isoDate(p.date), projected: p.projectedStock, expected: p.expectedThroughput })
    }
    return rows
  }, [history, projection])

  const minStock = Number(minStockLitres) || 0
  const runOut = isoDate(runOutDate)

  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={data} margin={{ top: 6, right: 12, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--table-border)" />
        <XAxis
          dataKey="date" tick={{ fontSize: 10, fill: 'var(--text-muted)' }}
          axisLine={false} tickLine={false} minTickGap={22} tickFormatter={tickDate}
        />
        <YAxis
          tick={{ fontSize: 10, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false}
          width={52} tickFormatter={v => `${Math.round(v / 1000)}k`}
        />
        <Tooltip content={<StockTooltip minStock={minStock} />} />
        {minStock > 0 && <ReferenceArea y1={0} y2={minStock} fill="var(--red)" fillOpacity={0.07} />}
        {minStock > 0 && (
          <ReferenceLine
            y={minStock} stroke="var(--red)" strokeDasharray="4 3"
            label={{ value: 'min stock', position: 'insideBottomRight', fontSize: 10, fill: 'var(--red)' }}
          />
        )}
        {runOut && (
          <ReferenceLine
            x={runOut} stroke="var(--red)" strokeWidth={1.5}
            label={{ value: 'run-out', position: 'top', fontSize: 10, fill: 'var(--red)' }}
          />
        )}
        <Area
          type="monotone" dataKey="actual" name="Gauged"
          stroke="var(--accent)" fill="var(--accent)" fillOpacity={0.14} strokeWidth={2}
          connectNulls={false} dot={false}
        />
        <Line
          type="monotone" dataKey="projected" name="Projected"
          stroke="var(--orange)" strokeWidth={2} strokeDasharray="5 4"
          dot={false} connectNulls={false}
        />
      </ComposedChart>
    </ResponsiveContainer>
  )
}

/**
 * Daily unexplained litres as bars - red for loss, green for gain, grey where a
 * delivery took the day out of the maths - against the window's mean.
 * Takes the payload of GET /api/varianceanalysis/{site}/{tank}/detail.
 */
export function VarianceChart({ series, meanDailyVarianceL, height = 200 }) {
  const data = useMemo(() => (series || []).map(p => ({
    date: isoDate(p.date),
    variance: p.isDelivery ? 0 : p.residual,
    isDelivery: p.isDelivery,
    residual: p.residual,
    residualPct: p.residualPct,
    dispensed: p.dispensed,
    opening: p.opening,
    closing: p.closing,
  })), [series])

  const mean = Number(meanDailyVarianceL) || 0

  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={data} margin={{ top: 6, right: 12, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--table-border)" />
        <XAxis
          dataKey="date" tick={{ fontSize: 10, fill: 'var(--text-muted)' }}
          axisLine={false} tickLine={false} minTickGap={22} tickFormatter={tickDate}
        />
        <YAxis
          tick={{ fontSize: 10, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false}
          width={52} tickFormatter={v => (Math.abs(v) >= 1000 ? `${Math.round(v / 1000)}k` : v)}
        />
        <Tooltip content={<VarianceTooltip />} />
        <ReferenceLine y={0} stroke="var(--text-muted)" />
        <Bar dataKey="variance" name="Variance" radius={[2, 2, 0, 0]}>
          {data.map((p, i) => (
            <Cell key={i} fill={p.isDelivery
              ? 'var(--card-border)'
              : p.variance < 0 ? 'var(--red)' : 'var(--green)'} />
          ))}
        </Bar>
        <ReferenceLine
          y={mean} stroke="var(--accent)" strokeWidth={1.5} strokeDasharray="5 4"
          label={{ value: 'mean', position: 'insideTopLeft', fontSize: 10, fill: 'var(--accent)' }}
        />
      </ComposedChart>
    </ResponsiveContainer>
  )
}

/** Shared legend strip so the colours are explained wherever a chart appears. */
export function ChartLegend({ items }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 4 }}>
      {items.map(([colour, label, dashed]) => (
        <span key={label} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 10.5, color: 'var(--text-muted)' }}>
          <span style={{
            width: 14, height: dashed ? 0 : 8, flexShrink: 0,
            borderRadius: dashed ? 0 : 2,
            background: dashed ? 'transparent' : colour,
            borderTop: dashed ? `2px dashed ${colour}` : undefined,
          }} />
          {label}
        </span>
      ))}
    </div>
  )
}
