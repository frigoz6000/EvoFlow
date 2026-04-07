import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import Sites from './pages/Sites'
import FuelRecords from './pages/FuelRecords'
import PumpMonitoring from './pages/PumpMonitoring'
import Alerts from './pages/Alerts'
import DomsInfo from './pages/DomsInfo'
import FlowRates from './pages/FlowRates'
import DeviceAlerts from './pages/DeviceAlerts'
import VolumeRevenue from './pages/VolumeRevenue'
import ActiveAlarms from './pages/ActiveAlarms'
import AlarmHistory from './pages/AlarmHistory'
import AlarmNotifications from './pages/AlarmNotifications'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="sites" element={<Sites />} />
          <Route path="fuel-records" element={<FuelRecords />} />
          <Route path="pump-monitoring" element={<PumpMonitoring />} />
          <Route path="alerts" element={<Alerts />} />
          <Route path="doms-info" element={<DomsInfo />} />
          <Route path="flow-rates" element={<FlowRates />} />
          <Route path="device-alerts" element={<DeviceAlerts />} />
          <Route path="volume-revenue" element={<VolumeRevenue />} />
          <Route path="active-alarms" element={<ActiveAlarms />} />
          <Route path="alarm-history" element={<AlarmHistory />} />
          <Route path="alarm-notifications" element={<AlarmNotifications />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
