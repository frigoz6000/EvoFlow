import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' }
})

export const sitesApi = {
  getAll: () => api.get('/sites').then(r => r.data),
  getById: (id) => api.get(`/sites/${id}`).then(r => r.data),
  getDetail: (id) => api.get(`/sites/${id}/detail`).then(r => r.data),
  getMapData: () => api.get('/sites/map-data').then(r => r.data),
}

export const fuelRecordsApi = {
  getAll: (params = {}) => api.get('/fuelrecords', { params }).then(r => r.data),
}

export const vehiclesApi = {
  getAll: () => api.get('/vehicles').then(r => r.data),
}

export const fuelTypesApi = {
  getAll: () => api.get('/fueltypes').then(r => r.data),
}

export const pumpDevicesApi = {
  getAll: () => api.get('/pumpdevices').then(r => r.data),
}

export const pumpStatusApi = {
  getAll: (params = {}) => api.get('/pumpstatus', { params }).then(r => r.data),
}

export const pumpTotalsApi = {
  getAll: (params = {}) => api.get('/pumptotals', { params }).then(r => r.data),
}

export const pumpMonitoringApi = {
  getAll: (params = {}) => api.get('/pumpmonitoring', { params }).then(r => r.data),
}

export const emailRecipientsApi = {
  getAll: () => api.get('/emailrecipients').then(r => r.data),
  create: (recipient) => api.post('/emailrecipients', recipient).then(r => r.data),
  update: (id, recipient) => api.put(`/emailrecipients/${id}`, recipient).then(r => r.data),
  remove: (id) => api.delete(`/emailrecipients/${id}`),
}

export const alarmSettingsApi = {
  getAll: () => api.get('/alarmsettings').then(r => r.data),
  upsert: (payload) => api.post('/alarmsettings', payload).then(r => r.data),
}

export const reportSchedulesApi = {
  getAll: () => api.get('/reportschedules').then(r => r.data),
  create: (payload) => api.post('/reportschedules', payload).then(r => r.data),
  update: (id, payload) => api.put(`/reportschedules/${id}`, payload).then(r => r.data),
  remove: (id) => api.delete(`/reportschedules/${id}`),
}

export const reportDispatchesApi = {
  getRecent: (params = {}) => api.get('/reportdispatches', { params }).then(r => r.data),
}

export const emailConfigApi = {
  get: () => api.get('/emailconfig').then(r => r.data),
  upsert: (config) => api.post('/emailconfig', config).then(r => r.data),
}

export const emailLogApi = {
  getAll: (params = {}) => api.get('/emaillog', { params }).then(r => r.data),
}

export const whatsAppContactsApi = {
  getAll: () => api.get('/whatsappcontacts').then(r => r.data),
  create: (contact) => api.post('/whatsappcontacts', contact).then(r => r.data),
  update: (id, contact) => api.put(`/whatsappcontacts/${id}`, contact).then(r => r.data),
  remove: (id) => api.delete(`/whatsappcontacts/${id}`),
}

export const whatsAppConfigApi = {
  get: () => api.get('/whatsappconfig').then(r => r.data),
  upsert: (config) => api.post('/whatsappconfig', config).then(r => r.data),
}

export const fuelGradePricesApi = {
  getAll: (params = {}) => api.get('/fuelgradeprices', { params }).then(r => r.data),
  upsert: (price) => api.post('/fuelgradeprices', price).then(r => r.data),
}

export const fuelGradePriceHistoryApi = {
  getAll: (params = {}) => api.get('/fuelgradepricehistory', { params }).then(r => r.data),
}

export default api
