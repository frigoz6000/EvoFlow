import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' }
})

export const sitesApi = {
  getAll: () => api.get('/sites').then(r => r.data),
  getById: (id) => api.get(`/sites/${id}`).then(r => r.data),
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

export default api
