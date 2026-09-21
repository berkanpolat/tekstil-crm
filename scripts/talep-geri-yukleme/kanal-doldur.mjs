// Pazarlama kanalı geri doldurma: 21 Eyl 2026 öncesi aktarılan site taleplerine leads.jsonl'deki
// `kaynak` JSON'unu ve tanınan kanalı yazar. Idempotent (marketing boş olanlar). --apply ile yazar.
import { CRM_REF, BASLANGIC, sql, sbpToken, jsonlOku, sha1 } from './ortak.mjs'
import { payloadKur } from './mantik.mjs'
const APPLY = process.argv.includes('--apply')
const TOK = sbpToken()
const lit = (v) => (v == null ? 'null' : `'${String(v).replace(/'/g, "''")}'`)
const rows = jsonlOku('leads.jsonl').filter((r) => r.ts >= BASLANGIC)
const refs = rows.map((r) => ({ ref: payloadKur(r, sha1).client_reference, kaynak: r.kaynak && typeof r.kaynak === 'object' ? r.kaynak : null }))
console.log(`${APPLY ? 'YAZMA' : 'KURU KOŞU'} — jsonl ${rows.length} satır, kaynak dolu ${refs.filter((r) => r.kaynak).length}`)
const hedef = await sql(CRM_REF, `select count(*) n from operations where source='web_sitesi' and deleted_at is null and marketing_channel_id is null`, TOK)
console.log(`  CRM'de kanalı boş site talebi: ${hedef[0].n}`)
if (!APPLY) process.exit(0)
let yazilan = 0
for (let i = 0; i < refs.length; i += 100) {
  const grup = refs.slice(i, i + 100)
  const r = await sql(CRM_REF, `
    with v(ref, kaynak) as (values ${grup.map((g) => `(${lit(g.ref)}, ${lit(g.kaynak ? JSON.stringify(g.kaynak) : null)}::jsonb)`).join(',\n')})
    update operations o set marketing = coalesce(v.kaynak, o.marketing),
      marketing_channel_id = (select id from marketing_channels where key = public.pazarlama_kanali_bul(coalesce(v.kaynak, o.marketing)))
    from v where o.client_reference = v.ref and o.marketing_channel_id is null returning 1`, TOK)
  yazilan += r.length
}
// jsonl'de olmayan (Studio kökenli 27) → bilinmiyor
const kalan = await sql(CRM_REF, `update operations set marketing_channel_id = (select id from marketing_channels where key='bilinmiyor') where source='web_sitesi' and deleted_at is null and marketing_channel_id is null returning 1`, TOK)
console.log(`  yazıldı: ${yazilan} · bilinmiyor: ${kalan.length}`)
console.table(await sql(CRM_REF, `select mc.label, count(*) from operations o join marketing_channels mc on mc.id=o.marketing_channel_id where o.source='web_sitesi' and o.deleted_at is null group by 1 order by 2 desc`, TOK))
