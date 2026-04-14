import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import Sites from './pages/Sites'
import SiteDetail from './pages/SiteDetail'
import PumpMonitoring from './pages/PumpMonitoring'
import DomsInfo from './pages/DomsInfo'
import FlowRates from './pages/FlowRates'
import DeviceAlerts from './pages/DeviceAlerts'
import VolumeRevenue from './pages/VolumeRevenue'
import ActiveAlarms from './pages/ActiveAlarms'
import AlarmHistory from './pages/AlarmHistory'
import AlarmNotifications from './pages/AlarmNotifications'
import TankGauges from './pages/TankGauges'
import EmailRecipients from './pages/EmailRecipients'
import EmailConfig from './pages/EmailConfig'
import EmailLog from './pages/EmailLog'
import AlarmSettings from './pages/AlarmSettings'
import ReportSchedules from './pages/ReportSchedules'
import ImportData from './pages/ImportData'
import DataIntegrity from './pages/DataIntegrity'
import WhatsAppContacts from './pages/WhatsAppContacts'
import SiteMap from './pages/SiteMap'
import FuelPrices from './pages/FuelPrices'
import FuelPriceHistory from './pages/FuelPriceHistory'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="sites" element={<Sites />} />
          <Route path="sites/:siteId" element={<SiteDetail />} />
          <Route path="site-map" element={<SiteMap />} />
          <Route path="pump-monitoring" element={<PumpMonitoring />} />
<Route path="doms-info" element={<DomsInfo />} />
          <Route path="flow-rates" element={<FlowRates />} />
          <Route path="device-alerts" element={<DeviceAlerts />} />
          <Route path="volume-revenue" element={<VolumeRevenue />} />
          <Route path="active-alarms" element={<ActiveAlarms />} />
          <Route path="alarm-history" element={<AlarmHistory />} />
          <Route path="alarm-notifications" element={<AlarmNotifications />} />
          <Route path="tank-gauges" element={<TankGauges />} />
          <Route path="config/email-recipients" element={<EmailRecipients />} />
          <Route path="config/email-config" element={<EmailConfig />} />
          <Route path="config/email-log" element={<EmailLog />} />
          <Route path="config/alarm-settings" element={<AlarmSettings />} />
          <Route path="config/report-schedules" element={<ReportSchedules />} />
          <Route path="config/import-data" element={<ImportData />} />
          <Route path="data-integrity" element={<DataIntegrity />} />
          <Route path="config/whatsapp" element={<WhatsAppContacts />} />
          <Route path="fuel-prices" element={<FuelPrices />} />
          <Route path="fuel-price-history" element={<FuelPriceHistory />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
