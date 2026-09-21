<?php
// Lead toplama — Supabase bağımsız. Dosyaya yazar + e-posta + best-effort Supabase forward.
require_once __DIR__ . '/lead-mail.php';
header('Content-Type: application/json; charset=utf-8');
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if (preg_match('#^https://(www\.)?tekstilas\.com$#', $origin)) {
    header("Access-Control-Allow-Origin: $origin");
}
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') { http_response_code(204); exit; }
if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') { http_response_code(405); echo json_encode(['error' => 'method']); exit; }

/**
 * Yanıtı yazar ve istemci bağlantısını kapatır; script arka planda sürer.
 * Sunucu LiteSpeed (13 Eyl'de doğrulandı): orada fastcgi_finish_request YOK,
 * karşılığı litespeed_finish_request. FPM için fastcgi_ da denenir; ikisi de
 * yoksa Content-Length + Connection: close'a düşülür.
 */
function lead_finish(array $payload): void
{
    $out = json_encode($payload, JSON_UNESCAPED_UNICODE);
    ignore_user_abort(true);          // istemci gidince PHP durmasın
    @set_time_limit(60);              // arka plan işleri için süre
    echo $out;

    // Sunucu bağlantıyı kendi kapatabiliyorsa BAŞLIKLARA DOKUNMA.
    // 13 Eyl: `Connection: close` + `Content-Length` elle yazılmıştı; `Connection`
    // HTTP/2'de yasak bir başlık, araya giren katmanlardan biri geçirirse tarayıcı
    // akışı protokol hatasıyla düşürür ve fetch "Failed to fetch" verir —
    // kullanıcı formu gönderemez. Gerek de yok: bu sunucu LiteSpeed.
    if (function_exists('litespeed_finish_request')) { litespeed_finish_request(); return; }
    if (function_exists('fastcgi_finish_request'))   { fastcgi_finish_request();   return; }

    // Son çare (ikisi de yoksa): tamponu boşalt, bağlantı isteğin sonunda kapanır.
    while (ob_get_level() > 0) { @ob_end_flush(); }
    @flush();
}

// ---- İstek logu: her istek için tek satır (istemcideki PostHog olayıyla aynı istek_id) ----
// "Sunucuya hiç ulaşmadı mı, ulaştı da mı düştü" sorusu 13-15 Eyl'de cevapsız kalmıştı.
$T0 = $_SERVER['REQUEST_TIME_FLOAT'] ?? microtime(true);
$LOGDIR = __DIR__ . '/../leads_private';
$lead_log = static function (string $sonuc, string $istekId = '', array $ek = []) use ($T0, $LOGDIR): void {
    $satir = ['ts' => date('c'), 'istek_id' => $istekId, 'sonuc' => $sonuc,
              'sure_ms' => (int)round((microtime(true) - $T0) * 1000),
              'boyut' => (int)($_SERVER['CONTENT_LENGTH'] ?? 0),
              'tip' => strtok((string)($_SERVER['CONTENT_TYPE'] ?? ''), ';'),
              'ip' => $_SERVER['REMOTE_ADDR'] ?? '',
              'ua' => mb_substr((string)($_SERVER['HTTP_USER_AGENT'] ?? ''), 0, 120)] + $ek;
    @file_put_contents("$LOGDIR/lead_istek.log", json_encode($satir, JSON_UNESCAPED_UNICODE) . "\n", FILE_APPEND | LOCK_EX);
};

// Gövde iki biçimde gelebilir:
//  - application/json  → görsel (küçültülmüş base64) ya da katalog seçimi
//  - multipart/form-data → `payload` (JSON metni) + `video` (ham dosya).
//    Video base64 JSON'a gömülmez: 30 MB dosya 40 MB tek istek oluyordu ve
//    mobilde ilk kesintide kopuyordu. Ham dosya %33 küçük, PHP de dev JSON parse etmez.
$ctype = (string)($_SERVER['CONTENT_TYPE'] ?? '');
$videoUp = null;

// ---- İkinci aşama: dosya eki (teklif-kasasi.js) ----
// Öz (ad/telefon/ürün) birinci istekte geldi ve yazıldı; video ayrı gelir, aynı
// istek_id'ye bağlanır: uploads/<istek_id>.<ext>. Panel bu adla bulur.
// Mail/Supabase tekrarlanmaz — o iş birinci aşamada bitti.
if (stripos($ctype, 'multipart/form-data') === 0 && (string)($_POST['ek'] ?? '') === '1') {
    $ekId = (string)($_POST['istek_id'] ?? '');
    if (!preg_match('/^[A-Za-z0-9-]{8,64}$/', $ekId)) { $lead_log('400_ek_id'); http_response_code(400); echo json_encode(['error' => 'ek_id']); exit; }
    $dir = __DIR__ . '/../leads_private'; @mkdir("$dir/uploads", 0700, true);
    $mevcut = glob("$dir/uploads/$ekId.*") ?: [];
    if ($mevcut) { $lead_log('ek_tekrar', $ekId); lead_finish(['ok' => true, 'tekrar' => true]); exit; }   // aynı ek ikinci kez: sorun yok
    $f = $_FILES['dosya'] ?? $_FILES['video'] ?? null;
    if (!$f || empty($f['tmp_name']) || !is_uploaded_file($f['tmp_name'])) {
        $lead_log('400_ek_dosya_yok', $ekId, ['upload_err' => (int)($f['error'] ?? -1)]); http_response_code(400); echo json_encode(['error' => 'ek_dosya_yok']); exit;
    }
    $VEXT = ['video/mp4' => 'mp4', 'video/quicktime' => 'mov', 'video/webm' => 'webm', 'video/x-msvideo' => 'avi', 'video/x-matroska' => 'mkv', 'video/3gpp' => '3gp',
             'image/jpeg' => 'jpg', 'image/png' => 'png', 'image/webp' => 'webp', 'image/gif' => 'gif', 'image/heic' => 'heic', 'image/heif' => 'heif', 'image/avif' => 'avif'];
    $ext = $VEXT[strtolower((string)($f['type'] ?? ''))] ?? strtolower(pathinfo((string)($f['name'] ?? ''), PATHINFO_EXTENSION));
    $ext = preg_replace('/[^a-z0-9]/', '', $ext) ?: 'bin';
    if ($ext === 'jpeg') $ext = 'jpg';
    // Video 80 MB (post_max_size), görsel 40 MB. HEIC dönüştürülemez (sunucuda libheif yok) → olduğu gibi saklanır.
    $gorselMi = in_array($ext, ['jpg', 'png', 'webp', 'gif', 'heic', 'heif', 'avif'], true);
    $ust = $gorselMi ? 40 * 1024 * 1024 : 80 * 1024 * 1024;
    if ((int)$f['size'] <= 0 || (int)$f['size'] >= $ust || !in_array($ext, ['mp4', 'mov', 'webm', 'avi', 'mkv', '3gp', 'jpg', 'png', 'webp', 'gif', 'heic', 'heif', 'avif'], true)) {
        $lead_log('413_ek_boyut', $ekId, ['boyut' => (int)$f['size'], 'ext' => $ext]); http_response_code(413); echo json_encode(['error' => 'ek_boyut']); exit;
    }
    if (!@move_uploaded_file($f['tmp_name'], "$dir/uploads/$ekId.$ext")) { $lead_log('500_ek_yazilamadi', $ekId); http_response_code(500); echo json_encode(['error' => 'ek_yazilamadi']); exit; }
    // Ham görsel: sunucuda 1600px JPEG'e küçült (GD okuyabiliyorsa). Okuyamazsa (HEIC) dosya olduğu gibi kalır.
    if ($gorselMi && $ext !== 'heic' && $ext !== 'heif' && function_exists('imagecreatefromstring')) {
        $im = @imagecreatefromstring((string)file_get_contents("$dir/uploads/$ekId.$ext"));
        if ($im) {
            // EXIF yönü (telefon fotoğrafları) — GD döndürmez, biz döndürürüz
            if ($ext === 'jpg' && function_exists('exif_read_data')) { $ex = @exif_read_data("$dir/uploads/$ekId.$ext"); $o = (int)($ex['Orientation'] ?? 1);
                if ($o === 3) $im = imagerotate($im, 180, 0); elseif ($o === 6) $im = imagerotate($im, -90, 0); elseif ($o === 8) $im = imagerotate($im, 90, 0); }
            $w = imagesx($im); $h = imagesy($im); $sc = min(1, 1600 / max($w, $h)); $tw = (int)round($w * $sc); $th = (int)round($h * $sc);
            $out = imagecreatetruecolor($tw, $th); imagecopyresampled($out, $im, 0, 0, 0, 0, $tw, $th, $w, $h);
            if (@imagejpeg($out, "$dir/uploads/$ekId.jpg", 82)) { if ($ext !== 'jpg') @unlink("$dir/uploads/$ekId.$ext"); $ext = 'jpg'; }
            imagedestroy($out); imagedestroy($im);
        }
    }
    @file_put_contents("$dir/ekler.jsonl", json_encode(['ts' => date('c'), 'istek_id' => $ekId, 'dosya' => "$ekId.$ext", 'boyut' => (int)$f['size']]) . "\n", FILE_APPEND | LOCK_EX);
    $lead_log('ek_ok', $ekId, ['dosya' => "$ekId.$ext", 'boyut' => (int)$f['size']]);
    lead_finish(['ok' => true, 'ek' => "$ekId.$ext"]);
    exit;
}

if (stripos($ctype, 'multipart/form-data') === 0) {
    $raw = (string)($_POST['payload'] ?? '');
    if (!empty($_FILES['video']['tmp_name']) && is_uploaded_file($_FILES['video']['tmp_name'])) { $videoUp = $_FILES['video']; }
    elseif (isset($_FILES['video']['error']) && (int)$_FILES['video']['error'] !== UPLOAD_ERR_OK) {
        // Dosya geldi ama PHP reddetti (ini sınırı, yarım yükleme…) — sebep loga düşsün, kayıt yine yazılır.
        $lead_log('video_reddedildi', (string)($_POST['payload'] ? (json_decode($_POST['payload'], true)['istek_id'] ?? '') : ''), ['upload_err' => (int)$_FILES['video']['error']]);
    }
} else {
    $raw = file_get_contents('php://input');
}
$d = json_decode($raw, true);
if (!is_array($d)) { $lead_log('400_bad_json'); http_response_code(400); echo json_encode(['error' => 'bad_json']); exit; }

// Tanı isteği (tani.html): kayıt YAZILMAZ, mail/Supabase YOK — yalnız log + ok.
// Ofis/müşteri cihazından "POST origin'e ulaşıyor mu, kaç ms" ölçümü için.
if (in_array((string)($d['source'] ?? ''), ['tani', 'nobetci'], true)) {
    $tid = preg_match('/^[A-Za-z0-9-]{4,64}$/', (string)($d['istek_id'] ?? '')) ? (string)$d['istek_id'] : 'tani';
    // Tanı raporu (ölçüm tablosu) varsa loga aynen düşsün — kısaltılmış ve süzülmüş
    $rap = is_array($d['rapor'] ?? null) ? array_map(static fn($v) => mb_substr(preg_replace('/[\r\n]+/', ' ', (string)$v), 0, 160), array_slice($d['rapor'], 0, 12, true)) : null;
    $lead_log('tani', $tid, $rap ? ['rapor' => $rap] : []); echo json_encode(['ok' => true, 'tani' => true]); exit;
}

// istek_id: istemcinin ürettiği gönderim kimliği. Yeniden denemelerde aynı gelir;
// bir kez yazıldıysa ikinciyi YAZMAYIZ (çift teklif olmasın). Format sıkı: log'a
// ve dosyaya olduğu gibi giriyor.
$istekId = (string)($d['istek_id'] ?? '');
if (!preg_match('/^[A-Za-z0-9-]{8,64}$/', $istekId)) { $istekId = ''; }

// CR/LF strip → e-posta başlık enjeksiyonu (Reply-To) önlenir
$clean = function ($s) { return trim(preg_replace('/[\r\n]+/', ' ', mb_substr((string)($s ?? ''), 0, 200))); };
$name  = $clean($d['full_name'] ?? '');
$city  = $clean($d['city'] ?? '');
$phone = $clean($d['phone'] ?? '');
$email = $clean($d['email'] ?? '');
$mode  = $clean($d['mode'] ?? '');
$source = $clean($d['source'] ?? '');
// Not: serbest metin, 1000 karakter. Mail gövdesine girer (başlığa değil), CR/LF korunur.
$note = trim(mb_substr((string)($d['note'] ?? ''), 0, 1000));
if ($name === '' || $phone === '') { $lead_log('422_eksik_alan', $istekId); http_response_code(422); echo json_encode(['error' => 'eksik_alan']); exit; }

$dir = __DIR__ . '/../leads_private';
@mkdir($dir, 0700, true);
@mkdir("$dir/uploads", 0700, true);

// Tekilleştirme: dosyanın son 256 KB'ında aynı istek_id varsa bu bir yeniden
// denemedir (ilk istek ulaşmış, yanıtı istemciye varamamış). Kayıt, mail,
// Supabase — hiçbiri tekrarlanmaz; istemciye yine ok döneriz ki akış tamamlansın.
if ($istekId !== '' && ($fh = @fopen("$dir/leads.jsonl", 'rb'))) {
    $sz = filesize("$dir/leads.jsonl") ?: 0;
    fseek($fh, max(0, $sz - 262144)); $kuyruk = stream_get_contents($fh); fclose($fh);
    if (strpos($kuyruk, '"istek_id":"' . $istekId . '"') !== false) {
        $lead_log('tekrar', $istekId);
        lead_finish(['ok' => true, 'tekrar' => true]);
        exit;
    }
}

// yüklenen görsel VEYA video (base64) -> dosya
$imgNote = '';
if (!empty($d['image_base64']) && preg_match('#^data:(image|video)/([\w.+-]+);base64,(.+)$#', $d['image_base64'], $m)) {
    $kind = $m[1];                          // image | video
    $subtype = strtolower($m[2]);           // jpeg, png, mp4, quicktime, webm...
    $bin = base64_decode($m[3]);
    // görsel 8 MB, video 30 MB sınır
    $limit = ($kind === 'video') ? 30 * 1024 * 1024 : 8 * 1024 * 1024;
    if ($bin !== false && strlen($bin) < $limit) {
        // mime alt-türünü dosya uzantısına çevir
        $EXT = ['jpeg' => 'jpg', 'quicktime' => 'mov', 'x-msvideo' => 'avi', 'x-matroska' => 'mkv'];
        $ext = $EXT[$subtype] ?? preg_replace('/[^a-z0-9]/', '', $subtype) ?: ($kind === 'video' ? 'mp4' : 'jpg');
        $fn = date('Ymd-His') . '-' . substr(md5($raw), 0, 6) . '.' . $ext;
        @file_put_contents("$dir/uploads/$fn", $bin);
        $imgNote = $fn;
    }
}
// multipart ile gelen ham video → uploads/ (base64 yolundakiyle aynı adlandırma)
if ($videoUp !== null && $imgNote === '') {
    $VEXT = ['video/mp4' => 'mp4', 'video/quicktime' => 'mov', 'video/webm' => 'webm', 'video/x-msvideo' => 'avi', 'video/x-matroska' => 'mkv', 'video/3gpp' => '3gp'];
    $mime = strtolower((string)($videoUp['type'] ?? ''));
    $ext = $VEXT[$mime] ?? strtolower(pathinfo((string)($videoUp['name'] ?? ''), PATHINFO_EXTENSION));
    $ext = preg_replace('/[^a-z0-9]/', '', $ext) ?: 'mp4';
    if ((int)$videoUp['size'] > 0 && (int)$videoUp['size'] < 30 * 1024 * 1024 && in_array($ext, ['mp4', 'mov', 'webm', 'avi', 'mkv', '3gp'], true)) {
        $fn = date('Ymd-His') . '-' . substr(md5($raw . $videoUp['name']), 0, 6) . '.' . $ext;
        if (@move_uploaded_file($videoUp['tmp_name'], "$dir/uploads/$fn")) { $imgNote = $fn; }
    }
}
$products = '';
if (!empty($d['selected_products']) && is_array($d['selected_products'])) {
    $products = implode(', ', array_map(function ($p) {
        // renk sayisi kampanya paketinin kombinasyon hesabina girer; teklifte gorunmeli
        $r = isset($p['renk']) ? (int)$p['renk'] : 0;
        return trim(($p['code'] ?? '') . ' ' . ($p['name'] ?? '')) . ($r > 0 ? " ({$r} renk)" : '');
    }, $d['selected_products']));
}

// Kampanya paketi (mini/imza/seri) — /kampanya/ uzerinden gelen taleplerde dolu gelir.
$PAKET_AD = ['mini' => 'Mini', 'imza' => 'Imza', 'seri' => 'Seri'];
$paketKod = $clean($d['paket'] ?? '');
$paket = $PAKET_AD[$paketKod] ?? '';

// Kaynak takibi (lp-assets/kaynak-takip.js): trafigin geldigi kanal.
// `source` formun YERI, `kaynak` trafigin NEREDEN geldigi — ikisi karistirilmamali.
// Beyaz liste: istemciden gelen serbest alan, JSONL satirini sismekten korur.
// `vid` ziyaret kaydiyla lead'i eslestirir — donusum orani bu alandan hesaplanir.
$KAYNAK_ALAN = ['kanal', 'ilk_kanal', 'utm_source', 'utm_medium', 'utm_campaign',
                'utm_term', 'utm_content', 'gclid', 'fbclid', 'ttclid', 'msclkid',
                'referrer', 'giris_sayfasi', 'ilk_ts', 'son_ts', 'vid'];
$kaynak = [];
if (!empty($d['kaynak']) && is_array($d['kaynak'])) {
    foreach ($KAYNAK_ALAN as $k) {
        $v = $clean($d['kaynak'][$k] ?? '');
        if ($v !== '') { $kaynak[$k] = $v; }
    }
}
if (!isset($kaynak['kanal'])) { $kaynak['kanal'] = 'bilinmiyor'; }

$rec = ['ts' => date('c'), 'name' => $name, 'city' => $city, 'phone' => $phone, 'email' => $email,
        'mode' => $mode, 'source' => $source, 'note' => $note, 'products' => $products, 'image' => $imgNote,
        'paket' => $paket,
        'kaynak' => $kaynak,
        'istek_id' => $istekId,
        // İki aşamalı gönderim: video ayrı istekte gelecek (uploads/<istek_id>.<ext>)
        'video_bekleniyor' => !empty($d['video_bekleniyor']),
        // Teslim ayrıntısı (teklif-kasasi.js): teklif cihazda bekleyip geç düştüyse NEDEN.
        // Sıkı süzgeç: sayı alanları int, metinler kısa ve harf/rakam.
        'teslim' => (function ($t) {
            if (!is_array($t)) return null;
            $m = static fn($k) => mb_substr(preg_replace('/[^A-Za-z0-9_.-]/', '', (string)($t[$k] ?? '')), 0, 24);
            return ['gecikme_sn' => (int)($t['gecikme_sn'] ?? 0), 'deneme' => (int)($t['deneme'] ?? 0),
                    'ilk_hata' => $m('ilk_hata'), 'ilk_kod' => (int)($t['ilk_kod'] ?? 0),
                    'son_hata' => $m('son_hata'), 'son_kod' => (int)($t['son_kod'] ?? 0),
                    'tetik' => $m('tetik'), 'baglanti' => $m('baglanti'), 'cevrimici' => !empty($t['cevrimici']),
                    'depo' => $m('depo'), 'video_kayip' => !empty($t['video_kayip'])];
        })($d['teslim'] ?? null),
        // PostHog kimliği (oturum kaydına giden köprü); biçim sıkı, serbest metin değil
        'posthog_id' => preg_match('/^[A-Za-z0-9_:.-]{6,64}$/', (string)($d['posthog_id'] ?? '')) ? (string)$d['posthog_id'] : '',
        'ip' => $_SERVER['REMOTE_ADDR'] ?? ''];
@file_put_contents("$dir/leads.jsonl", json_encode($rec, JSON_UNESCAPED_UNICODE) . "\n", FILE_APPEND | LOCK_EX);
// Panel push bildirimi (yeni teklif / geç teslim) — yanıt gönderildikten sonra, mail'den önce
$BILDIR_REC = $rec;
$lead_log('ok', $istekId, ['mode' => $mode, 'dosya' => $imgNote,
    'gecikme_sn' => (int)($rec['teslim']['gecikme_sn'] ?? 0), 'tetik' => (string)($rec['teslim']['tetik'] ?? '')]);

// ---- Yanıtı HEMEN döndür, ağır işleri sonra yap ----
// Ölçüm (13 Eyl): mail (Exim, 4 varyanta kadar) + Supabase forward (6 sn timeout)
// SIRAYLA ve yanıttan ÖNCE çalışıyordu → kullanıcı 3,8-5,0 sn bekliyordu.
// Artık kullanıcı yalnızca dosyaya yazmayı bekler (<100 ms); geri kalanı
// bağlantı kapandıktan sonra sürer.
lead_finish(['ok' => true]);

// Panel push (bedava, bilgi amaçlı; cihaz tercihine bağlı) + geç teslim uyarısı
try { require_once __DIR__ . '/panel/bildir.php'; bildir_yeni_teklif($BILDIR_REC); } catch (Throwable $e) { @file_put_contents("$dir/bildir.log", date('c') . " HATA " . $e->getMessage() . "\n", FILE_APPEND); }
// WhatsApp bildirimi (Twilio şablonu, panelde yönetilen alıcı listesine tek tek) — bkz. panel/wa_bildirim.php
try { require_once __DIR__ . '/panel/wa_bildirim.php'; wa_bildirim_yeni_teklif($BILDIR_REC); } catch (Throwable $e) { @file_put_contents("$dir/bildir.log", date('c') . " WA HATA " . $e->getMessage() . "\n", FILE_APPEND); }

// e-posta bildirimi — basarisizsa kuyruga alinir, mail-retry.php tekrar dener
$mailErr = null;
if (!lead_send_mail($rec, $mailErr)) {
    lead_queue_push($rec, (string)$mailErr);
}

// best-effort: Supabase edge fn'e ilet (kisit kalkinca CRM'e dusr)
if (function_exists('curl_init')) {
    $SUPA = 'https://imobvzcddkhqgvkvjhir.supabase.co/functions/v1/landing-submit-lead';
    $KEY = '__STUDIO_ANON_KEY__';
    // Edge fn not alanini `notes` diye okuyor, frontend `note` gonderiyordu; ikisini de yolla.
    $fwd = $d;
    $fwd['notes'] = $note;
    $ch = curl_init($SUPA);
    curl_setopt_array($ch, [CURLOPT_POST => true, CURLOPT_POSTFIELDS => json_encode($fwd, JSON_UNESCAPED_UNICODE),
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 6, CURLOPT_HTTPHEADER => ['Content-Type: application/json', "apikey: $KEY", "Authorization: Bearer $KEY"]]);
    // curl_close() PHP 8.0'dan beri etkisiz, 8.5'te deprecated (uyarı JSON'a sızıyordu) — çağrılmıyor
    $resp = curl_exec($ch); $code = curl_getinfo($ch, CURLINFO_HTTP_CODE); unset($ch);
    // Edge fn, Postmark/WhatsApp bildirimi basarisiz olsa da 200 donuyor (allSettled).
    // Gercek bildirim durumu yanit govdesinde — her zaman logla, yoksa sessizce kayboluyor.
    @file_put_contents("$dir/supabase_response.log",
        date('c') . " code=$code " . trim(mb_substr((string)$resp, 0, 600)) . "\n", FILE_APPEND);
    if ($code < 200 || $code >= 300) {
        // Yanit govdesi de loglanir: "Eksik/gecersiz: ..." gibi dogrulama hatalari gorunur olsun.
        @file_put_contents("$dir/supabase_failed.log",
            date('c') . " code=$code " . trim(mb_substr((string)$resp, 0, 300)) . "\n", FILE_APPEND);
    }
}

// ============================================================
// CRM'e talep ilet (best-effort, Studio ile PARALEL) — 21 Eyl 2026'da geri eklendi.
// 8 Eyl–21 Eyl arası bu blok yoktu; o aralık scripts/talep-geri-yukleme ile CRM'e alındı.
// Sır web kökü DIŞINDA: ../leads_private/crm_intake.php (eşi Supabase secrets INTAKE_SECRET).
// client_reference = <ts>-<sha1(tel)[0:8]> → CRM tarafında idempotent (tekrar gönderim kopya üretmez).
// ============================================================
try {
    $crmCfg = @include __DIR__ . '/../leads_private/crm_intake.php';
    $CRM_SECRET = is_array($crmCfg) ? (string)($crmCfg['secret'] ?? '') : '';
    if ($CRM_SECRET !== '' && function_exists('curl_init')) {
        $CRM_URL = 'https://kkxvoxeqfsaqzklrtgrw.supabase.co/functions/v1/intake-request';
        $client_reference = $rec['ts'] . '-' . substr(sha1($rec['phone']), 0, 8);

        // Yalnız GÖRSEL base64 ile gider (≤ 8 MB); video CRM'e gitmez, sunucuda kalır.
        $crmNote = $note;
        $image_base64 = null;
        $b64 = $d['image_base64'] ?? null;
        if (is_string($b64) && strpos($b64, 'data:image/') === 0 && strlen($b64) <= 8 * 1024 * 1024) {
            $image_base64 = $b64;
        } elseif ($imgNote !== '') {
            $crmNote = trim($crmNote . ' [Ek CRM\'ye gönderilmedi; sunucuda: leads_private/uploads/' . $imgNote . ']');
        }

        $payload = [
            'client_reference'  => $client_reference,
            'full_name'         => $name,
            'city'              => $city,
            'phone'             => $rec['phone'],
            'email'             => $email,
            'mode'              => $mode,
            'source'            => $source,
            'note'              => $crmNote,
            'selected_products' => (!empty($d['selected_products']) && is_array($d['selected_products'])) ? $d['selected_products'] : [],
            'image_base64'      => $image_base64,
            // Pazarlama kaynağı (kaynak-takip.js): kanal, utm_*, gclid/fbclid/ttclid, referrer, vid — rapor için
            'kaynak'            => $kaynak,
        ];
        $ch = curl_init($CRM_URL);
        curl_setopt_array($ch, [
            CURLOPT_POST => true, CURLOPT_POSTFIELDS => json_encode($payload, JSON_UNESCAPED_UNICODE),
            CURLOPT_HTTPHEADER => ['Content-Type: application/json', 'X-Intake-Secret: ' . $CRM_SECRET],
            CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 20, CURLOPT_CONNECTTIMEOUT => 5,
        ]);
        $resp = curl_exec($ch); $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE); $err = curl_error($ch); unset($ch);
        $line = date('c') . ' | ref=' . $client_reference . ' | HTTP ' . $code . ' | ' . ($resp !== false ? trim(mb_substr((string)$resp, 0, 400)) : $err) . "\n";
        @file_put_contents(__DIR__ . ($code >= 200 && $code < 300 ? '/crm_response.log' : '/crm_failed.log'), $line, FILE_APPEND);
    } else {
        @file_put_contents(__DIR__ . '/crm_failed.log', date('c') . " | CONFIG | crm_intake.php okunamadı\n", FILE_APPEND);
    }
} catch (\Throwable $e) {
    @file_put_contents(__DIR__ . '/crm_failed.log', date('c') . ' | EXCEPTION | ' . $e->getMessage() . "\n", FILE_APPEND);
}

// Bekleyen mailleri de dene (cron yoksa da kuyruk ilerlesin).
lead_queue_process();
