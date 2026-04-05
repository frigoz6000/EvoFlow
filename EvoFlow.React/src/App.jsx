import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import Sites from './pages/Sites'
import FuelRecords from './pages/FuelRecords'
import Vehicles from './pages/Vehicles'
import PumpMonitoring from './pages/PumpMonitoring'
import Alerts from './pages/Alerts'
import DomsInfo from './pages/DomsInfo'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="sites" element={<Sites />} />
          <Route path="fuel-records" element={<FuelRecords />} />
          <Route path="vehicles" element={<Vehicles />} />
          <Route path="pump-monitoring" element={<PumpMonitoring />} />
          <Route path="alerts" element={<Alerts />} />
          <Route path="doms-info" element={<DomsInfo />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
