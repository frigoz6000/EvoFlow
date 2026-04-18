import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useState, useEffect, useRef } from 'react'
import '../styles/theme.css'
import ErrorBoundary from './ErrorBoundary'
import LanguageSelector from './LanguageSelector'
import api from '../api/client'
import { sitesApi } from '../api/client'
import { useLanguage } from '../i18n/LanguageContext'
import { useAuth } from '../auth/AuthContext'
import {
  IconHome, IconPump, IconMapPin, IconMap,
  IconSearch, IconSun, IconMoon, IconTable,
  IconActivity, IconAlertTriangle, IconBarChart, IconDroplets,
  IconAlarmActive, IconAlarmHistory, IconNotifications,
  IconMenu, IconMail, IconSettings, IconCalendar, IconShieldCheck,
  IconMessageCircle, IconUser, IconUsers, IconSliders, IconClipboardList
} from './Icons'

const NAV_DEF = [
  { section: 'nav_main', sectionIcon: IconHome },
  { to: '/', icon: IconHome, labelKey: 'nav_home', exact: true },
  { section: 'nav_monitoring', sectionIcon: IconPump },
  { to: '/pump-monitoring', icon: IconPump, labelKey: 'nav_pump_monitor' },
  { section: 'nav_sites', sectionIcon: IconMapPin },
  { to: '/sites', icon: IconMapPin, labelKey: 'nav_all_sites' },
  { to: '/site-map', icon: IconMap, labelKey: 'nav_site_map' },
  { section: 'nav_fuel_prices', sectionIcon: IconDroplets },
  { to: '/fuel-prices', icon: IconDroplets, labelKey: 'nav_fuel_prices_item' },
  { to: '/fuel-price-history', icon: IconDroplets, labelKey: 'nav_price_history' },
  { section: 'nav_reports', sectionIcon: IconBarChart },
  { to: '/doms-info', icon: IconTable, labelKey: 'nav_doms_info' },
  { to: '/flow-rates', icon: IconActivity, labelKey: 'nav_flow_rates' },
  { to: '/device-alerts', icon: IconAlertTriangle, labelKey: 'nav_device_alerts' },
  { to: '/volume-revenue', icon: IconBarChart, labelKey: 'nav_volume_revenue' },
  { to: '/tank-gauges', icon: IconDroplets, labelKey: 'nav_tank_gauges' },
  { section: 'nav_alarms', sectionIcon: IconAlarmActive },
  { to: '/active-alarms', icon: IconAlarmActive, labelKey: 'nav_active_alarms' },
  { to: '/alarm-history', icon: IconAlarmHistory, labelKey: 'nav_alarm_history' },
  { to: '/alarm-notifications', icon: IconNotifications, labelKey: 'nav_notifications' },
  { section: 'nav_email', sectionIcon: IconMail },
  { to: '/config/email-recipients', icon: IconUsers, labelKey: 'nav_recipients' },
  { to: '/config/email-config', icon: IconSliders, labelKey: 'nav_email_settings' },
  { to: '/config/email-log', icon: IconClipboardList, labelKey: 'nav_email_log' },
  { section: 'nav_whatsapp', sectionIcon: IconMessageCircle },
  { to: '/config/whatsapp', icon: IconNotifications, labelKey: 'nav_whatsapp_alerts' },
  { section: 'nav_config', sectionIcon: IconSettings },
  { to: '/config/alarm-settings', icon: IconSettings, labelKey: 'nav_alarm_settings' },
  { to: '/config/report-schedules', icon: IconCalendar, labelKey: 'nav_report_schedules' },
  { to: '/config/import-data', icon: IconTable, labelKey: 'nav_import_data' },
  { to: '/data-integrity', icon: IconShieldCheck, labelKey: 'nav_data_integrity' },
]

const PAGE_TITLE_KEYS = {
  '/': 'nav_home',
  '/sites': 'nav_all_sites',
  '/site-map': 'nav_site_map',
  '/pump-monitoring': 'nav_pump_monitor',
  '/doms-info': 'nav_doms_info',
  '/flow-rates': 'nav_flow_rates',
  '/device-alerts': 'nav_device_alerts',
  '/volume-revenue': 'nav_volume_revenue',
  '/tank-gauges': 'nav_tank_gauges',
  '/active-alarms': 'nav_active_alarms',
  '/alarm-history': 'nav_alarm_history',
  '/alarm-notifications': 'nav_notifications',
  '/config/email-recipients': 'nav_recipients',
  '/config/email-config': 'page_title_email_config',
  '/config/email-log': 'nav_email_log',
  '/config/whatsapp': 'nav_whatsapp_alerts',
  '/config/alarm-settings': 'nav_alarm_settings',
  '/config/report-schedules': 'nav_report_schedules',
  '/config/import-data': 'nav_import_data',
  '/data-integrity': 'nav_data_integrity',
  '/fuel-prices': 'nav_fuel_prices_item',
  '/fuel-price-history': 'nav_price_history',
}

export default function Layout() {
  const location = useLocation()
  const navigate = useNavigate()
  const { t } = useLanguage()
  const { username, logout } = useAuth()
  const [search, setSearch] = useState('')
  const [collapsed, setCollapsed] = useState(() => window.innerWidth < 768)
  const [hovered, setHovered] = useState(false)
  const [dark, setDark] = useState(() => localStorage.getItem('evoflow-theme') === 'dark')
  const [pushing, setPushing] = useState(false)
  const [pushMsg, setPushMsg] = useState('')
  const [allSites, setAllSites] = useState([])
  const [searchFocused, setSearchFocused] = useState(false)
  const [openSection, setOpenSection] = useState(null)
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const searchRef = useRef(null)
  const titleKey = PAGE_TITLE_KEYS[location.pathname]
  const title = titleKey ? t(titleKey) : 'EvoFlow'

  const NAV_SECTIONS = (() => {
    const sections = []
    let current = null
    for (const item of NAV_DEF) {
      if (item.section) {
        current = { label: t(item.section), icon: item.sectionIcon, items: [] }
        sections.push(current)
      } else if (current) {
        current.items.push({ ...item, label: t(item.labelKey) })
      }
    }
    return sections
  })()

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
            title={collapsed ? t('expand_menu') : t('collapse_menu')}
            style={{ marginRight: 8 }}
          >
            <IconMenu size={18} />
          </button>
          <div className="topbar-search" style={{ position: 'relative' }}>
            <span className="topbar-search-icon"><IconSearch size={13} /></span>
            <input
              ref={searchRef}
              type="text"
              placeholder={t('search_placeholder')}
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
            <LanguageSelector />
            <button
              className="topbar-icon-btn"
              onClick={handleGitPush}
              disabled={pushing}
              title={pushing ? t('pushing') : pushMsg || t('push_github')}
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
              title={dark ? t('light_mode') : t('dark_mode')}
            >
              {dark ? <IconSun size={15} /> : <IconMoon size={15} />}
            </button>
            <div style={{ position: 'relative' }}>
              <button
                className="topbar-icon-btn"
                onClick={() => setUserMenuOpen(o => !o)}
                onBlur={() => setTimeout(() => setUserMenuOpen(false), 150)}
                title={username}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 8px' }}
              >
                <IconUser size={18} />
              </button>
              {userMenuOpen && (
                <div style={{
                  position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 9999,
                  background: 'var(--card-bg)', border: '1px solid var(--card-border)',
                  borderRadius: 'var(--radius, 7px)', boxShadow: 'var(--card-shadow)',
                  minWidth: 160, overflow: 'hidden',
                }}>
                  <div style={{
                    padding: '10px 14px', borderBottom: '1px solid var(--table-border)',
                    fontSize: 13, fontWeight: 600, color: 'var(--text-primary)'
                  }}>
                    {username}
                  </div>
                  <button
                    onMouseDown={() => { logout(); navigate('/login') }}
                    style={{
                      display: 'block', width: '100%', textAlign: 'left',
                      padding: '10px 14px', background: 'none', border: 'none',
                      fontSize: 13, color: 'var(--text-secondary)', cursor: 'pointer',
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--hover-bg, rgba(0,0,0,0.04))'}
                    onMouseLeave={e => e.currentTarget.style.background = 'none'}
                  >
                    Sign out
                  </button>
                </div>
              )}
            </div>
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
