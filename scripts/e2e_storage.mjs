// =====================================================================
// P0.7 storage uçtan uca testi (UI olmadan).
//   * upload → imzalı URL → indirme (kabul kriteri #11)
//   * koşullu silme: files kaydı olan nesne SİLİNEMEZ; olmayan (yarım yükleme)
//     SİLİNEBİLİR
// bootstrap-owner ile owner kurar, sonda her şeyi temizler.
// =====================================================================
import { createClient } from '@supabase/supabase-js'
import { execFileSync } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'

const URL = process.env.VITE_SUPABASE_URL
const ANON = process.env.VITE_SUPABASE_ANON_KEY
const SECRET = process.env.BOOTSTRAP_SECRET
if (!URL || !ANON || !SECRET) { console.error('env eksik'); process.exit(2) }

const OWNER = { email: 'e2e.storage@tekstilas.com', password: 'OwnerPass1!' }
const PG = ['-h', process.env.PGHOST, '-p', '5432', '-U', process.env.PGUSER, '-d', 'postgres', '-tA']
const psql = (sql) => execFileSync('psql', [...PG, '-c', sql], { encoding: 'utf8', env: process.env }).trim()

let pass = 0, fail = 0
const check = (n, ok, x = '') => { if (ok) { pass++; console.log(`PASS: ${n}`) } else { fail++; console.log(`FAIL: ${n} ${x}`) } }

// storage.objects doğrudan silinemez (storage.protect_delete). DB-only temizlik;
// storage nesneleri Storage API ile (owner oturumu) silinir.
const dbClean = () => {
  psql(`delete from public.files where storage_path like 'e2e-test/%';`)
  psql(`delete from public.users where email='${OWNER.email}';`)
  psql(`delete from auth.users where email='${OWNER.email}';`)
}

async function main() {
  dbClean()
  // Owner kur
  const r = await fetch(`${URL}/functions/v1/bootstrap-owner`, {
    method: 'POST',
    headers: { apikey: ANON, Authorization: `Bearer ${ANON}`, 'Content-Type': 'application/json', 'X-Bootstrap-Secret': SECRET },
    body: JSON.stringify({ email: OWNER.email, password: OWNER.password, full_name: 'Storage Owner' }),
  })
  check('owner bootstrap', r.status === 201, `(status ${r.status})`)

  const supa = createClient(URL, ANON, { auth: { persistSession: false } })
  const si = await supa.auth.signInWithPassword(OWNER)
  check('owner login', !si.error && !!si.data.session)
  const ownerId = si.data.user.id

  // --- 1) UPLOAD + files kaydı → imzalı URL → indirme ---
  const content = `belge-icerigi-${randomUUID()}`
  const path = `e2e-test/${randomUUID()}.txt`
  const checksum = createHash('sha256').update(content).digest('hex')

  const up = await supa.storage.from('documents').upload(path, Buffer.from(content), { contentType: 'text/plain' })
  check('storage upload', !up.error, up.error?.message ?? '')

  const ins = await supa.from('files').insert({
    bucket: 'documents', storage_path: path, original_name: 'belge.txt',
    mime_type: 'text/plain', size_bytes: content.length, checksum,
    category: 'document', uploaded_by: ownerId,
  }).select('id').single()
  check('files kaydı oluştu', !ins.error && !!ins.data?.id, ins.error?.message ?? '')

  const signed = await supa.storage.from('documents').createSignedUrl(path, 60)
  check('imzalı URL üretildi', !signed.error && !!signed.data?.signedUrl, signed.error?.message ?? '')
  const dl = await fetch(signed.data.signedUrl)
  const dlText = await dl.text()
  check('imzalı URL ile indirilen içerik doğru (#11)', dlText === content, `(görülen '${dlText.slice(0,20)}')`)

  // --- 2) files kaydı OLAN nesne SİLİNEMEZ ---
  const del1 = await supa.storage.from('documents').remove([path])
  // Supabase remove RLS engellerse hata döner veya boş sonuç; nesne hâlâ durmalı.
  const stillThere = psql(`select count(*) from storage.objects where bucket_id='documents' and name='${path}';`)
  check('files kaydı olan nesne silinemedi', stillThere === '1', `(kalan ${stillThere}, remove err=${del1.error?.message ?? 'yok'})`)

  // --- 3) files kaydı OLMAYAN (yarım) nesne SİLİNEBİLİR ---
  const orphanPath = `e2e-test/${randomUUID()}-orphan.txt`
  await supa.storage.from('documents').upload(orphanPath, Buffer.from('yarim'), { contentType: 'text/plain' })
  const del2 = await supa.storage.from('documents').remove([orphanPath])
  const orphanGone = psql(`select count(*) from storage.objects where bucket_id='documents' and name='${orphanPath}';`)
  check('files kaydı olmayan (yarım) nesne silindi', orphanGone === '0', `(kalan ${orphanGone}, err=${del2.error?.message ?? 'yok'})`)

  // --- 4) anon imzasız erişemez ---
  const anonGet = await fetch(`${URL}/storage/v1/object/documents/${path}`, { headers: { apikey: ANON } })
  check('anon imzasız erişemez (401/400)', anonGet.status === 400 || anonGet.status === 401 || anonGet.status === 403, `(status ${anonGet.status})`)

  // Temizlik: files kaydını sil (koruma kalksın) → nesneyi Storage API ile sil
  psql(`delete from public.files where storage_path like 'e2e-test/%';`)
  await supa.storage.from('documents').remove([path])
  await supa.auth.signOut()
  dbClean()
  const leftObj = psql(`select count(*) from storage.objects where bucket_id='documents' and name like 'e2e-test/%';`)
  check('storage nesneleri temizlendi', leftObj === '0', `(kalan ${leftObj})`)

  console.log(`\n=== SONUÇ: ${pass} PASS, ${fail} FAIL ===`)
  process.exit(fail === 0 ? 0 : 1)
}
main().catch((e) => { console.error('hata:', e); try { dbClean() } catch { /* */ } process.exit(1) })
