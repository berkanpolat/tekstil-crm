#!/usr/bin/env node
// Manifest derleyici. İki kaynağı birleştirir:
//   1) Klasör ID'si CSV'den hazır gelen eksik ürünler (mainFileId=null)
//   2) scripts/.katalog-parentler.jsonl — MCP ile çözülen {code, folderId} satırları
//      (parent klasör kimliği). Her satır bir JSON nesnesi.
// Çıktı: scripts/katalog-manifest.json  -> [{code, folderId}]
// Ayrıca hâlâ çözülmemiş (folderId'siz) eksik ürünleri raporlar.
// Yalnız yerel dosya; Drive/DB'ye dokunmaz.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MISSING = join(ROOT, 'scripts', '.katalog-eksikler.json');
const PARENTS = join(ROOT, 'scripts', '.katalog-parentler.jsonl');
const MANIFEST = join(ROOT, 'scripts', 'katalog-manifest.json');

const missing = JSON.parse(readFileSync(MISSING, 'utf8'));

// çözülen parentler: code -> folderId
const resolved = new Map();
if (existsSync(PARENTS)) {
  for (const line of readFileSync(PARENTS, 'utf8').split('\n')) {
    const s = line.trim();
    if (!s) continue;
    try { const o = JSON.parse(s); if (o.code && o.folderId) resolved.set(o.code, o.folderId); }
    catch { /* bozuk satır atla */ }
  }
}

const manifest = [];
const stillMissing = [];
for (const p of missing) {
  const folderId = p.folderId || resolved.get(p.code) || null;
  if (folderId) manifest.push({ code: p.code, folderId });
  else stillMissing.push(p.code);
}

writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2));

console.log(`Eksik ürün toplam      : ${missing.length}`);
console.log(`Manifest'e yazılan      : ${manifest.length}`);
console.log(`  ├─ CSV'den klasör hazır: ${missing.filter((p) => p.folderId).length}`);
console.log(`  └─ MCP ile çözülen     : ${manifest.length - missing.filter((p) => p.folderId).length}`);
console.log(`Hâlâ çözülmemiş         : ${stillMissing.length}${stillMissing.length ? ' (' + stillMissing.join(', ') + ')' : ''}`);
console.log(`\nManifest: ${MANIFEST}`);
