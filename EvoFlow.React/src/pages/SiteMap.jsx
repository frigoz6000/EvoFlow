import { useEffect, useState, useRef } from 'react'
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

// Fit map to the bounds of all plotted markers once on first load
function FitBounds({ positions }) {
  const map = useMap()
  const fitted = useRef(false)
  useEffect(() => {
    if (!fitted.current && positions.length > 0) {
      const bounds = L.latLngBounds(positions)
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 10 })
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
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="26" height="34" viewBox="0 0 26 34">
    <path d="M13 0C5.82 0 0 5.82 0 13c0 9.2 13 21 13 21S26 22.2 26 13C26 5.82 20.18 0 13 0z" fill="${colour}" stroke="white" stroke-width="1.5"/>
    <circle cx="13" cy="13" r="5.5" fill="white" opacity="0.9"/>
  </svg>`
  return L.divIcon({
    html: svg,
    iconSize: [26, 34],
    iconAnchor: [13, 34],
    popupAnchor: [0, -34],
    className: ''
  })
}

export default function SiteMap() {
  const [sites, setSites] = useState([])
  const [loading, setLoading] = useState(true)
  const [geocodeStatus, setGeocodeStatus] = useState(null)
  const pollRef = useRef(null)

  useEffect(() => {
    sitesApi.getMapData()
      .then(data => setSites(data || []))
      .catch(console.error)
      .finally(() => setLoading(false))

    // Check if a geocode run is already in progress
    api.get('/sites/geocode/status')
      .then(r => {
        setGeocodeStatus(r.data)
        if (r.data.isRunning) startPolling()
      })
      .catch(() => {})

    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [])

  function startPolling() {
    if (pollRef.current) return
    pollRef.current = setInterval(() => {
      api.get('/sites/geocode/status').then(r => {
        setGeocodeStatus(r.data)
        if (!r.data.isRunning) {
          clearInterval(pollRef.current)
          pollRef.current = null
          // Refresh site data to pick up newly geocoded sites
          sitesApi.getMapData().then(data => setSites(data || [])).catch(() => {})
        }
      }).catch(() => {})
    }, 3000)
  }

  function triggerGeocoding() {
    api.post('/sites/geocode')
      .then(() => startPolling())
      .catch(e => { if (e.response?.status === 409) startPolling() })
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
            {loading
              ? 'Loading…'
              : `${plotted.length} site${plotted.length !== 1 ? 's' : ''} plotted across the UK`}
          </div>
        </div>
        {!isGeocoding && unplotted.length > 0 && (
          <div style={{ marginLeft: 'auto' }}>
            <button
              onClick={triggerGeocoding}
              style={{
                background: 'var(--accent)', color: '#fff', border: 'none',
                padding: '8px 16px', borderRadius: 6, cursor: 'pointer', fontSize: 13, fontWeight: 600
              }}
            >
              Geocode {unplotted.length} missing sites
            </button>
          </div>
        )}
      </div>

      {loading ? (
        <div className="card">
          <div className="loading-state"><div className="spinner" />Loading sites…</div>
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          {isGeocoding && (
            <div style={{
              padding: '8px 16px', background: 'var(--accent)', color: '#fff',
              fontSize: 12, display: 'flex', alignItems: 'center', gap: 8
            }}>
              <div className="spinner" style={{
                width: 13, height: 13,
                borderColor: 'rgba(255,255,255,0.3)', borderTopColor: '#fff'
              }} />
              Validating &amp; geocoding postcodes — {geocodeStatus.done}/{geocodeStatus.total}
              {geocodeStatus.currentPostcode && (
                <span style={{ opacity: 0.75 }}>&nbsp;· {geocodeStatus.currentPostcode}</span>
              )}
            </div>
          )}

          <MapContainer
            center={[52.8, -1.6]}
            zoom={7}
            style={{ height: 'calc(100vh - 230px)', minHeight: 500 }}
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />

            {/* Auto-fit to all site markers once loaded */}
            {positions.length > 0 && <FitBounds positions={positions} />}

            {plotted.map(site => (
              <Marker
                key={site.siteId}
                position={[site.lat, site.lng]}
                icon={makeIcon(site.poleSign)}
              >
                <Popup minWidth={240} maxWidth={320}>
                  <div style={{ fontFamily: 'sans-serif', fontSize: 13, lineHeight: 1.5 }}>
                    {/* Site name + brand */}
                    <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 3 }}>
                      {site.siteName}
                    </div>
                    {site.poleSign && (
                      <div style={{ marginBottom: 6 }}>
                        <span style={{
                          background: poleSignColour(site.poleSign), color: '#fff',
                          padding: '2px 10px', borderRadius: 12, fontSize: 11, fontWeight: 600
                        }}>
                          {site.poleSign}
                        </span>
                      </div>
                    )}

                    {/* Address */}
                    <div style={{ color: '#444', marginBottom: 2, fontSize: 12 }}>
                      {[site.address1, site.address2].filter(Boolean).join(', ')}
                    </div>
                    <div style={{ color: '#444', fontSize: 12 }}>
                      {[site.city, site.county].filter(Boolean).join(', ')}
                    </div>
                    <div style={{ fontFamily: 'monospace', fontSize: 12, color: '#222', fontWeight: 600, marginTop: 2 }}>
                      {site.postCode}
                    </div>

                    {/* Opening hours */}
                    {(site.openingHour || site.closingHour) && (
                      <div style={{ fontSize: 11, color: '#666', marginTop: 4 }}>
                        Hours: {site.openingHour || '—'} – {site.closingHour || '—'}
                      </div>
                    )}

                    {/* Fuel prices */}
                    {site.fuels && site.fuels.length > 0 && (
                      <div style={{ marginTop: 8, borderTop: '1px solid #e5e5e5', paddingTop: 8 }}>
                        <div style={{
                          fontWeight: 700, fontSize: 11, marginBottom: 5,
                          color: '#444', textTransform: 'uppercase', letterSpacing: '0.5px'
                        }}>
                          Current Fuel Prices
                        </div>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                          <thead>
                            <tr style={{ color: '#888', fontSize: 10 }}>
                              <th style={{ textAlign: 'left', fontWeight: 600, paddingBottom: 3 }}>Grade</th>
                              <th style={{ textAlign: 'right', fontWeight: 600, paddingBottom: 3 }}>Price/L</th>
                            </tr>
                          </thead>
                          <tbody>
                            {site.fuels.map(f => (
                              <tr key={f.shortCode}>
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
        </div>
      )}
    </ErrorBoundary>
  )
}
