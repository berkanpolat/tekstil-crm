#!/usr/bin/env node
// Katalog görsel indirici — data/urunler.csv'deki her ürünün sayfasından
// tüm görselleri (WebP tercihli, JPEG fallback) indirir.
// Hedef: data/katalog-gorseller/<ÜRÜN_KODU>/<sıra>.webp
// Yalnız okuma + indirme; canlı DB'ye dokunmaz.

import { readFileSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CSV = join(ROOT, 'data', 'urunler.csv');
const OUT = join(ROOT, 'data', 'katalog-gorseller');
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36';
const DELAY = 300;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// --- Basit ama doğru CSV ayrıştırıcı (tırnaklı çok-satırlı alanlar dahil) ---
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
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

// --- Galeri görsellerini çıkar: her <picture> için webp (source srcset) ya da jpg (img src) ---
function extractImages(html) {
  const gStart = html.indexOf('class="gallery"');
  if (gStart === -1) return [];
  // gallery div'inin sonu: thumbs bittikten sonra. Basitçe pictureları gallery'den itibaren tara.
  const region = html.slice(gStart, gStart + 8000);
  const pics = region.match(/<picture[\s\S]*?<\/picture>/g) || [];
  const out = [];
  const seen = new Set();
  for (const p of pics) {
    const webp = p.match(/<source[^>]*srcset="([^"]+)"/i);
    const jpg = p.match(/<img[^>]*src="([^"]+)"/i);
    // dedup anahtarı: webp yolu (yoksa jpg). Ana görsel = ilk thumb, aynı olur.
    const key = (webp?.[1] || jpg?.[1] || '').split('/').pop();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    if (webp) out.push({ url: webp[1], ext: 'webp' });
    else if (jpg) out.push({ url: jpg[1], ext: 'jpg' });
  }
  return out;
}

function absolutize(url, base) {
  if (url.startsWith('http')) return url;
  return new URL(url, base).href;
}

const csvText = readFileSync(CSV, 'utf8');
const rows = parseCsv(csvText);
const header = rows[0];
const codeIdx = header.indexOf('Ürün Kodu');
const urlIdx = header.indexOf('Ürün Sayfası URL');
const products = rows.slice(1)
  .filter((r) => r[codeIdx] && r[urlIdx])
  .map((r) => ({ code: r[codeIdx].trim(), url: r[urlIdx].trim() }));

mkdirSync(OUT, { recursive: true });

let totalImages = 0;
let totalBytes = 0;
let processed = 0;
const noImage = [];   // sayfa açıldı ama görsel yok
const pageError = []; // sayfa açılmadı

console.log(`${products.length} ürün bulundu. İndirme başlıyor...\n`);

for (let idx = 0; idx < products.length; idx++) {
  const { code, url } = products[idx];
  const tag = `[${idx + 1}/${products.length}] ${code}`;
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA } });
    if (!res.ok) { pageError.push({ code, url, reason: `HTTP ${res.status}` }); console.log(`${tag} ✗ HTTP ${res.status}`); await sleep(DELAY); continue; }
    const html = await res.text();
    const imgs = extractImages(html);
    if (!imgs.length) { noImage.push({ code, url }); console.log(`${tag} ⚠ görsel yok`); await sleep(DELAY); continue; }

    const dir = join(OUT, code);
    mkdirSync(dir, { recursive: true });
    let n = 0;
    for (let j = 0; j < imgs.length; j++) {
      const img = imgs[j];
      const abs = absolutize(img.url, url);
      try {
        const ir = await fetch(abs, { headers: { 'User-Agent': UA } });
        if (!ir.ok) { console.log(`${tag}   görsel ${j + 1} ✗ HTTP ${ir.status}`); await sleep(DELAY); continue; }
        const buf = Buffer.from(await ir.arrayBuffer());
        n++;
        const file = join(dir, `${n}.${img.ext}`);
        writeFileSync(file, buf);
        totalImages++;
        totalBytes += buf.length;
        await sleep(DELAY);
      } catch (e) {
        console.log(`${tag}   görsel ${j + 1} ✗ ${e.message}`);
        await sleep(DELAY);
      }
    }
    if (n === 0) noImage.push({ code, url });
    else processed++;
    console.log(`${tag} ✓ ${n} görsel`);
    await sleep(DELAY);
  } catch (e) {
    pageError.push({ code, url, reason: e.message });
    console.log(`${tag} ✗ ${e.message}`);
    await sleep(DELAY);
  }
}

// --- RAPOR ---
const mb = (totalBytes / 1024 / 1024).toFixed(1);
console.log('\n' + '='.repeat(60));
console.log('RAPOR');
console.log('='.repeat(60));
console.log(`İşlenen ürün        : ${processed} / ${products.length}`);
console.log(`İndirilen görsel     : ${totalImages}`);
console.log(`Toplam boyut         : ${mb} MB (${totalBytes} bayt)`);
console.log(`Ürün başına ortalama : ${processed ? (totalImages / processed).toFixed(2) : 0} görsel`);

if (noImage.length) {
  console.log(`\nGörseli olmayan ürünler (${noImage.length}):`);
  for (const p of noImage) console.log(`  - ${p.code}  ${p.url}`);
}
if (pageError.length) {
  console.log(`\nSayfası açılmayan ürünler (${pageError.length}):`);
  for (const p of pageError) console.log(`  - ${p.code}  [${p.reason}]  ${p.url}`);
}
if (!noImage.length && !pageError.length) console.log('\nHata veren ürün yok. ✓');
