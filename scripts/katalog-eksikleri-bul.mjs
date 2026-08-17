#!/usr/bin/env node
// Katalog görsel indirme — EKSİK ürünleri bulur ve çözüm yöntemini belirler.
// Her ürün için Drive kaynağı iki biçimde gelir:
//   1) folderId  — doğrudan klasör (CSV "YARDIMCI - klasör kimliği" veya
//                   "GÖRSEL LİNKİ" içinde .../drive/folders/<ID>)
//   2) mainFileId — sadece tek temsili görsel (CSV "GÖRSEL LİNKİ" içinde
//                   .../file/d/<ID>). Bunun parent klasörü ayrıca çözülmeli.
// "İnmiş" = data/yeni-katalog-gorseller/<KOD>/ altında en az bir görsel var.
// Çıktı: scripts/.katalog-eksikler.json  -> [{code, folderId|null, mainFileId|null}]
// Yalnız okuma; Drive'a/DB'ye dokunmaz.

import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CSV = join(ROOT, 'data', 'yeni-katalog.csv');
const OUT_DIR = join(ROOT, 'data', 'yeni-katalog-gorseller');
const MISSING = join(ROOT, 'scripts', '.katalog-eksikler.json');

function parseCsv(text) {
  const rows = [];
  let row = [], field = '', inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQuotes = false; }
      else field += c;
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ',') { row.push(field); field = ''; }
      else if (c === '\r') { /* skip */ }
      else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
      else field += c;
    }
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}

const rows = parseCsv(readFileSync(CSV, 'utf8'));
const header = rows[0];
const codeIdx = header.indexOf('Kodlar');
const folderIdx = header.indexOf('YARDIMCI - klasör kimliği (silmeyin)');
const linkIdx = header.indexOf('GÖRSEL LİNKİ');
if (codeIdx === -1 || folderIdx === -1 || linkIdx === -1) {
  console.error('HATA: beklenen kolonlar bulunamadı. Başlık:', header);
  process.exit(1);
}

// Bir satırdan Drive kaynağını çıkar: {folderId, mainFileId}
function resolveSource(row) {
  const helper = (row[folderIdx] || '').trim();
  if (helper) return { folderId: helper, mainFileId: null };
  const link = (row[linkIdx] || '').trim();
  const fol = link.match(/\/folders\/([A-Za-z0-9_-]+)/);
  if (fol) return { folderId: fol[1], mainFileId: null };
  const fil = link.match(/\/file\/d\/([A-Za-z0-9_-]+)/);
  if (fil) return { folderId: null, mainFileId: fil[1] };
  return { folderId: null, mainFileId: null };
}

function hasImages(code) {
  const dir = join(OUT_DIR, code);
  if (!existsSync(dir)) return false;
  return readdirSync(dir).some((f) => /\.(webp|jpg|jpeg|png)$/i.test(f));
}

const products = rows.slice(1)
  .map((r) => ({ code: (r[codeIdx] || '').trim(), ...resolveSource(r) }))
  .filter((p) => p.code);

const noSource = products.filter((p) => !p.folderId && !p.mainFileId);
const done = products.filter((p) => hasImages(p.code));
const missing = products.filter((p) => !hasImages(p.code) && (p.folderId || p.mainFileId));

const missWithFolder = missing.filter((p) => p.folderId);
const missNeedResolve = missing.filter((p) => !p.folderId && p.mainFileId);

writeFileSync(MISSING, JSON.stringify(missing, null, 2));

console.log(`Toplam ürün (CSV)          : ${products.length}`);
console.log(`Diskte inmiş               : ${done.length}`);
console.log(`EKSİK (indirilecek)        : ${missing.length}`);
console.log(`  ├─ klasör ID hazır       : ${missWithFolder.length}`);
console.log(`  └─ parent çözülecek (MCP): ${missNeedResolve.length}`);
if (noSource.length) console.log(`⚠ kaynağı olmayan ürün     : ${noSource.length} (${noSource.map((p) => p.code).join(', ')})`);
console.log(`\nEksik liste yazıldı        : ${MISSING}`);
