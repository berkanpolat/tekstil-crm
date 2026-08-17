#!/usr/bin/env node
// Katalog görsel indirici — KİMLİK GEREKTİRMEZ (public Drive URL'leri).
// Girdi: scripts/katalog-manifest.json  -> [{code, folderId}]  (eksik ürünler)
// Her ürün için Drive klasör sayfasını (public) kazır, içindeki görsel dosya
// ID'lerini bulur, uc?export=download ile indirir, md5 ile mükerrerleri eler,
// genişliği >1200 ise 1200'e küçültüp (aspect korunur) cwebp ile .webp'e çevirir,
// data/yeni-katalog-gorseller/<KOD>/<sıra>.webp olarak yazar.
//
// Özellikler:
//  - İDEMPOTENT: klasöründe zaten görsel olan ürünü atlar.
//  - YENİDEN DENEME: klasör erişimi başarısızsa 3 kez dener (5-10-20 sn bekleme).
//  - DEVRE KESİCİ: art arda 5 ürün başarısız olursa DURUR ve bildirir.
//  - DÜRÜST RAPOR: sonda gerçek döküm — başarılı / atlandı / hatalı.
//  - Oturum/kimlik yok; bilgisayar uykuya girip uyanınca kaldığı yerden sürer.
// Yalnız okuma + indirme; canlı DB'ye dokunmaz.

import { readFileSync, writeFileSync, appendFileSync, mkdirSync, existsSync, readdirSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MANIFEST = join(ROOT, 'scripts', 'katalog-manifest.json');
const OUT_DIR = join(ROOT, 'data', 'yeni-katalog-gorseller');
const LOG = join(OUT_DIR, '_indirme.log');
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36';
const MAX_W = 1200;          // genişlik üst sınırı (küçükse dokunulmaz)
const QUALITY = 80;          // cwebp kalite
const RETRIES = [5000, 10000, 20000]; // yeniden deneme beklemeleri
const BREAKER = 5;           // art arda bu kadar ürün hatası -> DUR
const DELAY = 300;           // istekler arası kibar bekleme

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ts = () => new Date().toTimeString().slice(0, 8);
function log(msg) {
  const line = `[${ts()}] ${msg}`;
  console.log(line);
  appendFileSync(LOG, line + '\n');
}

// --- klasör sayfasından 33-karakterlik dosya ID'lerini çıkar (klasörün kendisi hariç) ---
function extractFileIds(html, folderId) {
  const ids = new Set();
  const re = /"(1[A-Za-z0-9_-]{32})"/g;
  let m;
  while ((m = re.exec(html))) { if (m[1] !== folderId) ids.add(m[1]); }
  return [...ids];
}

async function fetchBuffer(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA }, redirect: 'follow' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const ct = res.headers.get('content-type') || '';
  const buf = Buffer.from(await res.arrayBuffer());
  return { ct, buf };
}

// bir dosya ID'sini indir; görsel değilse null döndür
async function downloadImage(fileId) {
  const url = `https://drive.google.com/uc?export=download&id=${fileId}`;
  const { ct, buf } = await fetchBuffer(url);
  // Google bazen HTML "onay" sayfası döndürür (çok büyük dosya). Küçük HTML ise ele.
  if (ct.includes('text/html')) return null;
  if (!/image\//.test(ct) && buf.length < 1024) return null;
  return buf;
}

// buffer'ı webp'e çevir (genişlik>MAX_W ise küçült). cwebp png/jpg okur.
function toWebp(buf, tmpBase) {
  const src = `${tmpBase}.src`;
  const out = `${tmpBase}.webp`;
  writeFileSync(src, buf);
  let width = 0;
  try {
    const info = execFileSync('sips', ['-g', 'pixelWidth', src], { encoding: 'utf8' });
    const mm = info.match(/pixelWidth:\s*(\d+)/);
    if (mm) width = parseInt(mm[1], 10);
  } catch { /* sips okuyamadıysa görsel değildir */ }
  if (!width) { rmSync(src, { force: true }); return null; } // geçerli görsel değil
  const args = ['-quiet', '-q', String(QUALITY)];
  if (width > MAX_W) args.push('-resize', String(MAX_W), '0');
  args.push(src, '-o', out);
  execFileSync('cwebp', args);
  const webp = readFileSync(out);
  rmSync(src, { force: true });
  rmSync(out, { force: true });
  return webp;
}

function hasImages(code) {
  const dir = join(OUT_DIR, code);
  return existsSync(dir) && readdirSync(dir).some((f) => /\.(webp|jpg|jpeg|png)$/i.test(f));
}

// tek ürünü indir; {ok, count} veya {ok:false, reason}
async function processProduct(p, tmpBase) {
  // klasör HTML'ini yeniden-denemeli çek
  let ids = null, lastErr = '';
  for (let attempt = 0; attempt <= RETRIES.length; attempt++) {
    try {
      const res = await fetch(`https://drive.google.com/drive/folders/${p.folderId}`, { headers: { 'User-Agent': UA } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const html = await res.text();
      const found = extractFileIds(html, p.folderId);
      if (!found.length) throw new Error('klasörde dosya ID bulunamadı');
      ids = found;
      break;
    } catch (e) {
      lastErr = e.message;
      if (attempt < RETRIES.length) {
        log(`${p.code}: klasör erişilemedi (${lastErr}) — ${RETRIES[attempt] / 1000}s sonra tekrar (${attempt + 1}/${RETRIES.length})`);
        await sleep(RETRIES[attempt]);
      }
    }
  }
  if (!ids) return { ok: false, reason: `klasör erişilemedi: ${lastErr}` };

  const dir = join(OUT_DIR, p.code);
  mkdirSync(dir, { recursive: true });
  const seen = new Set();
  let n = 0, dedup = 0;
  for (const fid of ids) {
    let buf = null;
    for (let attempt = 0; attempt <= RETRIES.length; attempt++) {
      try { buf = await downloadImage(fid); break; }
      catch (e) {
        if (attempt < RETRIES.length) { await sleep(RETRIES[attempt]); }
        else log(`${p.code}: görsel ${fid} inmedi (${e.message})`);
      }
    }
    if (!buf) continue;
    const md5 = createHash('md5').update(buf).digest('hex');
    if (seen.has(md5)) { dedup++; continue; }
    seen.add(md5);
    const webp = toWebp(buf, tmpBase);
    if (!webp) continue; // görsel değildi (info.json/txt vb.)
    n++;
    writeFileSync(join(dir, `${n}.webp`), webp);
    await sleep(DELAY);
  }
  if (n === 0) { rmSync(dir, { recursive: true, force: true }); return { ok: false, reason: 'geçerli görsel yok' }; }
  return { ok: true, count: n, dedup };
}

// --- ANA AKIŞ ---
const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
mkdirSync(OUT_DIR, { recursive: true });
const tmpBase = join(tmpdir(), `katalog-indir-${process.pid}`);

let success = 0, skipped = 0, failed = 0, totalImgs = 0;
const failedList = [];
let consecutive = 0;

log(`=== BAŞLADI: ${manifest.length} eksik ürün (kimliksiz indirme) ===`);

for (let i = 0; i < manifest.length; i++) {
  const p = manifest[i];
  if (hasImages(p.code)) { skipped++; continue; }

  const r = await processProduct(p, tmpBase);
  if (r.ok) {
    success++; totalImgs += r.count; consecutive = 0;
    log(`${p.code}: ${r.count} görsel${r.dedup ? `, dedup=${r.dedup}` : ''}, tamam`);
  } else {
    failed++; consecutive++; failedList.push(`${p.code} (${r.reason})`);
    log(`${p.code}: HATA ${r.reason}`);
    if (consecutive >= BREAKER) {
      log(`!!! DEVRE KESİCİ: art arda ${BREAKER} ürün başarısız — DURULDU. Oturum/ağ sorunu olabilir.`);
      break;
    }
  }
  if ((i + 1) % 25 === 0) log(`--- ilerleme: ${i + 1}/${manifest.length} (başarılı=${success} atlandı=${skipped} hata=${failed}) ---`);
}

// --- DÜRÜST RAPOR ---
log('='.repeat(56));
log(`RAPOR — başarılı: ${success} | atlandı(zaten var): ${skipped} | hatalı: ${failed}`);
log(`İndirilen görsel: ${totalImgs}`);
if (failedList.length) {
  log(`Hatalı ürünler (${failedList.length}):`);
  for (const f of failedList) log(`  - ${f}`);
}
const remaining = manifest.length - success - skipped - failed;
if (remaining > 0) log(`İşlenmeyen (devre kesici sonrası): ${remaining} — script'i tekrar çalıştırın, kaldığı yerden sürer.`);
log(`=== BİTTİ ===`);
