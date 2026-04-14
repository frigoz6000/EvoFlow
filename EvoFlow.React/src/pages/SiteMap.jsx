import { useEffect, useState, useRef, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { MapContainer, TileLayer, Marker, Popup, useMap, Circle } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { sitesApi } from '../api/client'
import api from '../api/client'
import ErrorBoundary from '../components/ErrorBoundary'

delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
})

// ── Map helpers ──────────────────────────────────────────────────────────────

function FitBounds({ positions }) {
  const map = useMap()
  const fitted = useRef(false)
  useEffect(() => {
    if (!fitted.current && positions.length > 0) {
      map.fitBounds(L.latLngBounds(positions), { padding: [50, 50], maxZoom: 10 })
      fitted.current = true
    }
  }, [positions, map])
  return null
}

function FlyTo({ target }) {
  const map = useMap()
  useEffect(() => {
    if (target) map.flyTo([target.lat, target.lng], target.zoom ?? 12, { duration: 1.2 })
  }, [target, map])
  return null
}

// Opens the popup on a specific marker after the map finishes flying
function FocusSite({ site, markerRefs }) {
  const map = useMap()
  useEffect(() => {
    if (!site) return
    map.once('moveend', () => {
      const ref = markerRefs.current[site.siteId]
      if (ref) ref.openPopup()
    })
    map.flyTo([site.lat, site.lng], 15, { duration: 1.4 })
  }, [site, map, markerRefs])
  return null
}

// ── Styling ──────────────────────────────────────────────────────────────────

const POLE_COLOURS = {
  bp: '#007a33', shell: '#fbce07', texaco: '#c8102e',
  esso: '#003087', jet: '#e55b10', gulf: '#f79400',
}

function poleSignColour(poleSign) {
  const s = (poleSign || '').toLowerCase()
  for (const [brand, colour] of Object.entries(POLE_COLOURS)) {
    if (s.includes(brand)) return colour
  }
  return '#4f8ef7'
}

function makeIcon(poleSign, highlight = false) {
  const colour = poleSignColour(poleSign)
  const size = highlight ? 32 : 26
  const r = size / 2
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${Math.round(size * 1.31)}" viewBox="0 0 26 34">
    <path d="M13 0C5.82 0 0 5.82 0 13c0 9.2 13 21 13 21S26 22.2 26 13C26 5.82 20.18 0 13 0z"
      fill="${colour}" stroke="white" stroke-width="${highlight ? 2.5 : 1.5}"/>
    <circle cx="13" cy="13" r="5.5" fill="white" opacity="0.9"/>
  </svg>`
  return L.divIcon({
    html: svg,
    iconSize: [size, Math.round(size * 1.31)],
    iconAnchor: [r, Math.round(size * 1.31)],
    popupAnchor: [0, -Math.round(size * 1.31)],
    className: ''
  })
}

// ── Geo utils ────────────────────────────────────────────────────────────────

function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function isOpenNow(openingHour, closingHour) {
  if (!openingHour || !closingHour) return true
  const now = new Date()
  const [oh, om] = openingHour.split(':').map(Number)
  const [ch, cm] = closingHour.split(':').map(Number)
  const mins = now.getHours() * 60 + now.getMinutes()
  const open = oh * 60 + om
  const close = ch * 60 + cm
  if (close <= open) return true // 24h or overnight
  return mins >= open && mins < close
}

async function resolveLocation(query) {
  const trimmed = query.trim()
  // lat,lng pattern
  const coordMatch = trimmed.match(/^(-?\d+\.?\d*)\s*,\s*(-?\d+\.?\d*)$/)
  if (coordMatch) {
    return { lat: parseFloat(coordMatch[1]), lng: parseFloat(coordMatch[2]), label: trimmed }
  }
  // postcode
  try {
    const r = await fetch(`https://api.postcodes.io/postcodes/${encodeURIComponent(trimmed)}`)
    const d = await r.json()
    if (d.result) return { lat: d.result.latitude, lng: d.result.longitude, label: d.result.postcode }
  } catch { /* ignore */ }
  return null
}

// ── Filter bar ───────────────────────────────────────────────────────────────

const GRADES = ['Diesel', 'Unleaded', 'Super Unleaded', 'Ad-Blue']
const RADIUS_OPTIONS = [5, 10, 20, 50, 100]

function FilterBar({ filters, setFilters, allBrands, onSearch, onNearMe, searching, nearMeLoading }) {
  const [searchInput, setSearchInput] = useState('')

  function handleSearchSubmit(e) {
    e.preventDefault()
    if (searchInput.trim()) onSearch(searchInput)
  }

  return (
    <div style={{
      background: 'var(--card-bg)', border: '1px solid var(--card-border)',
      borderRadius: 8, padding: '10px 14px', marginBottom: 12,
      display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'flex-end'
    }}>

      {/* Search box */}
      <div style={{ flex: '1 1 200px', minWidth: 180 }}>
        <label style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'block', marginBottom: 3 }}>
          Search postcode or coordinates
        </label>
        <form onSubmit={handleSearchSubmit} style={{ display: 'flex', gap: 4 }}>
          <input
            type="text"
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            placeholder="e.g. SW1A 1AA or 51.5,-0.1"
            style={{
              flex: 1, padding: '5px 8px', borderRadius: 5, fontSize: 12,
              border: '1px solid var(--card-border)', background: 'var(--card-bg)',
              color: 'var(--text-primary)'
            }}
          />
          <button type="submit" disabled={searching} style={{
            padding: '5px 10px', borderRadius: 5, fontSize: 12, cursor: 'pointer',
            background: 'var(--accent)', color: '#fff', border: 'none', fontWeight: 600
          }}>
            {searching ? '…' : 'Go'}
          </button>
        </form>
      </div>

      {/* Near me */}
      <div>
        <label style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'block', marginBottom: 3 }}>
          &nbsp;
        </label>
        <button onClick={onNearMe} disabled={nearMeLoading} style={{
          padding: '5px 12px', borderRadius: 5, fontSize: 12, cursor: 'pointer',
          background: nearMeLoading ? 'var(--card-border)' : '#22c55e',
          color: '#fff', border: 'none', fontWeight: 600, whiteSpace: 'nowrap'
        }}>
          {nearMeLoading ? 'Locating…' : '📍 Near me'}
        </button>
      </div>

      {/* Radius (shown when search centre is set) */}
      {filters.centre && (
        <div style={{ minWidth: 120 }}>
          <label style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'block', marginBottom: 3 }}>
            Radius
          </label>
          <select
            value={filters.radiusKm}
            onChange={e => setFilters(f => ({ ...f, radiusKm: Number(e.target.value) }))}
            style={{
              padding: '5px 8px', borderRadius: 5, fontSize: 12,
              border: '1px solid var(--card-border)', background: 'var(--card-bg)',
              color: 'var(--text-primary)', cursor: 'pointer'
            }}
          >
            {RADIUS_OPTIONS.map(r => <option key={r} value={r}>{r} km</option>)}
          </select>
        </div>
      )}

      {/* Divider */}
      <div style={{ width: 1, background: 'var(--card-border)', alignSelf: 'stretch', margin: '0 2px' }} />

      {/* Fuel grade filter */}
      <div style={{ minWidth: 130 }}>
        <label style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'block', marginBottom: 3 }}>
          Fuel grade
        </label>
        <select
          value={filters.grade}
          onChange={e => setFilters(f => ({ ...f, grade: e.target.value, maxPrice: '' }))}
          style={{
            padding: '5px 8px', borderRadius: 5, fontSize: 12,
            border: '1px solid var(--card-border)', background: 'var(--card-bg)',
            color: 'var(--text-primary)', cursor: 'pointer', width: '100%'
          }}
        >
          <option value="">All grades</option>
          {GRADES.map(g => <option key={g} value={g}>{g}</option>)}
        </select>
      </div>

      {/* Max price */}
      {filters.grade && (
        <div style={{ minWidth: 110 }}>
          <label style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'block', marginBottom: 3 }}>
            Max price (£/L)
          </label>
          <input
            type="number"
            step="0.001"
            min="0"
            max="5"
            value={filters.maxPrice}
            onChange={e => setFilters(f => ({ ...f, maxPrice: e.target.value }))}
            placeholder="e.g. 1.60"
            style={{
              padding: '5px 8px', borderRadius: 5, fontSize: 12, width: '100%',
              border: '1px solid var(--card-border)', background: 'var(--card-bg)',
              color: 'var(--text-primary)'
            }}
          />
        </div>
      )}

      {/* Brand filter */}
      <div style={{ minWidth: 120 }}>
        <label style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'block', marginBottom: 3 }}>
          Brand
        </label>
        <select
          value={filters.brand}
          onChange={e => setFilters(f => ({ ...f, brand: e.target.value }))}
          style={{
            padding: '5px 8px', borderRadius: 5, fontSize: 12,
            border: '1px solid var(--card-border)', background: 'var(--card-bg)',
            color: 'var(--text-primary)', cursor: 'pointer', width: '100%'
          }}
        >
          <option value="">All brands</option>
          {allBrands.map(b => <option key={b} value={b}>{b}</option>)}
        </select>
      </div>

      {/* Open now */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        <label style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Open now</label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 12 }}>
          <input
            type="checkbox"
            checked={filters.openNow}
            onChange={e => setFilters(f => ({ ...f, openNow: e.target.checked }))}
            style={{ cursor: 'pointer' }}
          />
          Only open
        </label>
      </div>

      {/* Clear */}
      {(filters.grade || filters.brand || filters.openNow || filters.centre) && (
        <div>
          <label style={{ fontSize: 11, color: 'transparent', display: 'block', marginBottom: 3 }}>x</label>
          <button
            onClick={() => setFilters({ grade: '', maxPrice: '', brand: '', openNow: false, centre: null, radiusKm: 10 })}
            style={{
              padding: '5px 10px', borderRadius: 5, fontSize: 12, cursor: 'pointer',
              background: 'transparent', color: 'var(--text-secondary)',
              border: '1px solid var(--card-border)'
            }}
          >
            Clear filters
          </button>
        </div>
      )}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function SiteMap() {
  const [searchParams] = useSearchParams()
  const focusSiteId = searchParams.get('siteId')

  const [sites, setSites] = useState([])
  const [loading, setLoading] = useState(true)
  const [geocodeStatus, setGeocodeStatus] = useState(null)
  const [filters, setFilters] = useState({ grade: '', maxPrice: '', brand: '', openNow: false, centre: null, radiusKm: 10 })
  const [flyTarget, setFlyTarget] = useState(null)
  const [searching, setSearching] = useState(false)
  const [nearMeLoading, setNearMeLoading] = useState(false)
  const [searchError, setSearchError] = useState('')
  const pollRef = useRef(null)
  const markerRefs = useRef({})

  useEffect(() => {
    sitesApi.getMapData()
      .then(data => setSites(data || []))
      .catch(console.error)
      .finally(() => setLoading(false))

    api.get('/sites/geocode/status').then(r => {
      setGeocodeStatus(r.data)
      if (r.data.isRunning) startPolling()
    }).catch(() => {})

    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [])

  function startPolling() {
    if (pollRef.current) return
    pollRef.current = setInterval(() => {
      api.get('/sites/geocode/status').then(r => {
        setGeocodeStatus(r.data)
        if (!r.data.isRunning) {
          clearInterval(pollRef.current); pollRef.current = null
          sitesApi.getMapData().then(data => setSites(data || [])).catch(() => {})
        }
      }).catch(() => {})
    }, 3000)
  }

  function triggerGeocoding() {
    api.post('/sites/geocode').then(() => startPolling()).catch(e => { if (e.response?.status === 409) startPolling() })
  }

  async function handleSearch(query) {
    setSearching(true)
    setSearchError('')
    const loc = await resolveLocation(query)
    setSearching(false)
    if (!loc) { setSearchError(`Could not find "${query}". Try a full postcode or lat,lng.`); return }
    setFilters(f => ({ ...f, centre: loc }))
    setFlyTarget({ lat: loc.lat, lng: loc.lng, zoom: 11 })
  }

  function handleNearMe() {
    if (!navigator.geolocation) { setSearchError('Geolocation not supported by your browser.'); return }
    setNearMeLoading(true)
    setSearchError('')
    navigator.geolocation.getCurrentPosition(
      pos => {
        const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude, label: 'Your location' }
        setFilters(f => ({ ...f, centre: loc }))
        setFlyTarget({ lat: loc.lat, lng: loc.lng, zoom: 11 })
        setNearMeLoading(false)
      },
      () => { setSearchError('Location access denied or unavailable.'); setNearMeLoading(false) }
    )
  }

  // ── Apply filters ─────────────────────────────────────────────────────────

  const allBrands = [...new Set(sites.map(s => s.poleSign).filter(Boolean))].sort()

  const filtered = sites.filter(s => {
    if (!s.lat || !s.lng) return false

    // Brand
    if (filters.brand && s.poleSign !== filters.brand) return false

    // Open now
    if (filters.openNow && !isOpenNow(s.openingHour, s.closingHour)) return false

    // Grade + max price
    if (filters.grade) {
      const fuel = s.fuels?.find(f => f.grade === filters.grade)
      if (!fuel) return false
      if (filters.maxPrice && fuel.unitPrice > parseFloat(filters.maxPrice)) return false
    }

    // Radius from centre
    if (filters.centre) {
      const km = haversineKm(s.lat, s.lng, filters.centre.lat, filters.centre.lng)
      if (km > filters.radiusKm) return false
    }

    return true
  })

  const positions = filtered.map(s => [s.lat, s.lng])
  const isGeocoding = geocodeStatus?.isRunning === true
  const unplotted = sites.filter(s => !s.lat || !s.lng)
  const activeFilters = filters.grade || filters.brand || filters.openNow || filters.centre

  // Site to focus on when navigated from All Sites
  const focusSite = focusSiteId ? sites.find(s => s.siteId === focusSiteId) : null

  return (
    <ErrorBoundary fallback="Map page error.">
      <div className="page-header mb-4">
        <div>
          <div className="page-title">Site Map</div>
          <div className="page-subtitle">
            {loading ? 'Loading…' : `Showing ${filtered.length} of ${sites.length} sites`}
            {activeFilters ? ' (filtered)' : ''}
          </div>
        </div>
        {!isGeocoding && unplotted.length > 0 && (
          <div style={{ marginLeft: 'auto' }}>
            <button onClick={triggerGeocoding} style={{
              background: 'var(--accent)', color: '#fff', border: 'none',
              padding: '8px 16px', borderRadius: 6, cursor: 'pointer', fontSize: 13, fontWeight: 600
            }}>
              Geocode {unplotted.length} missing sites
            </button>
          </div>
        )}
      </div>

      {/* Filter bar */}
      <FilterBar
        filters={filters}
        setFilters={setFilters}
        allBrands={allBrands}
        onSearch={handleSearch}
        onNearMe={handleNearMe}
        searching={searching}
        nearMeLoading={nearMeLoading}
      />

      {searchError && (
        <div style={{
          background: '#fef2f2', border: '1px solid #fca5a5', color: '#b91c1c',
          borderRadius: 6, padding: '8px 12px', marginBottom: 10, fontSize: 13
        }}>
          {searchError}
        </div>
      )}

      {loading ? (
        <div className="card">
          <div className="loading-state"><div className="spinner" />Loading sites…</div>
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          {isGeocoding && (
            <div style={{
              padding: '7px 14px', background: 'var(--accent)', color: '#fff',
              fontSize: 12, display: 'flex', alignItems: 'center', gap: 8
            }}>
              <div className="spinner" style={{ width: 13, height: 13, borderColor: 'rgba(255,255,255,0.3)', borderTopColor: '#fff' }} />
              Geocoding postcodes — {geocodeStatus.done}/{geocodeStatus.total}
              {geocodeStatus.currentPostcode && <span style={{ opacity: 0.7 }}> · {geocodeStatus.currentPostcode}</span>}
            </div>
          )}

          <MapContainer center={[52.8, -1.6]} zoom={7} style={{ height: 'calc(100vh - 300px)', minHeight: 480 }}>
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            {positions.length > 0 && !flyTarget && !focusSite && <FitBounds positions={positions} />}
            {flyTarget && <FlyTo target={flyTarget} />}
            {focusSite && <FocusSite site={focusSite} markerRefs={markerRefs} />}

            {/* Radius circle around search centre */}
            {filters.centre && (
              <Circle
                center={[filters.centre.lat, filters.centre.lng]}
                radius={filters.radiusKm * 1000}
                pathOptions={{ color: '#4f8ef7', fillColor: '#4f8ef7', fillOpacity: 0.07, weight: 2 }}
              />
            )}

            {filtered.map(site => (
              <Marker
                key={site.siteId}
                position={[site.lat, site.lng]}
                icon={makeIcon(site.poleSign, site.siteId === focusSiteId)}
                ref={el => { if (el) markerRefs.current[site.siteId] = el }}
              >
                <Popup minWidth={240} maxWidth={320}>
                  <div style={{ fontFamily: 'sans-serif', fontSize: 13, lineHeight: 1.5 }}>
                    <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 3 }}>{site.siteName}</div>
                    {site.poleSign && (
                      <div style={{ marginBottom: 6 }}>
                        <span style={{
                          background: poleSignColour(site.poleSign), color: '#fff',
                          padding: '2px 10px', borderRadius: 12, fontSize: 11, fontWeight: 600
                        }}>{site.poleSign}</span>
                      </div>
                    )}
                    <div style={{ color: '#444', fontSize: 12 }}>
                      {[site.address1, site.address2].filter(Boolean).join(', ')}
                    </div>
                    <div style={{ color: '#444', fontSize: 12 }}>
                      {[site.city, site.county].filter(Boolean).join(', ')}
                    </div>
                    <div style={{ fontFamily: 'monospace', fontSize: 12, fontWeight: 700, marginTop: 2 }}>
                      {site.postCode}
                    </div>
                    {(site.openingHour || site.closingHour) && (
                      <div style={{ fontSize: 11, color: '#666', marginTop: 3 }}>
                        Hours: {site.openingHour || '—'} – {site.closingHour || '—'}
                        {' '}
                        <span style={{
                          fontWeight: 600,
                          color: isOpenNow(site.openingHour, site.closingHour) ? '#16a34a' : '#dc2626'
                        }}>
                          {isOpenNow(site.openingHour, site.closingHour) ? '● Open' : '● Closed'}
                        </span>
                      </div>
                    )}
                    {filters.centre && (
                      <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>
                        {haversineKm(site.lat, site.lng, filters.centre.lat, filters.centre.lng).toFixed(1)} km away
                      </div>
                    )}
                    {site.fuels && site.fuels.length > 0 && (
                      <div style={{ marginTop: 8, borderTop: '1px solid #e5e5e5', paddingTop: 8 }}>
                        <div style={{ fontWeight: 700, fontSize: 11, marginBottom: 5, color: '#444', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                          Current Fuel Prices
                        </div>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                          <thead>
                            <tr style={{ color: '#888', fontSize: 10 }}>
                              <th style={{ textAlign: 'left', fontWeight: 600, paddingBottom: 3 }}>Grade</th>
                              <th style={{ textAlign: 'right', fontWeight: 600, paddingBottom: 3 }}>£/Litre</th>
                            </tr>
                          </thead>
                          <tbody>
                            {site.fuels.map(f => (
                              <tr key={f.shortCode} style={{
                                background: filters.grade === f.grade ? '#fffbeb' : 'transparent'
                              }}>
                                <td style={{ color: '#333', paddingBottom: 2 }}>{f.grade}</td>
                                <td style={{ textAlign: 'right', fontWeight: 700, color: '#111', paddingBottom: 2 }}>
                                  £{Number(f.unitPrice).toFixed(4)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </Popup>
              </Marker>
            ))}
          </MapContainer>

          {/* Result count bar */}
          <div style={{
            padding: '6px 14px', background: 'var(--card-bg)', borderTop: '1px solid var(--card-border)',
            fontSize: 12, color: 'var(--text-secondary)', display: 'flex', gap: 16
          }}>
            <span><strong style={{ color: 'var(--text-primary)' }}>{filtered.length}</strong> station{filtered.length !== 1 ? 's' : ''} shown</span>
            {filters.centre && <span>within <strong style={{ color: 'var(--text-primary)' }}>{filters.radiusKm} km</strong> of {filters.centre.label}</span>}
            {filters.grade && <span>· <strong style={{ color: 'var(--text-primary)' }}>{filters.grade}</strong>{filters.maxPrice ? ` ≤ £${filters.maxPrice}` : ''}</span>}
            {filters.brand && <span>· <strong style={{ color: 'var(--text-primary)' }}>{filters.brand}</strong></span>}
            {filters.openNow && <span>· <strong style={{ color: '#16a34a' }}>Open now</strong></span>}
          </div>
        </div>
      )}
    </ErrorBoundary>
  )
}
