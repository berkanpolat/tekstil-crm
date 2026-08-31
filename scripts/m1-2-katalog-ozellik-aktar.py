#!/usr/bin/env python3
"""
M1.2 — Katalog özellik aktarımı (tek seferlik, idempotent SQL üretici).

NE YAPAR
  1. Studio'nun (uretimCrm) 169 kumaş tipini yeniCrm sözlüğüne aktarır.
  2. Katalog 4'ün composition metnindeki 27 konfeksiyon kumaşını sözlüğe ekler.
  3. 672 ürüne site slug'ını yazar — katalog 2 KOD ile (197), katalog 4 AD ile (475).
  4. Katalog 4'ün 475 ürününü kumaş tipine bağlar (yalnız Dokuma/Örme/Denim grupları).
  5. Studio'daki 40 fit atamasını aktarır.

NEDEN BÖYLE
  • slug ADDAN TÜRETİLEMEZ: sitenin 672 slug'ından 8'i ada uymuyor (7'si "-2" çakışma
    soneki). Bu yüzden slug kaynaktan (products.json) okunur, üretilmez.
  • Katalog 4'ün kodları YS-… , sitenin kodları ST-… — köprü AD üzerinden kurulur
    (475/475 birebir eşleşiyor, doğrulandı).
  • Konfeksiyon ürünü döşemelik kumaşa bağlanmasın diye eşleştirme yalnız
    Dokuma/Örme/Denim gruplarında yapılır. Süet ve Dantel kaynak sözlükte sadece
    döşemelik/perdelik gruplarındaydı; konfeksiyon karşılıkları eklendi.

KULLANIM
  python3 scripts/m1-2-katalog-ozellik-aktar.py > /tmp/m12.sql
  # Kuru koşu:  begin; <sql> <sayım sorguları> rollback;
  # Uygulama:   begin; <sql> commit;

GİRDİLER (salt okuma)
  • CRM ürünleri     — Management API
  • Studio sözlükleri — anon anahtar (katalog tabloları anon'a SELECT açık)
  • site slug'ları    — uretim/products.json
"""
import json, re, sys, pathlib

TR = str.maketrans('ıİşŞğĞüÜöÖçÇ', 'iissgguuoocc')
key   = lambda s: re.sub(r'[^a-z0-9]+', '_', s.lower().translate(TR)).strip('_')
temiz = lambda s: re.sub(r'\(.*?\)', '', s).strip()
q     = lambda s: "'" + str(s).replace("'", "''") + "'"

GRUP = {'Dokuma Kumaşlar': 'dokuma', 'Örme Kumaşlar': 'orme', 'Denim Kumaşlar': 'denim',
        'Döşemelik Kumaşlar': 'dosemelik', 'Ev Tekstili Kumaşları': 'ev_tekstili',
        'Perdelik Kumaşlar': 'perdelik', 'Astarlık Kumaşlar': 'astarlik',
        'Aksesuar ve Teknik Amaçlı Kumaşlar': 'aksesuar', 'Nonwoven Kumaşlar': 'nonwoven'}

# Katalog 4'ün composition değerlerinin grup sınıflandırması (tekstil bilgisiyle).
# Belirsiz olanlar yorumda işaretli — panelden düzeltilebilir.
KONFEKSIYON = {
    'Pamuk Keten': 'dokuma', 'Medine İpeği': 'dokuma', 'Modal': 'orme',
    'Compact Penye': 'orme', 'Denim': 'denim', 'Double': 'orme',
    'Terikoton': 'dokuma', 'Viscon': 'dokuma', 'Tencel': 'dokuma',
    'Oysho': 'orme',        # belirsiz — marka benzeri ad
    'Tüvit': 'dokuma', 'Scuba': 'orme',
    'Sandy': 'dokuma',      # belirsiz
    'Pliseli Jersey': 'orme', 'Kupra': 'dokuma', 'Özel Örgü': 'orme',
    'Paraşüt': 'dokuma', 'Pera Keten': 'dokuma', 'Pike Cupra': 'orme',
    'Lame': 'dokuma', 'Pul Payet': 'dokuma', 'Poliviskon Dokuma': 'dokuma',
    'Filamlı Keten': 'dokuma',
    'Gübür': 'dokuma',      # belirsiz
    'Viscon+Terikoton': 'dokuma',
    'Süet': 'dokuma', 'Dantel': 'dokuma',   # konfeksiyon karşılığı yoktu
}
FITKEY = {'Regular Fit (Normal Kalıp)': 'regular', 'Slim Fit (Dar Kalıp)': 'slim',
          'Oversize Fit (Bol Kalıp)': 'oversize', 'Relaxed Fit (Rahat Kalıp)': 'relaxed',
          'Skinny Fit (Dar Paça – alt giyim)': 'skinny',
          'Straight Fit (Düz Paça – alt giyim)': 'straight'}
GARMENT = "('dokuma','orme','denim')"


def uret(d):
    crm, ft, fg   = d['crm'], d['fabric_types'], d['fabric_groups']
    fits, stp     = d['fit_types'], d['studio_products']
    site          = d['site']
    gname = {g['id']: g['name'] for g in fg}
    out = []

    out.append("-- 1) Studio'dan kumaş tipleri")
    for t in sorted(ft, key=lambda x: (gname.get(x['group_id']) or '', x['sort_order'])):
        out.append(f"insert into public.fabric_types (group_id,key,label,sort_order,is_system) "
                   f"select id,{q(key(t['name']))},{q(t['name'])},{t['sort_order']},true "
                   f"from public.fabric_groups where key={q(GRUP[gname[t['group_id']]])} "
                   f"on conflict (group_id,key) do nothing;")

    out.append("\n-- 2) Konfeksiyon kumaşları")
    for ad, g in KONFEKSIYON.items():
        out.append(f"insert into public.fabric_types (group_id,key,label,sort_order,is_system) "
                   f"select id,{q(key(ad))},{q(ad)},900,false "
                   f"from public.fabric_groups where key={q(g)} on conflict (group_id,key) do nothing;")

    # slug eşleştirme
    by_code = {p['code']: p for p in site}
    by_name = {}
    for p in site:
        by_name.setdefault(p['name'].strip().lower(), []).append(p)
    smap = {}
    for c in crm:
        if c['catalog_id'] == 2:
            s = by_code.get(c['code'])
            if s: smap[c['id']] = s['slug']
        else:
            cands = by_name.get(c['name'].strip().lower(), [])
            if len(cands) == 1: smap[c['id']] = cands[0]['slug']
    if len(smap) != len(crm):
        sys.exit(f"DURDU: {len(crm)} üründen yalnız {len(smap)} eşleşti — elle bakılmalı.")

    out.append(f"\n-- 3) slug ({len(smap)} ürün)")
    vals = ",".join(f"({i},{q(s)})" for i, s in smap.items())
    out.append(f"update public.catalog_products p set slug=v.slug "
               f"from (values {vals}) as v(id,slug) where p.id=v.id and p.deleted_at is null;")

    pairs = [(c['id'], key(temiz(c['composition']))) for c in crm
             if c['catalog_id'] == 4 and c.get('composition')]
    out.append(f"\n-- 4) katalog 4: composition → fabric_type_id ({len(pairs)} aday)")
    vals = ",".join(f"({i},{q(k)})" for i, k in pairs)
    out.append(f"""update public.catalog_products p
   set fabric_type_id = ft.id, fabric_group_id = ft.group_id
  from (values {vals}) as v(id,fkey)
  join public.fabric_types ft on ft.key = v.fkey
  join public.fabric_groups fgr on fgr.id = ft.group_id and fgr.key in {GARMENT}
 where p.id = v.id and p.deleted_at is null;""")

    fitname = {f['id']: f['name'] for f in fits}
    slug2id = {s: i for i, s in smap.items()}
    fp = [(slug2id[p['slug']], FITKEY[fitname[p['fit_type_id']]]) for p in stp
          if p.get('fit_type_id') and p['slug'] in slug2id]
    out.append(f"\n-- 5) Studio'dan fit ataması ({len(fp)} ürün)")
    vals = ",".join(f"({i},{q(k)})" for i, k in fp)
    out.append(f"""update public.catalog_products p set fit_type_id = f.id
  from (values {vals}) as v(id,fkey) join public.fit_types f on f.key = v.fkey
 where p.id = v.id and p.deleted_at is null;""")
    return "\n".join(out) + "\n"


if __name__ == '__main__':
    girdi = sys.argv[1] if len(sys.argv) > 1 else '/tmp/m12/girdiler.json'
    print(uret(json.loads(pathlib.Path(girdi).read_text())))
