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

$raw = file_get_contents('php://input');
$d = json_decode($raw, true);
if (!is_array($d)) { http_response_code(400); echo json_encode(['error' => 'bad_json']); exit; }

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
if ($name === '' || $phone === '') { http_response_code(422); echo json_encode(['error' => 'eksik_alan']); exit; }

$dir = __DIR__ . '/../leads_private';
@mkdir($dir, 0700, true);
@mkdir("$dir/uploads", 0700, true);

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
$products = '';
if (!empty($d['selected_products']) && is_array($d['selected_products'])) {
    $products = implode(', ', array_map(function ($p) {
        return trim(($p['code'] ?? '') . ' ' . ($p['name'] ?? ''));
    }, $d['selected_products']));
}

$rec = ['ts' => date('c'), 'name' => $name, 'city' => $city, 'phone' => $phone, 'email' => $email,
        'mode' => $mode, 'source' => $source, 'note' => $note, 'products' => $products, 'image' => $imgNote,
        'ip' => $_SERVER['REMOTE_ADDR'] ?? ''];
@file_put_contents("$dir/leads.jsonl", json_encode($rec, JSON_UNESCAPED_UNICODE) . "\n", FILE_APPEND | LOCK_EX);

// e-posta bildirimi — basarisizsa kuyruga alinir, mail-retry.php tekrar dener
$mailErr = null;
if (!lead_send_mail($rec, $mailErr)) {
    lead_queue_push($rec, (string)$mailErr);
}

// ── Studio (uretimCrm) iletimi — 31 Ağustos 2026'da KAPATILDI ──────────────
// Sebep: aynı talep iki CRM'e düşünce iki kişi ayrı ayrı arıyor, iki teklif çıkıyor
// ve hangisinin gerçek olduğu belirsizleşiyordu. Giriş kapısı artık yalnız yeniCrm
// (aşağıdaki intake-request bloğu). Studio kapatılmadı, yalnız YENİ talep almıyor;
// geçmiş verisi yerinde ve okunabilir durumda.
// Geri açmak gerekirse: STUDIO_FORWARD'ı true yap.
$STUDIO_FORWARD = false;
if ($STUDIO_FORWARD && function_exists('curl_init')) {
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

echo json_encode(['ok' => true]);

// Yanit gonderildikten sonra bekleyen mailleri dene (cron yoksa da kuyruk ilerlesin).
if (function_exists('fastcgi_finish_request')) { fastcgi_finish_request(); }
lead_queue_process();


// ============================================================
// CRM'e talep ilet (best-effort) — mevcut akışa DOKUNMAZ.
// ============================================================
try {
    $CRM_URL    = 'https://kkxvoxeqfsaqzklrtgrw.supabase.co/functions/v1/intake-request';
    $CRM_SECRET = '__INTAKE_SECRET__';

    $phone = $rec['phone'] ?? '';
    $client_reference = ($rec['ts'] ?? time()) . '-' . substr(sha1($phone), 0, 8);

    $note = $rec['note'] ?? null;
    $image_base64 = null;
    $b64 = $d['image_base64'] ?? null;
    if ($b64 !== null && strlen($b64) <= 8 * 1024 * 1024) {
        $image_base64 = $b64;
    } elseif ($b64 !== null) {
        $note = trim(($note ?? '') . ' [Büyük ek CRM ye gönderilmedi; sunucuda: leads_private/uploads/' . ($imgNote ?? '') . ']');
    }

    $payload = [
        'client_reference'  => $client_reference,
        'full_name'         => $rec['name'] ?? null,
        'city'              => $rec['city'] ?? null,
        'phone'             => $phone,
        'email'             => $rec['email'] ?? null,
        'mode'              => $rec['mode'] ?? null,
        'source'            => $rec['source'] ?? null,
        'note'              => $note,
        'selected_products' => $d['selected_products'] ?? [],
        'image_base64'      => $image_base64,
    ];

    $ch = curl_init($CRM_URL);
    curl_setopt_array($ch, [
        CURLOPT_POST           => true,
        CURLOPT_POSTFIELDS     => json_encode($payload, JSON_UNESCAPED_UNICODE),
        CURLOPT_HTTPHEADER     => [
            'Content-Type: application/json',
            'X-Intake-Secret: ' . $CRM_SECRET,
        ],
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT        => 6,
        CURLOPT_CONNECTTIMEOUT => 4,
    ]);
    $resp = curl_exec($ch);
    $code = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $err  = curl_error($ch);

    $line = date('c') . ' | ref=' . $client_reference . ' | HTTP ' . $code . ' | ' . ($resp !== false ? $resp : $err) . "\n";
    if ($code >= 200 && $code < 300) {
        @file_put_contents(__DIR__ . '/crm_response.log', $line, FILE_APPEND);
    } else {
        @file_put_contents(__DIR__ . '/crm_failed.log', $line, FILE_APPEND);
    }
} catch (\Throwable $e) {
    @file_put_contents(__DIR__ . '/crm_failed.log', date('c') . ' | EXCEPTION | ' . $e->getMessage() . "\n", FILE_APPEND);
}