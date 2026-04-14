import { useEffect, useState, useRef, useCallback } from 'react'
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { sitesApi } from '../api/client'
import api from '../api/client'
import ErrorBoundary from '../components/ErrorBoundary'

// Fix Leaflet default icon paths broken by bundlers
delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
})

// Auto-fit map bounds when markers are first loaded
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

const POLE_COLOURS = {
  bp: '#007a33',
  shell: '#fbce07',
  texaco: '#c8102e',
  esso: '#003087',
  jet: '#e55b10',
  gulf: '#f79400',
}

function poleSignColour(poleSign) {
  const s = (poleSign || '').toLowerCase()
  for (const [brand, colour] of Object.entries(POLE_COLOURS)) {
    if (s.includes(brand)) return colour
  }
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

export default function SiteMap() {
  const [sites, setSites] = useState([])
  const [loading, setLoading] = useState(true)
  const [geocodeStatus, setGeocodeStatus] = useState(null)
  const pollRef = useRef(null)

  const fetchSites = useCallback(() => {
    sitesApi.getMapData()
      .then(data => setSites(data || []))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  const fetchStatus = useCallback(() => {
    api.get('/sites/geocode/status')
      .then(r => {
        setGeocodeStatus(r.data)
        if (r.data.isRunning) {
          // Refresh site data periodically while running to show new pins
          fetchSites()
        } else if (pollRef.current) {
          clearInterval(pollRef.current)
          pollRef.current = null
          fetchSites() // final refresh
        }
      })
      .catch(console.error)
  }, [fetchSites])

  useEffect(() => {
    fetchSites()
    fetchStatus()
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [fetchSites, fetchStatus])

  function startGeocoding() {
    api.post('/sites/geocode')
      .then(() => {
        fetchStatus()
        pollRef.current = setInterval(fetchStatus, 3000)
      })
      .catch(e => {
        if (e.response?.status === 409) {
          // already running — just start polling
          pollRef.current = setInterval(fetchStatus, 3000)
        }
      })
  }

  const plotted = sites.filter(s => s.lat != null && s.lng != null)
  const unplotted = sites.filter(s => s.lat == null || s.lng == null)
  const positions = plotted.map(s => [s.lat, s.lng])

  const isGeocoding = geocodeStatus?.isRunning === true

  return (
    <ErrorBoundary fallback="Map page error.">
      <div className="page-header mb-4">
        <div>
          <div className="page-title">Site Map</div>
          <div className="page-subtitle">
            {loading ? 'Loading…' : `${plotted.length} of ${sites.length} sites plotted`}
          </div>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 12 }}>
          {!isGeocoding && unplotted.length > 0 && (
            <button
              className="btn btn-primary"
              onClick={startGeocoding}
              style={{
                background: 'var(--accent)', color: '#fff', border: 'none',
                padding: '8px 16px', borderRadius: 6, cursor: 'pointer', fontSize: 13
              }}
            >
              Geocode {unplotted.length} missing sites
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="card">
          <div className="loading-state"><div className="spinner" />Loading sites...</div>
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden', minHeight: 520 }}>
          {isGeocoding && (
            <div style={{
              padding: '8px 16px', background: 'var(--accent)', color: '#fff',
              fontSize: 12, display: 'flex', alignItems: 'center', gap: 8
            }}>
              <div className="spinner" style={{ width: 14, height: 14, borderColor: 'rgba(255,255,255,0.3)', borderTopColor: '#fff' }} />
              Geocoding postcodes and saving to database — {geocodeStatus.done}/{geocodeStatus.total} done
              {geocodeStatus.currentPostcode && <span style={{ opacity: 0.8 }}> · {geocodeStatus.currentPostcode}</span>}
            </div>
          )}

          <MapContainer
            center={[54.0, -2.5]}
            zoom={6}
            style={{ height: 'calc(100vh - 240px)', minHeight: 460 }}
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            {positions.length > 1 && <FitBounds positions={positions} />}
            {plotted.map(site => (
              <Marker
                key={site.siteId}
                position={[site.lat, site.lng]}
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
                      {[site.address1, site.address2, site.city, site.county, site.postCode, site.country]
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
