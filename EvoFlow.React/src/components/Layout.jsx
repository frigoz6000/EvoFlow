import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useState, useEffect, useRef } from 'react'
import '../styles/theme.css'
import ErrorBoundary from './ErrorBoundary'
import api from '../api/client'
import { sitesApi } from '../api/client'
import {
  IconHome, IconPump, IconMapPin, IconMap,
  IconSearch, IconSun, IconMoon, IconTable,
  IconActivity, IconAlertTriangle, IconBarChart, IconDroplets,
  IconAlarmActive, IconAlarmHistory, IconNotifications,
  IconMenu, IconMail, IconSettings, IconCalendar, IconShieldCheck,
  IconMessageCircle
} from './Icons'

const NAV = [
  { section: 'MAIN', sectionIcon: IconHome },
  { to: '/', icon: IconHome, label: 'Home', exact: true },
  { section: 'MONITORING', sectionIcon: IconPump },
  { to: '/pump-monitoring', icon: IconPump, label: 'Pump Monitor' },
  { section: 'SITES', sectionIcon: IconMapPin },
  { to: '/sites', icon: IconMapPin, label: 'All Sites' },
  { to: '/site-map', icon: IconMap, label: 'Site Map' },
  { section: 'FUEL PRICES', sectionIcon: IconDroplets },
  { to: '/fuel-prices', icon: IconDroplets, label: 'Fuel Prices' },
  { to: '/fuel-price-history', icon: IconDroplets, label: 'Price History' },
  { section: 'REPORTS', sectionIcon: IconBarChart },
  { to: '/doms-info', icon: IconTable, label: 'Doms Info' },
  { to: '/flow-rates', icon: IconActivity, label: 'Flow Rates' },
  { to: '/device-alerts', icon: IconAlertTriangle, label: 'Device Alerts' },
  { to: '/volume-revenue', icon: IconBarChart, label: 'Volume & Revenue' },
  { to: '/tank-gauges', icon: IconDroplets, label: 'Tank Gauges' },
  { section: 'ALARMS', sectionIcon: IconAlarmActive },
  { to: '/active-alarms', icon: IconAlarmActive, label: 'Active Alarms' },
  { to: '/alarm-history', icon: IconAlarmHistory, label: 'Alarm History' },
  { to: '/alarm-notifications', icon: IconNotifications, label: 'Notifications' },
  { section: 'EMAIL', sectionIcon: IconMail },
  { to: '/config/email-recipients', icon: IconMail, label: 'Recipients' },
  { to: '/config/email-config', icon: IconMail, label: 'Settings' },
  { to: '/config/email-log', icon: IconMail, label: 'Email Log' },
  { section: 'WHATSAPP', sectionIcon: IconMessageCircle },
  { to: '/config/whatsapp', icon: IconNotifications, label: 'WhatsApp Alerts' },
  { section: 'CONFIG', sectionIcon: IconSettings },
  { to: '/config/alarm-settings', icon: IconSettings, label: 'Alarm Settings' },
  { to: '/config/report-schedules', icon: IconCalendar, label: 'Report Schedules' },
  { to: '/config/import-data', icon: IconTable, label: 'Import Data' },
  { to: '/data-integrity', icon: IconShieldCheck, label: 'Data Integrity' },
]

const PAGE_TITLES = {
  '/': 'Site Listing',
  '/sites': 'All Sites',
  '/site-map': 'Site Map',
  '/vehicles': 'Vehicles',
  '/pump-monitoring': 'Pump Monitoring',
  '/doms-info': 'Doms Info',
  '/flow-rates': 'Flow Rates',
  '/device-alerts': 'Device Alerts',
  '/volume-revenue': 'Volume & Revenue',
  '/tank-gauges': 'Tank Gauges',
  '/active-alarms': 'Active Alarms',
  '/alarm-history': 'Alarm History',
  '/alarm-notifications': 'Notifications',
  '/config/email-recipients': 'Email Recipients',
  '/config/email-config': 'Email Configuration',
  '/config/email-log': 'Email Log',
  '/config/whatsapp': 'WhatsApp Alerts',
  '/config/alarm-settings': 'Alarm Settings',
  '/config/report-schedules': 'Report Schedules',
  '/config/import-data': 'Import Data',
  '/data-integrity': 'Data Integrity',
  '/fuel-prices': 'Fuel Prices',
  '/fuel-price-history': 'Fuel Price History',
}

// Group NAV items into sections for accordion rendering
const NAV_SECTIONS = (() => {
  const sections = []
  let current = null
  for (const item of NAV) {
    if (item.section) {
      current = { label: item.section, icon: item.sectionIcon, items: [] }
      sections.push(current)
    } else if (current) {
      current.items.push(item)
    }
  }
  return sections
})()

export default function Layout() {
  const location = useLocation()
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [collapsed, setCollapsed] = useState(() => window.innerWidth < 768)
  const [hovered, setHovered] = useState(false)
  const [dark, setDark] = useState(() => localStorage.getItem('evoflow-theme') === 'dark')
  const [pushing, setPushing] = useState(false)
  const [pushMsg, setPushMsg] = useState('')
  const [allSites, setAllSites] = useState([])
  const [searchFocused, setSearchFocused] = useState(false)
  const [openSection, setOpenSection] = useState(null)
  const searchRef = useRef(null)
  const title = PAGE_TITLES[location.pathname] || 'EvoFlow'

  function toggleSection(label) {
    setOpenSection(prev => prev === label ? null : label)
  }

  useEffect(() => {
    sitesApi.getAll().then(s => setAllSites(s || [])).catch(() => {})
  }, [])

  const siteSuggestions = search.trim().length >= 1
    ? allSites.filter(s => {
        const q = search.toLowerCase()
        return (s.siteId || '').toLowerCase().includes(q) ||
               (s.siteName || '').toLowerCase().includes(q)
      }).slice(0, 8)
    : []

  function handleSiteSelect(site) {
    setSearch('')
    setSearchFocused(false)
    navigate(`/sites/${site.siteId}`)
  }

  function handleSearchKeyDown(e) {
    if (e.key === 'Enter' && siteSuggestions.length === 1) {
      handleSiteSelect(siteSuggestions[0])
    }
    if (e.key === 'Escape') {
      setSearch('')
      setSearchFocused(false)
      searchRef.current?.blur()
    }
  }

  // Sidebar visually expands on hover even when collapsed
  const effectiveCollapsed = collapsed && !hovered

  function handleGitPush() {
    setPushing(true)
    setPushMsg('')
    api.post('/git/push')
      .then(r => setPushMsg(r.data?.message || 'Pushed!'))
      .catch(e => setPushMsg(e.response?.data?.message || 'Push failed'))
      .finally(() => setPushing(false))
  }

  useEffect(() => {
    function handleResize() {
      if (window.innerWidth < 768) setCollapsed(true)
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light')
    localStorage.setItem('evoflow-theme', dark ? 'dark' : 'light')
  }, [dark])

  return (
    <>
      {/* Sidebar */}
      <nav
        className={`sidebar${effectiveCollapsed ? ' sidebar-collapsed' : ''}`}
        onMouseEnter={() => collapsed && setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        <div className="sidebar-brand">
          <img src="/evoflow-icon.png" alt="EvoFlow" className="sidebar-brand-logo-img" />
          {!effectiveCollapsed && <span className="sidebar-brand-name">EvoFlow</span>}
        </div>
        <div className="sidebar-nav">
          {NAV_SECTIONS.map(sec => {
            const SectionIcon = sec.icon
            return (
            <div key={sec.label}>
              {!effectiveCollapsed && (
                <button
                  className="sidebar-section-toggle"
                  onClick={() => toggleSection(sec.label)}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {SectionIcon && <SectionIcon size={13} />}
                    {sec.label}
                  </span>
                  <svg
                    width="10" height="10" viewBox="0 0 10 10"
                    fill="none" stroke="currentColor" strokeWidth="1.8"
                    style={{ transition: 'transform 0.2s', transform: openSection === sec.label ? 'rotate(180deg)' : 'rotate(0deg)', flexShrink: 0 }}
                  >
                    <polyline points="1,3 5,7 9,3" />
                  </svg>
                </button>
              )}
              {(effectiveCollapsed || openSection === sec.label) && sec.items.map(item => {
                const Icon = item.icon
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.exact}
                    className={({ isActive }) => isActive ? 'active' : ''}
                    title={effectiveCollapsed ? item.label : undefined}
                    onClick={() => { if (window.innerWidth < 768) { setCollapsed(true); setHovered(false) } }}
                  >
                    <span className="nav-icon"><Icon size={15} /></span>
                    {!effectiveCollapsed && item.label}
                  </NavLink>
                )
              })}
            </div>
          )})}
        </div>
      </nav>

      {/* Mobile overlay — tap to close sidebar */}
      {!collapsed && <div className="sidebar-overlay" onClick={() => { setCollapsed(true); setHovered(false) }} />}

      {/* Main */}
      <div className={`main-wrapper${effectiveCollapsed ? ' main-wrapper-collapsed' : ''}`}>
        {/* Topbar */}
        <header className="topbar">
          <button
            className="topbar-icon-btn"
            onClick={() => { setCollapsed(c => !c); setHovered(false) }}
            title={collapsed ? 'Expand menu' : 'Collapse menu'}
            style={{ marginRight: 8 }}
          >
            <IconMenu size={18} />
          </button>
          <div className="topbar-search" style={{ position: 'relative' }}>
            <span className="topbar-search-icon"><IconSearch size={13} /></span>
            <input
              ref={searchRef}
              type="text"
              placeholder="Search site ID or name..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => setTimeout(() => setSearchFocused(false), 150)}
              onKeyDown={handleSearchKeyDown}
            />
            {searchFocused && siteSuggestions.length > 0 && (
              <div style={{
                position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 9999,
                background: 'var(--card-bg)', border: '1px solid var(--card-border)',
                borderRadius: 8, boxShadow: 'var(--card-shadow)',
                marginTop: 4, overflow: 'hidden'
              }}>
                {siteSuggestions.map(site => (
                  <div
                    key={site.siteId}
                    onMouseDown={() => handleSiteSelect(site)}
                    style={{
                      padding: '8px 12px', cursor: 'pointer', display: 'flex',
                      alignItems: 'center', gap: 10, fontSize: 13,
                      borderBottom: '1px solid var(--table-border)'
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--hover-bg, rgba(0,0,0,0.04))'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    <span style={{ fontWeight: 700, color: 'var(--accent)', fontFamily: 'monospace', fontSize: 12, minWidth: 44 }}>{site.siteId}</span>
                    <span style={{ color: 'var(--text-primary)', flex: 1 }}>{site.siteName}</span>
                    {site.city && <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>{site.city}</span>}
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="topbar-spacer" />
          <div className="topbar-actions">
            <button
              className="topbar-icon-btn"
              onClick={handleGitPush}
              disabled={pushing}
              title={pushing ? 'Pushing to GitHub…' : pushMsg || 'Push to GitHub'}
              style={{ opacity: pushing ? 0.6 : 1, position: 'relative' }}
            >
              {pushing ? (
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ animation: 'spin 1s linear infinite' }}>
                  <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
                </svg>
              ) : (
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                  <polyline points="17 8 12 3 7 8"/>
                  <line x1="12" y1="3" x2="12" y2="15"/>
                </svg>
              )}
            </button>
            <button
              className="topbar-icon-btn"
              onClick={() => setDark(d => !d)}
              title={dark ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {dark ? <IconSun size={15} /> : <IconMoon size={15} />}
            </button>
            <div className="topbar-avatar" title="User">U</div>
          </div>
        </header>

        {/* Page */}
        <main className="page-content">
          <ErrorBoundary fallback="This page encountered an error. Please try navigating to another page or refresh.">
            <Outlet context={{ globalSearch: search }} />
          </ErrorBoundary>
        </main>
      </div>
    </>
  )
}
