import api, { errorMessage } from '../services/api'
import { useToast } from '../context/ToastContext'

export default function useAcknowledge(onDone) {
  const toast = useToast()
  return async (entry) => {
    try {
      const r = await api.post(`/patients/${entry.patient_id}/acknowledge`)
      if (r.data.acknowledged_count > 0) toast('success', `${r.data.message} Batch ${r.data.batch.batch_code}.`)
      else toast('info', r.data.message)
    } catch (e) {
      toast('error', errorMessage(e))
    } finally {
      onDone?.()
    }
  }
}
