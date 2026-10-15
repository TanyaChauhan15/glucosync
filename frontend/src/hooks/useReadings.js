import { useCallback, useEffect, useRef, useState } from 'react'
import api, { errorMessage } from '../services/api'
import { useRealtime } from '../context/RealtimeContext'

// Loads stored readings for a time range from the database, then appends live readings
// pushed over the WebSocket, so graphs update without a refresh and survive one.
export default function useReadings(patientId, rangeMinutes) {
  const [readings, setReadings] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const range = useRef(rangeMinutes)
  range.current = rangeMinutes

  const seq = useRef(0)
  const load = useCallback(async () => {
    if (!patientId) return
    const mine = ++seq.current // ignore responses from superseded requests (e.g. a quick range change)
    try {
      const r = await api.get(`/patients/${patientId}/readings`, { params: { minutes: rangeMinutes } })
      if (mine !== seq.current) return
      setReadings(r.data.items)
      setError(null)
    } catch (e) {
      if (mine === seq.current) setError(errorMessage(e))
    } finally {
      if (mine === seq.current) setLoading(false)
    }
  }, [patientId, rangeMinutes])

  useEffect(() => {
    setLoading(true)
    load()
  }, [load])

  useRealtime('reconnected', load)
  useRealtime('reading.new', (data) => {
    if (data.patient_id !== patientId) return
    const cutoff = Date.now() - range.current * 60000
    setReadings((list) => {
      if (list.some((r) => r.reading_id === data.reading.reading_id)) return list
      return [...list, data.reading].filter((r) => new Date(r.recorded_at).getTime() >= cutoff)
    })
  })

  // keep the window sliding even when no new data arrives
  useEffect(() => {
    const t = setInterval(() => {
      const cutoff = Date.now() - range.current * 60000
      setReadings((list) => {
        const next = list.filter((r) => new Date(r.recorded_at).getTime() >= cutoff)
        return next.length === list.length ? list : next
      })
    }, 30000)
    return () => clearInterval(t)
  }, [])

  const latest = readings.length ? readings[readings.length - 1] : null
  return { readings, latest, loading, error, reload: load }
}
