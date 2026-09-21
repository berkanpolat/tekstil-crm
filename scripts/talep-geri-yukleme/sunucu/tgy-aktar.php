<?php
// TEK SEFERLİK — leads_private/uploads/ altındaki görselleri sunucudan doğrudan
// R2 dosya servisine (Cloudflare Worker) PUT eder. İş bitince SİLİNİR.
// POST JSON: { token, servis_url, servis_sirri, dosyalar: [{ad, yol}] }
// Yanıt:     { ok, sonuc: [{ad, ok, size, sha256, mime, hata?}] }
// Sır sunucuda TUTULMAZ; her çağrıda gövdeyle gelir (HTTPS).
header('Content-Type: application/json');
$TOKEN = '__TGY_TOKEN__';
$d = json_decode(file_get_contents('php://input'), true);
if (!is_array($d) || !hash_equals($TOKEN, (string)($d['token'] ?? ''))) { http_response_code(403); echo json_encode(['error' => 'forbidden']); exit; }
$dir = realpath(__DIR__ . '/../leads_private/uploads');
$url = rtrim((string)($d['servis_url'] ?? ''), '/'); $sir = (string)($d['servis_sirri'] ?? '');
$MIME = ['jpg' => 'image/jpeg', 'jpeg' => 'image/jpeg', 'png' => 'image/png', 'webp' => 'image/webp', 'gif' => 'image/gif', 'heic' => 'image/heic', 'heif' => 'image/heif', 'avif' => 'image/avif', 'mp4' => 'video/mp4', 'mov' => 'video/quicktime', 'pdf' => 'application/pdf'];
set_time_limit(300);
$out = [];
foreach (($d['dosyalar'] ?? []) as $f) {
    $ad = basename((string)($f['ad'] ?? '')); $yol = (string)($f['yol'] ?? '');
    $p = "$dir/$ad";
    if ($ad === '' || $yol === '' || !is_file($p)) { $out[] = ['ad' => $ad, 'ok' => false, 'hata' => 'yok']; continue; }
    $ext = strtolower(pathinfo($ad, PATHINFO_EXTENSION)); $mime = $MIME[$ext] ?? 'application/octet-stream';
    $size = filesize($p);
    $ch = curl_init("$url/y?yol=" . rawurlencode($yol));
    curl_setopt_array($ch, [
        CURLOPT_CUSTOMREQUEST => 'PUT', CURLOPT_UPLOAD => true, CURLOPT_INFILE => fopen($p, 'rb'), CURLOPT_INFILESIZE => $size,
        CURLOPT_HTTPHEADER => ["Content-Type: $mime", "x-servis-sirri: $sir"], CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 120,
    ]);
    $r = curl_exec($ch); $code = curl_getinfo($ch, CURLINFO_HTTP_CODE); $err = curl_error($ch); curl_close($ch);
    $out[] = ['ad' => $ad, 'ok' => $code >= 200 && $code < 300, 'http' => $code, 'size' => $size, 'sha256' => hash_file('sha256', $p), 'mime' => $mime, 'hata' => $err ?: null];
}
echo json_encode(['ok' => true, 'sonuc' => $out], JSON_UNESCAPED_UNICODE);
