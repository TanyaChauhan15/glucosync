// Short synthesized tones (no audio files). Browsers may block audio until the user has
// interacted with the page; that is fine because sounds are optional.
const KEY = 'glucosync.soundMuted'

export function isMuted() {
  try { return localStorage.getItem(KEY) === '1' } catch { return false }
}
export function setMuted(v) {
  try { localStorage.setItem(KEY, v ? '1' : '0') } catch { /* storage unavailable */ }
}

let ctx = null
export function playAlertSound(severity) {
  if (isMuted() || (severity !== 'orange' && severity !== 'red')) return
  try {
    ctx = ctx || new (window.AudioContext || window.webkitAudioContext)()
    const beeps = severity === 'red' ? [0, 0.22, 0.44] : [0]
    beeps.forEach((offset) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.value = severity === 'red' ? 880 : 620
      gain.gain.setValueAtTime(0.0001, ctx.currentTime + offset)
      gain.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + offset + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + offset + 0.18)
      osc.connect(gain).connect(ctx.destination)
      osc.start(ctx.currentTime + offset)
      osc.stop(ctx.currentTime + offset + 0.2)
    })
  } catch { /* audio unavailable */ }
}
