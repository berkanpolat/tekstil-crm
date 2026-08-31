#!/usr/bin/env python3
"""
M3.3 — teklead şablon/konuşma/mesaj geçmişini CRM'e aktar (idempotent, partili).

KAPSAM
  Yalnız M3.2'de aktarılan 651 kişinin (2+ cevap eşiği) konuşmaları:
  654 konuşma, 4.420 mesaj (849 medyalı, 1.281 şablonlu) + 133 şablon, 186 değişken.
  Eşiği geçemeyen kişilerin mesajları teklead'de kalır.

DEĞER EŞLEMESİ (teklead enum → CRM check)
  durum : read→okundu · delivered→iletildi · sent→gonderildi · queued→kuyrukta
          failed→basarisiz · received→alindi
  kanal : whatsapp→whatsapp · email→eposta   (interaction_channels sözlüğü)

BAĞLANTI
  Konuşma teklead `contact_id` → CRM `leads.external_id` üzerinden lead'e bağlanır
  (M3.2 bu eşlemeyi kurdu). Mesajlaşma kendi kimliğini taşımaz — bkz. M3.1.

İDEMPOTENCY
  Her satır `external_source='teklead'` + `external_id=<kaynak id>` taşır ve tablolarda
  bu çift benzersizdir. Tekrar çalıştırmak kopya üretmez, yarıda kalan aktarım
  kaldığı yerden tamamlanır.

PARTİLİ GÖNDERİM
  4.420 mesajın tek SQL'i ~2 MB olur; Management API için fazla. Mesajlar
  --parti-boyu (varsayılan 800) kadarlık kümeler halinde yazılır. Her parti kendi
  transaction'ıdır; idempotent olduğu için yarıda kalırsa yeniden çalıştırmak yeterli.

MEDYA NOTU
  media_url teklead'deki haliyle taşınır (sağlayıcı bağlantısı). Bu bağlantılar
  zamanla geçersizleşebilir; dosyaların Storage'a indirilmesi ayrı bir iştir.

KULLANIM
  python3 scripts/m3-3-teklead-mesaj-aktar.py girdiler.json --cikti-dizin /tmp/m33
"""
import json, sys, pathlib, argparse

DURUM = {'read': 'okundu', 'delivered': 'iletildi', 'sent': 'gonderildi',
         'queued': 'kuyrukta', 'failed': 'basarisiz', 'received': 'alindi'}
KANAL = {'whatsapp': 'whatsapp', 'email': 'eposta', 'sms': 'telefon', 'telegram': 'telegram'}
ONAY  = {'approved': 'onaylandi', 'rejected': 'reddedildi', 'submitted': 'gonderildi',
         'draft': 'taslak', 'pending': 'gonderildi'}
VARK  = {'contact': 'lead', 'manual': 'manuel', 'static': 'sabit', 'fixed': 'sabit'}

def q(s):
    if s is None: return 'null'
    if isinstance(s, bool): return 'true' if s else 'false'
    if isinstance(s, (int, float)): return str(s)
    if isinstance(s, (dict, list)): s = json.dumps(s, ensure_ascii=False)
    return "'" + str(s).replace("'", "''") + "'"


def sablonlar(tpl, tplvar):
    sat = [f"({q(str(t['id']))},{q(t['name'])},{q(t['display_name'])},{q(t['group_name'])},"
           f"{q(KANAL.get(t['kanal'],'whatsapp'))},{q(t['body'])},{q(bool(t['is_followup']))},"
           f"{q(bool(t['ai_generated']))},{q(t['ai_prompt'])},{q(ONAY.get(t['onay'],'taslak'))},"
           f"{q(t['approval_external_id'])},{q(t['approved_at'])},{q(t['submitted_at'])},"
           f"{q(t['rejected_at'])},{q(t['rejection_reason'])},{q(t['created_at'])})" for t in tpl]
    vsat = [f"({q(str(v['template_id']))},{v['position']},{q(v['name'])},{q(v['description'])},"
            f"{q(VARK.get(v['kaynak'],'manuel'))},{q(v['source_field'])},{q(v['default_value'])},"
            f"{q(v['external_name'])})" for v in tplvar]
    return f"""-- Şablonlar ve değişkenleri
create temp table _t (ext text, name text, display text, grp text, kanal text, body text,
  followup boolean, ai boolean, prompt text, onay text, onay_ext text,
  approved timestamptz, submitted timestamptz, rejected timestamptz, red_sebep text, olusturma timestamptz) on commit drop;
insert into _t values
{",".join(sat)};

insert into public.message_templates
  (key, name, display_name, group_name, channel_id, body, is_followup, ai_generated, ai_prompt,
   approval_status, approval_external_id, approved_at, submitted_at, rejected_at, rejection_reason,
   external_source, external_id, created_at)
select 'teklead_'||t.ext, t.name, t.display, t.grp,
       (select id from public.interaction_channels where key=t.kanal),
       t.body, t.followup, t.ai, t.prompt, t.onay, t.onay_ext,
       t.approved, t.submitted, t.rejected, t.red_sebep, 'teklead', t.ext, t.olusturma
  from _t t
on conflict (key) do nothing;

create temp table _tv (tpl_ext text, poz int, name text, aciklama text, kaynak text,
  alan text, varsayilan text, dis_ad text) on commit drop;
insert into _tv values
{",".join(vsat)};

insert into public.message_template_variables
  (template_id, position, name, description, source, source_field, default_value, external_name)
select mt.id, v.poz, v.name, v.aciklama, v.kaynak, v.alan, v.varsayilan, v.dis_ad
  from _tv v join public.message_templates mt
    on mt.external_source='teklead' and mt.external_id = v.tpl_ext
on conflict (template_id, position) do nothing;
"""


def konusmalar(kon):
    sat = [f"({q(str(k['id']))},{q(str(k['contact_id']))},{q(KANAL.get(k['kanal'],'whatsapp'))},"
           f"{q(k['last_message_at'])},{k['unread_count'] or 0},{q(k['created_at'])})" for k in kon]
    return f"""-- Konuşmalar → lead'e bağlanır (M3.2'nin external_id eşlemesi üzerinden)
create temp table _c (ext text, contact_ext text, kanal text,
  son timestamptz, okunmamis int, olusturma timestamptz) on commit drop;
insert into _c values
{",".join(sat)};

insert into public.conversations
  (entity_type, entity_id, channel_id, last_message_at, unread_count,
   external_source, external_id, created_at)
select 'lead', l.id,
       (select id from public.interaction_channels where key=c.kanal),
       c.son, c.okunmamis, 'teklead', c.ext, c.olusturma
  from _c c
  join public.leads l on l.external_source='teklead' and l.external_id = c.contact_ext
on conflict (external_source, external_id) where external_source is not null and external_id is not null
do nothing;
"""


def mesajlar(msj):
    sat = [f"({q(str(m['id']))},{q(str(m['conversation_id']))},{q(m['yon'])},"
           f"{q(DURUM.get(m['durum'],'gonderildi'))},{q(m['body'])},{q(m['rendered_body'])},"
           f"{q(str(m['template_id'])) if m['template_id'] else 'null'},{q(m['template_variables'])},"
           f"{q(m['provider_id'])},{q(m['error_code'])},{q(m['error_message'])},"
           f"{q(m['media_url'])},{q(m['media_type'])},{q(m['media_name'])},"
           f"{m['media_size_bytes'] if m['media_size_bytes'] else 'null'},"
           f"{q(m['sent_at'])},{q(m['delivered_at'])},{q(m['read_at'])},{q(m['failed_at'])},{q(m['created_at'])})"
           for m in msj]
    return f"""-- Mesajlar. NOT: last_message_at/unread_count tetikleyicisi bu göçte devre dışı —
-- kaynaktaki değerler zaten konuşmaya yazıldı, tetikleyici onları bozardı.
alter table public.messages disable trigger messages_touch_conversation;

create temp table _m (ext text, konusma_ext text, yon text, durum text, body text, rendered text,
  tpl_ext text, tpl_var jsonb, provider_id text, hata_kod text, hata_mesaj text,
  medya_url text, medya_tip text, medya_ad text, medya_boyut bigint,
  gonderildi timestamptz, iletildi timestamptz, okundu timestamptz, basarisiz timestamptz,
  olusturma timestamptz) on commit drop;
insert into _m values
{",".join(sat)};

insert into public.messages
  (conversation_id, direction, status, body, rendered_body, template_id, template_variables,
   provider, provider_message_id, error_code, error_message,
   media_url, media_type, media_name, media_size_bytes,
   external_source, external_id, sent_at, delivered_at, read_at, failed_at, created_at)
select cv.id, m.yon, m.durum, m.body, m.rendered, mt.id, m.tpl_var,
       case when m.provider_id is not null then 'twilio' end, m.provider_id,
       m.hata_kod, m.hata_mesaj, m.medya_url, m.medya_tip, m.medya_ad, m.medya_boyut,
       'teklead', m.ext, m.gonderildi, m.iletildi, m.okundu, m.basarisiz, m.olusturma
  from _m m
  join public.conversations cv on cv.external_source='teklead' and cv.external_id = m.konusma_ext
  left join public.message_templates mt on mt.external_source='teklead' and mt.external_id = m.tpl_ext
on conflict (external_source, external_id) where external_source is not null and external_id is not null
do nothing;

alter table public.messages enable trigger messages_touch_conversation;
"""


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('girdi'); ap.add_argument('--cikti-dizin', default='/tmp/m33')
    ap.add_argument('--parti-boyu', type=int, default=800)
    a = ap.parse_args()
    d = json.loads(pathlib.Path(a.girdi).read_text())
    out = pathlib.Path(a.cikti_dizin); out.mkdir(parents=True, exist_ok=True)

    (out / '00-sablon-konusma.sql').write_text(
        sablonlar(d['tpl'], d['tplvar']) + "\n" + konusmalar(d['konusma']))
    msj = sorted(d['mesaj'], key=lambda m: m['id'])
    for i in range(0, len(msj), a.parti_boyu):
        (out / f'{i//a.parti_boyu+1:02d}-mesaj.sql').write_text(mesajlar(msj[i:i + a.parti_boyu]))
    print(f"şablon {len(d['tpl'])} · değişken {len(d['tplvar'])} · konuşma {len(d['konusma'])} · "
          f"mesaj {len(msj)} → {1 + (len(msj)-1)//a.parti_boyu} parti", file=sys.stderr)
