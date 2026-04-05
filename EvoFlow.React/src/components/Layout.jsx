import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { useState, useEffect } from 'react'
import '../styles/theme.css'
import ErrorBoundary from './ErrorBoundary'
import {
  IconHome, IconBell, IconFuel, IconPump, IconCar, IconMapPin,
  IconSearch, IconSun, IconMoon, IconChevronLeft, IconChevronRight, IconTable
} from './Icons'

const NAV = [
  { section: 'MAIN' },
  { to: '/', icon: IconHome, label: 'Home', exact: true },
  { to: '/alerts', icon: IconBell, label: 'Alerts' },
  { section: 'MONITORING' },
  { to: '/fuel-records', icon: IconFuel, label: 'Fuel Records' },
  { to: '/pump-monitoring', icon: IconPump, label: 'Pump Monitor' },
  { section: 'FLEET' },
  { to: '/vehicles', icon: IconCar, label: 'Vehicles' },
  { to: '/sites', icon: IconMapPin, label: 'All Sites' },
  { section: 'REPORTS' },
  { to: '/doms-info', icon: IconTable, label: 'Doms Info' },
]

const PAGE_TITLES = {
  '/': 'Site Listing',
  '/sites': 'All Sites',
  '/fuel-records': 'Fuel Records',
  '/vehicles': 'Vehicles',
  '/pump-monitoring': 'Pump Monitoring',
  '/alerts': 'Alerts',
  '/doms-info': 'Doms Info',
}

export default function Layout() {
  const location = useLocation()
  const [search, setSearch] = useState('')
  const [collapsed, setCollapsed] = useState(false)
  const [dark, setDark] = useState(() => localStorage.getItem('evoflow-theme') === 'dark')
  const title = PAGE_TITLES[location.pathname] || 'EvoFlow'

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light')
    localStorage.setItem('evoflow-theme', dark ? 'dark' : 'light')
  }, [dark])

  return (
    <>
      {/* Sidebar */}
      <nav className={`sidebar${collapsed ? ' sidebar-collapsed' : ''}`}>
        <div className="sidebar-brand">
          <div className="sidebar-brand-logo">E</div>
          {!collapsed && <span className="sidebar-brand-name">EvoFlow</span>}
        </div>
        <div className="sidebar-nav">
          {NAV.map((item, i) => {
            if (item.section) {
              return collapsed ? null : (
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
                title={collapsed ? item.label : undefined}
              >
                <span className="nav-icon"><Icon size={15} /></span>
                {!collapsed && item.label}
              </NavLink>
            )
          })}
        </div>
        <button
          className="sidebar-collapse-btn"
          onClick={() => setCollapsed(c => !c)}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          <span className="nav-icon">
            {collapsed ? <IconChevronRight size={14} /> : <IconChevronLeft size={14} />}
          </span>
          {!collapsed && <span>Collapse</span>}
        </button>
      </nav>

      {/* Main */}
      <div className={`main-wrapper${collapsed ? ' main-wrapper-collapsed' : ''}`}>
        {/* Topbar */}
        <header className="topbar">
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
