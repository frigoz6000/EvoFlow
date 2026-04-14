import { useEffect, useState, useRef } from 'react'
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { sitesApi } from '../api/client'
import ErrorBoundary from '../components/ErrorBoundary'

// Fix Leaflet default icon paths broken by bundlers
delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
})

const NOMINATIM_DELAY_MS = 1100 // Respect Nominatim 1 req/sec policy

async function geocodePostcode(postcode, country) {
  try {
    // Derive countrycode: UK/GB → gb, default to gb
    const cc = (country || 'UK').trim().toUpperCase() === 'UK' ? 'gb' : (country || 'gb').toLowerCase().slice(0, 2)
    const encoded = encodeURIComponent(postcode)
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encoded}&format=json&limit=1&countrycode=${cc}`,
      { headers: { 'Accept-Language': 'en', 'User-Agent': 'EvoFlow/1.0' } }
    )
    const data = await res.json()
    if (data && data.length > 0) {
      return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) }
    }
  } catch {
    // ignore geocode failures
  }
  return null
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// Auto-fit map bounds when markers change
function FitBounds({ positions }) {
  const map = useMap()
  const fitted = useRef(false)
  useEffect(() => {
    if (!fitted.current && positions.length > 0) {
      const bounds = L.latLngBounds(positions)
      map.fitBounds(bounds, { padding: [40, 40] })
      fitted.current = true
    }
  }, [positions, map])
  return null
}

export default function SiteMap() {
  const [sites, setSites] = useState([])
  const [geocoded, setGeocoded] = useState([]) // { site, lat, lng }
  const [loading, setLoading] = useState(true)
  const [geocoding, setGeocoding] = useState(false)
  const [progress, setProgress] = useState({ done: 0, total: 0 })
  const cancelled = useRef(false)

  useEffect(() => {
    cancelled.current = false
    sitesApi.getMapData()
      .then(data => {
        setSites(data || [])
        setLoading(false)
      })
      .catch(() => setLoading(false))
    return () => { cancelled.current = true }
  }, [])

  useEffect(() => {
    if (sites.length === 0) return

    // Check sessionStorage cache first — v2 forces re-geocode with countrycode fix
    const cacheKey = 'evoflow-geocache-v2'
    let cache = {}
    try { cache = JSON.parse(sessionStorage.getItem(cacheKey) || '{}') } catch { cache = {} }

    const cached = []
    const toFetch = []
    for (const site of sites) {
      if (site.postCode && cache[site.postCode]) {
        cached.push({ site, ...cache[site.postCode] })
      } else if (site.postCode) {
        toFetch.push(site)
      }
    }

    setGeocoded(cached)
    setProgress({ done: cached.length, total: sites.length })

    if (toFetch.length === 0) return

    setGeocoding(true)
    ;(async () => {
      const newCache = { ...cache }
      for (let i = 0; i < toFetch.length; i++) {
        if (cancelled.current) break
        const site = toFetch[i]
        const coords = await geocodePostcode(site.postCode, site.country)
        if (coords) {
          newCache[site.postCode] = coords
          setGeocoded(prev => [...prev, { site, ...coords }])
        }
        setProgress({ done: cached.length + i + 1, total: sites.length })
        if (i < toFetch.length - 1) await sleep(NOMINATIM_DELAY_MS)
      }
      try { sessionStorage.setItem(cacheKey, JSON.stringify(newCache)) } catch { /* quota */ }
      setGeocoding(false)
    })()
  }, [sites])

  const positions = geocoded.map(g => [g.lat, g.lng])

  const poleSignColour = (poleSign) => {
    const s = (poleSign || '').toLowerCase()
    if (s.includes('bp')) return '#007a33'
    if (s.includes('shell')) return '#fbce07'
    if (s.includes('texaco')) return '#c8102e'
    if (s.includes('esso')) return '#003087'
    if (s.includes('jet')) return '#e55b10'
    if (s.includes('gulf')) return '#f79400'
    return '#4f8ef7'
  }

  function makeIcon(poleSign) {
    const colour = poleSignColour(poleSign)
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="36" viewBox="0 0 28 36">
      <path d="M14 0C6.268 0 0 6.268 0 14c0 9.956 14 22 14 22S28 23.956 28 14C28 6.268 21.732 0 14 0z" fill="${colour}" stroke="white" stroke-width="1.5"/>
      <circle cx="14" cy="14" r="6" fill="white" opacity="0.9"/>
    </svg>`
    return L.divIcon({
      html: svg,
      iconSize: [28, 36],
      iconAnchor: [14, 36],
      popupAnchor: [0, -36],
      className: ''
    })
  }

  return (
    <ErrorBoundary fallback="Map page error.">
      <div className="page-header mb-4">
        <div>
          <div className="page-title">Site Map</div>
          <div className="page-subtitle">
            {loading ? 'Loading sites…' : geocoding
              ? `Geocoding postcodes — ${progress.done} / ${progress.total}`
              : `${geocoded.length} of ${sites.length} sites plotted`}
          </div>
        </div>
      </div>

      {loading ? (
        <div className="card">
          <div className="loading-state"><div className="spinner" />Loading sites...</div>
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden', minHeight: 520 }}>
          {geocoding && (
            <div style={{
              padding: '8px 16px', background: 'var(--accent)', color: '#fff',
              fontSize: 12, display: 'flex', alignItems: 'center', gap: 8
            }}>
              <div className="spinner" style={{ width: 14, height: 14, borderColor: 'rgba(255,255,255,0.3)', borderTopColor: '#fff' }} />
              Geocoding postcodes via OpenStreetMap ({progress.done}/{progress.total})…
              &nbsp;Cached results load instantly on next visit.
            </div>
          )}
          <MapContainer
            center={[54.0, -2.5]}
            zoom={6}
            style={{ height: geocoding ? 'calc(100vh - 280px)' : 'calc(100vh - 250px)', minHeight: 460 }}
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            {positions.length > 1 && <FitBounds positions={positions} />}
            {geocoded.map(({ site, lat, lng }) => (
              <Marker
                key={site.siteId}
                position={[lat, lng]}
                icon={makeIcon(site.poleSign)}
              >
                <Popup minWidth={220} maxWidth={300}>
                  <div style={{ fontFamily: 'sans-serif', fontSize: 13 }}>
                    <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>
                      {site.siteName}
                    </div>
                    {site.poleSign && (
                      <div style={{ marginBottom: 6 }}>
                        <span style={{
                          background: poleSignColour(site.poleSign), color: '#fff',
                          padding: '1px 8px', borderRadius: 10, fontSize: 11, fontWeight: 600
                        }}>
                          {site.poleSign}
                        </span>
                      </div>
                    )}
                    <div style={{ color: '#555', lineHeight: 1.6, marginBottom: 6 }}>
                      {[site.address1, site.address2, site.city, site.county, site.postCode]
                        .filter(Boolean).join(', ')}
                    </div>
                    <div style={{ fontSize: 11, color: '#888', fontFamily: 'monospace' }}>
                      ID: {site.siteId}
                    </div>
                    {site.fuels && site.fuels.length > 0 && (
                      <div style={{ marginTop: 8, borderTop: '1px solid #eee', paddingTop: 8 }}>
                        <div style={{ fontWeight: 600, fontSize: 12, marginBottom: 4 }}>Fuel Prices (avg ppl)</div>
                        {site.fuels.map(f => (
                          <div key={f.fuelTypeId} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 2 }}>
                            <span>{f.fuelTypeId}</span>
                            <span style={{ fontWeight: 600 }}>
                              {f.avgPpl != null ? `${f.avgPpl}p` : '—'}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </Popup>
              </Marker>
            ))}
          </MapContainer>
        </div>
      )}
    </ErrorBoundary>
  )
}
