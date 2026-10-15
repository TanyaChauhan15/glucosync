import { createContext, useContext, useEffect, useState } from 'react'
import api from '../services/api'
import { setTimezone } from '../utils/format'

const ConfigContext = createContext(null)

export function ConfigProvider({ children }) {
  const [config, setConfig] = useState(null)
  useEffect(() => {
    api.get('/config').then((r) => {
      setTimezone(r.data.timezone)
      setConfig(r.data)
    }).catch(() => setConfig({}))
  }, [])
  return <ConfigContext.Provider value={config}>{children}</ConfigContext.Provider>
}

export const useConfig = () => useContext(ConfigContext)
