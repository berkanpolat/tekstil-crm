// =====================================================================
// RED SEBEBİ ATAMA · YAZMA (canlı DB — ONAYLI).
// data/red-sebepleri.csv → müşteri (DB normalize_tr) → teklif_reddedildi
// operasyonlarının quote'larına rejection_reason_id yazar.
// - rejection_note'a DOKUNMAZ.
// - Sadece rejection_reason_id IS NULL olanlara yazar (üzerine yazmaz).
// - Tek transaction; bir quote'a iki farklı sebep düşerse ABORT eder.
// - Elle eşleştirilecek 2 kayıt (Ayaz Atlas, Mahir Tuğanatay) HARİÇ.
// Çalıştır:  node scripts/red-sebep-yaz.mjs
// =====================================================================
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const pass = process.env.PGPASSWORD || readFileSync('.env','utf8').split('\n').find(l=>l.startsWith('SUPABASE_DB_PASSWORD='))?.split('=').slice(1).join('=').trim()
const ENV = { ...process.env, PGHOST:'aws-0-eu-west-1.pooler.supabase.com', PGPORT:'5432', PGUSER:'postgres.kkxvoxeqfsaqzklrtgrw', PGDATABASE:'postgres', PGPASSWORD:pass }
const psqlFile = (sql) => execFileSync('psql',['-v','ON_ERROR_STOP=1','-f','-'],{encoding:'utf8',env:ENV,input:sql})

const SEBEP_KEY = {
  'Ulaşım Sağlanamadı':          'ulasilamadi',
  'Yüksek Fiyat':                'fiyat_yuksek',
  'Müşteri Vazgeçti':            'musteri_vazgecti',
  'MOQ Fazla':                   'moq_fazla',
  'Sonra Değerlendirecek':       'sonra_degerlendirecek',
  'Numune Ücreti Fazla Bulunur': 'numune_ucreti_fazla',
  'Yanlış Numara':               'yanlis_numara',
}
// Elle eşleştirilecek — bu koşuda YAZILMAZ.
const HARIC = new Set(['Ayaz Atlas','Mahir Tuğanatay'])

const q = (s) => "'" + String(s).replace(/'/g,"''") + "'"
const rows = readFileSync('data/red-sebepleri.csv','utf8').trim().split('\n').slice(1)
  .map(l => { const i=l.indexOf(','); return { marka:l.slice(0,i).trim(), sebep:l.slice(i+1).trim() } })
  .filter(r => r.marka && SEBEP_KEY[r.sebep] && !HARIC.has(r.marka))

const values = rows.map(r => `(${q(r.marka)}, ${q(SEBEP_KEY[r.sebep])})`).join(',\n    ')

const SQL = `\\set ON_ERROR_STOP on
begin;

create temporary table _csv (marka text, reason_key text) on commit drop;
insert into _csv (marka, reason_key) values
    ${values};

create temporary table _tgt on commit drop as
  select distinct q.id as quote_id, rr.id as reason_id
  from _csv
  join public.customers c
    on (c.company_name_normalized = public.normalize_tr(_csv.marka)
        or c.full_name_normalized = public.normalize_tr(_csv.marka))
   and c.deleted_at is null
  join public.operations op on op.customer_id = c.id and op.deleted_at is null
  join public.operation_stages st on st.id = op.stage_id and st.key = 'teklif_reddedildi'
  join public.quotes q on q.operation_id = op.id and q.deleted_at is null
  join public.quote_rejection_reasons rr on rr.key = _csv.reason_key
  where q.rejection_reason_id is null;

-- Güvenlik: bir quote'a birden fazla FARKLI sebep düşerse abort.
do $$ begin
  if exists (select 1 from _tgt group by quote_id having count(*) > 1) then
    raise exception 'ÇAKIŞMA: bir quote birden fazla sebep alıyor — abort';
  end if;
end $$;

update public.quotes q
   set rejection_reason_id = t.reason_id
  from _tgt t
 where q.id = t.quote_id;

select 'guncellenen_quote='|| count(*) from _tgt;
commit;
`

const out = psqlFile(SQL)
console.log('── YAZMA SONUCU ─────────────────────────────')
console.log(out.trim())
console.log('Girdi (haric hariç):', rows.length, 'CSV kaydı işlendi.')
