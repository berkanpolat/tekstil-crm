// P3.8 — Mevcut operasyonların sla_deadline'ını geriye dönük hesapla.
// İş-saati mantığı src/lib/workingHours.ts ile AYNI (bir kerelik backfill; ayna).
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
const PGURL = process.env.PGURL ?? readFileSync('/tmp/pgurl.txt', 'utf8').trim()
const sql = (s) => execFileSync('psql', [PGURL, '-qtAc', s], { encoding: 'utf8' }).trim()

const cfg = {
  days: JSON.parse(sql(`select value from public.settings where key='working_hours.days'`)),
  start: JSON.parse(sql(`select value from public.settings where key='working_hours.start'`)),
  end: JSON.parse(sql(`select value from public.settings where key='working_hours.end'`)),
  holidays: JSON.parse(sql(`select value from public.settings where key='working_hours.holidays'`)),
}
const hours = Number(JSON.parse(sql(`select value from public.settings where key='sla.request_response_hours'`)))

const toMin = (s) => { const [h, m] = s.split(':').map(Number); return h * 60 + m }
const isoDay = (d) => (d.getDay() === 0 ? 7 : d.getDay())
const pad = (n) => String(n).padStart(2, '0')
const key = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const isWork = (d) => cfg.days.includes(isoDay(d)) && !cfg.holidays.includes(key(d))
const atMin = (d, m) => { const x = new Date(d); x.setHours(0, 0, 0, 0); x.setMinutes(m); return x }
const nextStart = (d, sm) => { const x = new Date(d); x.setDate(x.getDate() + 1); return atMin(x, sm) }
function addWorkingHours(from, hrs) {
  const sm = toMin(cfg.start), em = toMin(cfg.end)
  let cur = new Date(from), rem = hrs * 60, g = 0
  while (g++ < 10000) {
    if (!isWork(cur)) { cur = nextStart(cur, sm); continue }
    const cm = cur.getHours() * 60 + cur.getMinutes()
    if (cm < sm) { cur = atMin(cur, sm); continue }
    if (cm >= em) { cur = nextStart(cur, sm); continue }
    if (rem === 0) return cur
    const avail = em - cm
    if (rem <= avail) return atMin(cur, cm + rem)
    rem -= avail; cur = nextStart(cur, sm)
  }
  return cur
}

const rows = sql(`select id||'|'||coalesce(requested_at, created_at) from public.operations where sla_deadline is null and deleted_at is null`)
if (!rows) { console.log('Backfill gerekmez (boş).'); process.exit(0) }
let n = 0
for (const line of rows.split('\n')) {
  const [id, ts] = line.split('|')
  const dl = addWorkingHours(new Date(ts), hours).toISOString()
  sql(`update public.operations set sla_deadline='${dl}' where id=${id}`)
  n++
}
console.log(`Backfill: ${n} operasyona sla_deadline yazıldı (${hours} iş saati, ${cfg.start}-${cfg.end}).`)
