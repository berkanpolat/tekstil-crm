// B.5 — Bildirim sesi. Yalnızca YENİ ve önemli olayda çalar; aynı uyarı ekranda dururken
// veya sayfa yenilendiğinde çalmaz (bunu çağıran taraf realtime INSERT'e bağlar → doğal olarak
// sadece yeni bildirimde tetiklenir). Kademeye göre farklı ses. Kullanıcı kapatabilir.
// Ses dosyaları projede yerel (public/sounds), dışarıdan indirilmez.

const KEY = 'notif_sound_pref'
type Severity = 'info' | 'warning' | 'critical'

export interface SoundPref { enabled: boolean; minSeverity: Severity }
const DEFAULT: SoundPref = { enabled: true, minSeverity: 'info' }
const RANK: Record<Severity, number> = { info: 0, warning: 1, critical: 2 }

export function getSoundPref(): SoundPref {
  try { return { ...DEFAULT, ...JSON.parse(localStorage.getItem(KEY) || '{}') } } catch { return DEFAULT }
}
export function setSoundPref(p: Partial<SoundPref>) {
  localStorage.setItem(KEY, JSON.stringify({ ...getSoundPref(), ...p }))
}

// Tarayıcı, kullanıcı etkileşimi olmadan ses çalmayı engeller. İlk tıklamada "kilidi aç".
let unlocked = false
const infoAudio = typeof Audio !== 'undefined' ? new Audio('/sounds/notify-info.wav') : null
const critAudio = typeof Audio !== 'undefined' ? new Audio('/sounds/notify-critical.wav') : null

/** İlk kullanıcı etkileşiminde çağrılır (App): sesi sessizce bir kez oynatıp kilidi açar. */
export function unlockNotificationSound() {
  if (unlocked || !infoAudio) return
  unlocked = true
  const prev = infoAudio.volume
  infoAudio.volume = 0
  infoAudio.play().then(() => { infoAudio.pause(); infoAudio.currentTime = 0; infoAudio.volume = prev }).catch(() => { infoAudio.volume = prev })
}

/** Bir bildirim için sesi çal (tercih + eşik + kilit uygun ise). Kritik iki tonlu, diğeri tek ton. */
export function playNotificationSound(severity: Severity) {
  const pref = getSoundPref()
  if (!pref.enabled) return
  if (RANK[severity] < RANK[pref.minSeverity]) return
  const a = severity === 'critical' ? critAudio : infoAudio
  if (!a) return
  try { a.currentTime = 0; void a.play() } catch { /* kilit yoksa sessiz geç */ }
}
