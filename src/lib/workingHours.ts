/**
 * İş-saati hesabı — SAF fonksiyonlar (yan etki yok, deterministik). SLA son tarihi
 * bununla hesaplanır. Ayarlar: working_hours.days/start/end/holidays (Faz 0).
 *
 * Not: Date'in yerel bileşenleri (getHours/getDay) kullanılır. Uygulama tek saat
 * dilimindedir (settings.system.timezone); tarayıcı ve backfill aynı yereli kullandığı
 * sürece tutarlıdır. Testler yerelden bağımsız olsun diye new Date(y,m,d,h,mm) ile kurulur.
 */

export interface WorkingHoursConfig {
  /** ISO hafta günleri: 1=Pazartesi … 7=Pazar. */
  days: number[]
  /** "HH:MM" */
  start: string
  /** "HH:MM" */
  end: string
  /** "YYYY-MM-DD" tatiller. */
  holidays: string[]
}

export const DEFAULT_WORKING_HOURS: WorkingHoursConfig = {
  days: [1, 2, 3, 4, 5],
  start: '09:00',
  end: '18:00',
  holidays: [],
}

const pad = (n: number) => String(n).padStart(2, '0')
function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return (h ?? 0) * 60 + (m ?? 0)
}
/** ISO gün (1=Pzt..7=Paz). */
function isoDay(d: Date): number {
  const g = d.getDay()
  return g === 0 ? 7 : g
}
function dateKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
export function isWorkingDay(d: Date, cfg: WorkingHoursConfig): boolean {
  return cfg.days.includes(isoDay(d)) && !cfg.holidays.includes(dateKey(d))
}
/** Verilen günü, verilen dakikada (gün-içi) döndürür. */
function atDayMinutes(d: Date, minutes: number): Date {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  x.setMinutes(minutes)
  return x
}
/** Ertesi takvim gününün başlangıç saati. */
function nextDayStart(d: Date, startM: number): Date {
  const x = new Date(d)
  x.setDate(x.getDate() + 1)
  return atDayMinutes(x, startM)
}

/**
 * `from` anından itibaren `hours` iş saati ilerler ve son tarihi döndürür.
 * Çalışma dışı zaman (mesai dışı, hafta sonu, tatil) sayılmaz.
 */
export function addWorkingHours(from: Date, hours: number, cfg: WorkingHoursConfig = DEFAULT_WORKING_HOURS): Date {
  const startM = toMinutes(cfg.start)
  const endM = toMinutes(cfg.end)
  if (endM <= startM || cfg.days.length === 0) return new Date(from) // güvenlik: geçersiz yapılandırma

  let cursor = new Date(from)
  let remaining = Math.max(0, hours) * 60 // dakika
  let guard = 0

  while (guard++ < 10000) {
    if (!isWorkingDay(cursor, cfg)) { cursor = nextDayStart(cursor, startM); continue }
    const curM = cursor.getHours() * 60 + cursor.getMinutes()
    if (curM < startM) { cursor = atDayMinutes(cursor, startM); continue }
    if (curM >= endM) { cursor = nextDayStart(cursor, startM); continue }
    if (remaining === 0) return cursor
    const available = endM - curM
    if (remaining <= available) return atDayMinutes(cursor, curM + remaining)
    remaining -= available
    cursor = nextDayStart(cursor, startM)
  }
  return cursor
}

export interface SlaStatus {
  overdue: boolean
  /** 12 saat / eşik içinde mi (yaklaşıyor). */
  soon: boolean
  hoursLeft: number
}

/** SLA durumunu okuma anında hesaplar (deadline'a göre). */
export function slaStatus(deadline: Date | string | null, now: Date = new Date(), soonHours = 12): SlaStatus {
  if (!deadline) return { overdue: false, soon: false, hoursLeft: Infinity }
  const dl = typeof deadline === 'string' ? new Date(deadline) : deadline
  const hoursLeft = (dl.getTime() - now.getTime()) / 3_600_000
  return { overdue: hoursLeft < 0, soon: hoursLeft >= 0 && hoursLeft <= soonHours, hoursLeft }
}
