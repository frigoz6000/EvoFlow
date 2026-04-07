import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { useState, useEffect } from 'react'
import '../styles/theme.css'
import ErrorBoundary from './ErrorBoundary'
import api from '../api/client'
import {
  IconHome, IconBell, IconFuel, IconPump, IconMapPin,
  IconSearch, IconSun, IconMoon, IconTable,
  IconActivity, IconAlertTriangle, IconBarChart,
  IconAlarmActive, IconAlarmHistory, IconNotifications
} from './Icons'

const NAV = [
  { section: 'MAIN' },
  { to: '/', icon: IconHome, label: 'Home', exact: true },
  { to: '/alerts', icon: IconBell, label: 'Alerts' },
  { section: 'MONITORING' },
  { to: '/fuel-records', icon: IconFuel, label: 'Fuel Records' },
  { to: '/pump-monitoring', icon: IconPump, label: 'Pump Monitor' },
  { section: 'SITES' },
  { to: '/sites', icon: IconMapPin, label: 'All Sites' },
  { section: 'REPORTS' },
  { to: '/doms-info', icon: IconTable, label: 'Doms Info' },
  { to: '/flow-rates', icon: IconActivity, label: 'Flow Rates' },
  { to: '/device-alerts', icon: IconAlertTriangle, label: 'Device Alerts' },
  { to: '/volume-revenue', icon: IconBarChart, label: 'Volume & Revenue' },
  { section: 'ALARMS' },
  { to: '/active-alarms', icon: IconAlarmActive, label: 'Active Alarms' },
  { to: '/alarm-history', icon: IconAlarmHistory, label: 'Alarm History' },
  { to: '/alarm-notifications', icon: IconNotifications, label: 'Notifications' },
]

const PAGE_TITLES = {
  '/': 'Site Listing',
  '/sites': 'All Sites',
  '/fuel-records': 'Fuel Records',
  '/vehicles': 'Vehicles',
  '/pump-monitoring': 'Pump Monitoring',
  '/alerts': 'Alerts',
  '/doms-info': 'Doms Info',
  '/flow-rates': 'Flow Rates',
  '/device-alerts': 'Device Alerts',
  '/volume-revenue': 'Volume & Revenue',
  '/active-alarms': 'Active Alarms',
  '/alarm-history': 'Alarm History',
  '/alarm-notifications': 'Notifications',
}

export default function Layout() {
  const location = useLocation()
  const [search, setSearch] = useState('')
  const [collapsed, setCollapsed] = useState(() => window.innerWidth < 768)
  const [hovered, setHovered] = useState(false)
  const [dark, setDark] = useState(() => localStorage.getItem('evoflow-theme') === 'dark')
  const [pushing, setPushing] = useState(false)
  const [pushMsg, setPushMsg] = useState('')
  const title = PAGE_TITLES[location.pathname] || 'EvoFlow'

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
          {!effectiveCollapsed && <span className="sidebar-brand-name">EvoFlow</span>}
        </div>
        <div className="sidebar-nav">
          {NAV.map((item, i) => {
            if (item.section) {
              return effectiveCollapsed ? null : (
                <div key={i} className="sidebar-section-label">{item.section}</div>
              )
            }
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
            <span style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              <span style={{ display: 'block', width: 15, height: 2, background: 'currentColor', borderRadius: 1 }} />
              <span style={{ display: 'block', width: 15, height: 2, background: 'currentColor', borderRadius: 1 }} />
              <span style={{ display: 'block', width: 15, height: 2, background: 'currentColor', borderRadius: 1 }} />
            </span>
          </button>
          <div className="topbar-search">
            <span className="topbar-search-icon"><IconSearch size={13} /></span>
            <input
              type="text"
              placeholder="Search site ID or name..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
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
