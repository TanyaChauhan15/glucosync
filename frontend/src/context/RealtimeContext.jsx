import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { useAuth } from './AuthContext'

// One authenticated WebSocket per signed-in tab, with automatic reconnection (exponential
// backoff). Pages subscribe to event types; after a reconnect a synthetic 'reconnected'
// event lets them reload from the REST API so nothing missed while offline is lost.
const RealtimeContext = createContext(null)

export function RealtimeProvider({ children }) {
  const { user } = useAuth()
  const [status, setStatus] = useState('offline')
  const listeners = useRef(new Map())
  const wsRef = useRef(null)

  const emit = useCallback((type, data) => {
    for (const key of [type, '*']) {
      const set = listeners.current.get(key)
      if (set) set.forEach((fn) => { try { fn(data, type) } catch { /* listener errors must not break the socket */ } })
    }
  }, [])

  useEffect(() => {
    if (!user) {
      setStatus('offline')
      return undefined
    }
    let closedByUs = false
    let attempt = 0
    let timer = null
    let pingTimer = null
    let hadConnection = false

    const connect = () => {
      const proto = window.location.protocol === 'https:' ? 'wss' : 'ws'
      const ws = new WebSocket(`${proto}://${window.location.host}/ws`)
      wsRef.current = ws
      setStatus(attempt === 0 && !hadConnection ? 'connecting' : 'reconnecting')
      ws.onopen = () => {
        attempt = 0
        setStatus('connected')
        if (hadConnection) emit('reconnected', {})
        hadConnection = true
        pingTimer = setInterval(() => ws.readyState === 1 && ws.send('ping'), 25000)
      }
      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data)
          emit(msg.type, msg.data)
        } catch { /* ignore malformed frames */ }
      }
      ws.onclose = () => {
        clearInterval(pingTimer)
        if (closedByUs) return
        setStatus('reconnecting')
        attempt += 1
        timer = setTimeout(connect, Math.min(15000, 500 * 2 ** Math.min(attempt, 5)))
      }
      ws.onerror = () => ws.close()
    }
    connect()
    return () => {
      closedByUs = true
      clearTimeout(timer)
      clearInterval(pingTimer)
      wsRef.current?.close()
      setStatus('offline')
    }
  }, [user?.user_id, user?.user_type, emit]) // eslint-disable-line react-hooks/exhaustive-deps

  const subscribe = useCallback((type, fn) => {
    if (!listeners.current.has(type)) listeners.current.set(type, new Set())
    listeners.current.get(type).add(fn)
    return () => listeners.current.get(type)?.delete(fn)
  }, [])

  return <RealtimeContext.Provider value={{ status, subscribe }}>{children}</RealtimeContext.Provider>
}

export function useRealtimeStatus() {
  return useContext(RealtimeContext).status
}

export function useRealtime(types, handler) {
  const { subscribe } = useContext(RealtimeContext)
  const ref = useRef(handler)
  ref.current = handler
  const key = Array.isArray(types) ? types.join('|') : types
  useEffect(() => {
    const list = key.split('|')
    const offs = list.map((t) => subscribe(t, (data, type) => ref.current(data, type)))
    return () => offs.forEach((off) => off())
  }, [key, subscribe])
}
