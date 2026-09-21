// Ortak yardımcılar: kimlik bilgileri, Management API SQL, FTP, Süreç Takip REST.
// Hiçbir sır sohbete/konsola yazılmaz.
import { execFileSync } from 'node:child_process'
import { readFileSync, existsSync, mkdirSync } from 'node:fs'
import { createHash } from 'node:crypto'

export const CRM_REF = 'kkxvoxeqfsaqzklrtgrw'
export const STUDIO_REF = 'imobvzcddkhqgvkvjhir'
export const LEGACY_URL = 'https://hzqojhaepvvipwqlnbay.supabase.co'
export const VERI = 'data/talep-geri-yukleme'
export const BASLANGIC = '2026-08-01'

export const sha1 = (s) => createHash('sha1').update(String(s)).digest('hex')
export const sha256 = (buf) => createHash('sha256').update(buf).digest('hex')

export function veriKlasoru() {
  if (!existsSync(VERI)) mkdirSync(VERI, { recursive: true })
  if (!existsSync(`${VERI}/uploads`)) mkdirSync(`${VERI}/uploads`)
  return VERI
}

/** Supabase CLI'nin Anahtar Zinciri'ndeki kişisel erişim anahtarı. */
export function sbpToken() {
  const raw = execFileSync('security', ['find-generic-password', '-s', 'Supabase CLI', '-a', 'supabase', '-w'], { encoding: 'utf8' }).trim()
  return Buffer.from(raw.replace(/^go-keyring-base64:/, ''), 'base64').toString('utf8')
}

export function envDosyasi(yol) {
  if (!existsSync(yol)) throw new Error(`${yol} yok`)
  return Object.fromEntries(
    readFileSync(yol, 'utf8').split('\n')
      .filter((l) => l.includes('=') && !l.trimStart().startsWith('#'))
      .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^"|"$/g, '')]),
  )
}

/** Management API üzerinden SQL (postgres yetkisi, DB şifresi gerekmez). */
export async function sql(ref, query, token = sbpToken()) {
  const r = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  })
  const j = await r.json().catch(() => null)
  if (!r.ok) throw new Error(`SQL ${r.status}: ${j?.message ?? JSON.stringify(j)}`)
  return j
}

/** Edge fn/servis sırları (INTAKE_SECRET, DOSYA_SERVIS_URL, DOSYA_SERVIS_SIRRI). */
export async function sirlar(ref, token = sbpToken()) {
  const r = await fetch(`https://api.supabase.com/v1/projects/${ref}/secrets`, { headers: { Authorization: `Bearer ${token}` } })
  if (!r.ok) throw new Error(`secrets ${r.status}`)
  return Object.fromEntries((await r.json()).map((s) => [s.name, s.value]))
}

export function ftpKimlik() {
  const e = envDosyasi('.env.deploy')
  return { host: e.FTP_HOST, user: e.FTP_USER, pass: e.FTP_PASS }
}

/** FTP'den dosya indir (curl; Node'da yerleşik FTP yok). */
export function ftpIndir(uzakYol, hedef) {
  const k = ftpKimlik()
  execFileSync('curl', ['-sS', '--fail', `ftp://${k.host}/${uzakYol}`, '--user', `${k.user}:${k.pass}`, '-o', hedef], { stdio: 'pipe' })
}

export function ftpListe(uzakKlasor) {
  const k = ftpKimlik()
  return execFileSync('curl', ['-sS', '--list-only', `ftp://${k.host}/${uzakKlasor}/`, '--user', `${k.user}:${k.pass}`], { encoding: 'utf8' })
    .split('\n').map((s) => s.trim()).filter(Boolean)
}

/** Süreç Takip: anon anahtar derlenmiş bundle'dan, oturum .secrets'tan. */
export function legacyAnon() {
  const js = readFileSync('../../surec-takip-arsiv/site/assets/index-oyoMa2rx.js', 'utf8')
  const m = js.match(/sb_publishable_[A-Za-z0-9_-]+/)
  if (!m) throw new Error('Süreç Takip anon anahtarı bundle\'da bulunamadı')
  return m[0]
}

export async function legacyOturum() {
  const anon = legacyAnon()
  const e = envDosyasi('.secrets/surec-takip-giris.env') // SUREC_EMAIL / SUREC_SIFRE
  const r = await fetch(`${LEGACY_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST', headers: { apikey: anon, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: e.SUREC_EMAIL, password: e.SUREC_SIFRE }),
  })
  const j = await r.json()
  if (!j.access_token) throw new Error('Süreç Takip girişi başarısız')
  return { apikey: anon, Authorization: `Bearer ${j.access_token}` }
}

/** PostgREST 1000 satır sınırını Range ile aşar. */
export async function legacyTablo(headers, tablo, select = '*') {
  const out = []
  for (let from = 0; ; from += 1000) {
    const r = await fetch(`${LEGACY_URL}/rest/v1/${tablo}?select=${encodeURIComponent(select)}&order=id`, {
      headers: { ...headers, Range: `${from}-${from + 999}` },
    })
    if (!r.ok && r.status !== 206) throw new Error(`${tablo} ${r.status}`)
    const j = await r.json()
    out.push(...j)
    if (j.length < 1000) break
  }
  return out
}

export const oku = (ad) => JSON.parse(readFileSync(`${VERI}/${ad}`, 'utf8'))
export const jsonlOku = (ad) => readFileSync(`${VERI}/${ad}`, 'utf8').split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l))
