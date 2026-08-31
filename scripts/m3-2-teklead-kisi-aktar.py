#!/usr/bin/env python3
"""
M3.2 — teklead kişilerini CRM lead'lerine aktar (idempotent SQL üretici).

KİMLER AKTARILIR — 2+ CEVAP EŞİĞİ
  Yalnız en az İKİ kez cevap vermiş kişiler (651 kişi). Gerekçe kanıta dayanır:
  teklead'den CRM'e daha önce ulaşmış 26 kişinin 22'si (%85) 2+ cevaplıydı.
  Kademe dönüşüm oranları: 2+ cevap %3,4 · tek cevap %0,28 → 12 kat fark.
  Tek cevapların 540'ı 15 karakterden kısa ("kim?", "hayır", emoji) — diyalog değil.

  Eşiği geçemeyenler teklead'de KALIR, silinmez. Yeniden cevap verip eşiği geçerlerse
  bir sonraki çalıştırmada gelirler (external_id sayesinde kopya oluşmaz).

NASIL İŞARETLENİR
  status  : temas_kuruldu   — biz ulaştık, onlar cevap verdi. `yeni` yanlış olurdu
                              (dokunulmamış demek); `ilgileniyor` iddia olurdu
                              (teklead'de kimse bu değerlendirmeyi yapmamış).
            olumsuz         — teklead'de `ilgilenmiyor` işaretli olanlar.
  source  : butik-crawler → web_scraper · import → diger · manual → manuel
  etiket  : `teklead` — mevcut 213 web lead'iyle karışmasın, süzülebilsin.

ALANLAR
  contacts.name işletme adıdır (butikler) → company_name. full_name BOŞ bırakılır:
  kişi adını bilmiyoruz, uydurmak yanlış olur.
  Telefon/e-posta/Instagram/website ayrı contact_points satırları olur.
  WhatsApp yalnız telefondan FARKLIYSA yazılır (651'in 632'sinde aynı numara).

İDEMPOTENCY
  leads.external_source='teklead' + external_id=<contacts.id> (leads_external_uidx).
  contact_points'te benzersizlik kısıtı yok → `not exists` ile korunur.

KULLANIM
  python3 scripts/m3-2-teklead-kisi-aktar.py girdiler.json > /tmp/m32.sql
  # girdiler.json: {"kisiler":[...], "kanallar":[...]}  (teklead'den salt okuma)
"""
import json, re, sys, pathlib
from datetime import datetime

ESIK = 2
q = lambda s: 'null' if s is None else "'" + str(s).replace("'", "''") + "'"
norm = lambda s: re.sub(r'\D', '', s or '')[-10:]

DURUM  = {'ilgilenmiyor': 'olumsuz'}                       # gerisi temas_kuruldu
KAYNAK = {'butik-crawler': 'web_scraper', 'import': 'diger', 'manual': 'manuel'}


def uret(kisiler, kanallar):
    kan = {}
    for c in kanallar:
        kan.setdefault(c['contact_id'], {}).setdefault(c['kind'], c['identifier'])

    # Kaynak veriyi GEÇİCİ tabloya bir kez yaz, gerisini küme işlemiyle yap.
    # (Satır-satır insert 1,3 MB SQL üretiyordu; bu biçim ~10 kat küçük ve tek taramada biter.)
    kayit = []
    for k in kisiler:
        kayit.append("(" + ",".join([
            q(str(k['id'])), q(k['name']), q(k['city']), q(k['district']),
            q(k['country'] or 'Türkiye'), q(k['address']),
            q(DURUM.get(k['lead_status'], 'temas_kuruldu')),
            q(KAYNAK.get(k['source'], 'diger')),
            q(k['ilk_temas']), q(k['son_gelen']), q(k['created_at']),
            # Kategori NOTA YAZILMAZ: 651 kişinin hepsi butik giyim — 610 tane aynı not
            # gürültüden ibaret olurdu. `teklead` etiketi bu bilgiyi zaten taşıyor.
            q((k.get('notes') or '').strip() or None),
        ]) + ")")

    nokta = []
    for k in kisiler:
        c = kan.get(k['id'], {})
        n = []
        if c.get('phone'):     n.append(('phone', c['phone'], 'Telefon', 'true'))
        if c.get('whatsapp') and norm(c.get('whatsapp')) != norm(c.get('phone')):
            n.append(('phone', c['whatsapp'], 'WhatsApp', 'false'))
        if c.get('email'):     n.append(('email', c['email'], 'E-posta', 'true'))
        if c.get('instagram'): n.append(('instagram', c['instagram'], 'Instagram', 'true'))
        if c.get('website'):   n.append(('website', c['website'], 'Web sitesi', 'true'))
        for tip, deger, etiket, birincil in n:
            nokta.append(f"({q(str(k['id']))},{q(tip)},{q(deger)},{q(etiket)},{birincil})")

    return f"""-- M3.2 — teklead kişi göçü (idempotent, küme tabanlı)

create temp table _kaynak (
  ext_id text, ad text, sehir text, ilce text, ulke text, adres text,
  durum text, kaynak text, ilk_temas timestamptz, son_gelen timestamptz,
  olusturma timestamptz, not_metni text
) on commit drop;
insert into _kaynak values
{",".join(kayit)};

create temp table _nokta (ext_id text, tip text, deger text, etiket text, birincil boolean) on commit drop;
insert into _nokta values
{",".join(nokta)};

-- 1) Etiket + içe aktarma partisi
insert into public.tags (key, label, is_system) values ('teklead','teklead',true)
on conflict (key) do nothing;
insert into public.import_batches (entity_type, file_name, total_rows)
values ('lead', 'teklead-gocu-{datetime.now():%Y%m%d}', {len(kisiler)});

-- 2) Lead'ler — external_id ile idempotent (leads_external_uidx)
insert into public.leads
  (company_name, city, district, country, address, status_id, source_id,
   external_source, external_id, first_contact_channel_id, first_contact_date,
   last_interaction_at, created_at, import_batch_id)
select s.ad, s.sehir, s.ilce, s.ulke, s.adres,
       st.id, sr.id, 'teklead', s.ext_id,
       (select id from public.interaction_channels where key='whatsapp'),
       s.ilk_temas, s.son_gelen, s.olusturma,
       (select max(id) from public.import_batches where entity_type='lead')
  from _kaynak s
  join public.lead_statuses st on st.key = s.durum
  join public.lead_sources  sr on sr.key = s.kaynak
-- leads_external_uidx KISMİ indeks (where external_id is not null); on conflict
-- aynı koşulu yazmadan onu kullanamaz.
on conflict (external_source, external_id) where external_id is not null do nothing;

-- 3) İletişim noktaları — benzersizlik kısıtı yok, `not exists` ile korunur
insert into public.contact_points (entity_type, entity_id, type, value, label, is_primary)
select 'lead', l.id, n.tip, n.deger, n.etiket, n.birincil
  from _nokta n
  join public.leads l on l.external_source='teklead' and l.external_id = n.ext_id
 where not exists (
   select 1 from public.contact_points cp
    where cp.entity_type='lead' and cp.entity_id=l.id
      and cp.type=n.tip and cp.value=n.deger);

-- 4) Notlar (teklead kategorisi + serbest not)
insert into public.notes (entity_type, entity_id, body)
select 'lead', l.id, '[teklead] ' || s.not_metni
  from _kaynak s
  join public.leads l on l.external_source='teklead' and l.external_id = s.ext_id
 where s.not_metni is not null
   and not exists (select 1 from public.notes nt
                   where nt.entity_type='lead' and nt.entity_id=l.id and nt.body like '[teklead]%');

-- 5) `teklead` etiketi
insert into public.entity_tags (entity_type, entity_id, tag_id)
select 'lead', l.id, t.id
  from public.leads l cross join public.tags t
 where l.external_source='teklead' and t.key='teklead'
   and not exists (select 1 from public.entity_tags et
                   where et.entity_type='lead' and et.entity_id=l.id and et.tag_id=t.id);
"""


if __name__ == '__main__':
    d = json.loads(pathlib.Path(sys.argv[1]).read_text())
    kisiler = [k for k in d['kisiler'] if k['gelen'] >= ESIK]
    if len(kisiler) != len(d['kisiler']):
        print(f"-- NOT: {len(d['kisiler'])} kayıttan {len(kisiler)}'i eşiği (>={ESIK}) geçti", file=sys.stderr)
    print(uret(kisiler, d['kanallar']))
