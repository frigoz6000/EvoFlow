import { createContext, useContext, useState, useCallback } from 'react'
import axios from 'axios'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem('evoflow-token'))
  const [username, setUsername] = useState(() => localStorage.getItem('evoflow-username'))

  const login = useCallback(async (username, password) => {
    const response = await axios.post('/api/auth/login', { username, password })
    const { token: newToken, username: user } = response.data
    localStorage.setItem('evoflow-token', newToken)
    localStorage.setItem('evoflow-username', user)
    setToken(newToken)
    setUsername(user)
  }, [])

  const logout = useCallback(() => {
    localStorage.removeItem('evoflow-token')
    localStorage.removeItem('evoflow-username')
    setToken(null)
    setUsername(null)
  }, [])

  return (
    <AuthContext.Provider value={{ token, username, login, logout, isAuthenticated: !!token }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
