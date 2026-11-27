<?php
// push/subscribe.php — Web-Push-Abos der PWA verwalten (Netcup-Webspace, kein Framework, keine Datenbank).
//
// POST (JSON)  { "endpoint": "https://…", "keys": { "p256dh": "…", "auth": "…" }, "favorites": [12, 40], "lang": "de" }
//              → Abo anlegen bzw. Favoriten/Sprache aktualisieren
// POST (JSON)  { "endpoint": "https://…", "unsubscribe": true }  → Abo samt Merkliste löschen
//
// Gespeichert wird je Abo eine Datei data/<sha256(endpoint)>.json (Endpoint, Schlüssel, Favoriten-IDs, Sprache, Zeitstempel) —
// keine Namen, keine E-Mail, kein Konto. data/ ist per .htaccess für das Web gesperrt; der Versand (GitHub Actions, tools/send-push.js)
// liest die Dateien per FTPS. Die Merkliste „schon gemeldet“ (data/<id>.sent.json) schreibt NUR der Versand, nie dieses Skript.

declare(strict_types=1);

const DATA_DIR   = __DIR__ . '/data';
const MAX_SUBS   = 20000;
const MAX_FAVS   = 300;
const MAX_BODY   = 8192;
const ALLOWED_ORIGINS = ['https://makerspac.es', 'https://www.makerspac.es'];
const LANGS      = ['de', 'en', 'fr', 'it', 'nl', 'da', 'uk'];
// Nur echte Push-Dienste der Browser (verhindert, dass das Skript als Relay für beliebige URLs missbraucht wird)
const PUSH_HOST_PATTERNS = [
    '/^fcm\.googleapis\.com$/', '/^android\.googleapis\.com$/', '/^updates\.push\.services\.mozilla\.com$/',
    '/^[a-z0-9.-]*\.push\.apple\.com$/', '/^web\.push\.apple\.com$/', '/^[a-z0-9.-]*\.notify\.windows\.com$/',
    '/^[a-z0-9.-]*\.push\.services\.mozilla\.com$/',
];

function reply(int $status, array $body): never {
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode($body);
    exit;
}

function validEndpoint(string $endpoint): bool {
    if (strlen($endpoint) > 1024 || !preg_match('#^https://#', $endpoint)) return false;
    $host = parse_url($endpoint, PHP_URL_HOST);
    if (!is_string($host)) return false;
    foreach (PUSH_HOST_PATTERNS as $re) if (preg_match($re, strtolower($host))) return true;
    return false;
}

function validKey(mixed $k, int $min, int $max): bool {
    return is_string($k) && strlen($k) >= $min && strlen($k) <= $max && preg_match('/^[A-Za-z0-9_-]+$/', $k) === 1;
}

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') reply(405, ['error' => 'POST only']);
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if ($origin !== '' && !in_array($origin, ALLOWED_ORIGINS, true)) reply(403, ['error' => 'origin']);

$raw = file_get_contents('php://input', false, null, 0, MAX_BODY + 1);
if ($raw === false || strlen($raw) > MAX_BODY) reply(413, ['error' => 'too large']);
$in = json_decode($raw, true);
if (!is_array($in) || !isset($in['endpoint']) || !is_string($in['endpoint']) || !validEndpoint($in['endpoint'])) reply(400, ['error' => 'endpoint']);

$id   = hash('sha256', $in['endpoint']);
$file = DATA_DIR . "/$id.json";

if (!is_dir(DATA_DIR) && !mkdir(DATA_DIR, 0750, true)) reply(500, ['error' => 'storage']);

if (!empty($in['unsubscribe'])) {
    foreach ([$file, DATA_DIR . "/$id.sent.json"] as $f) if (is_file($f)) unlink($f);
    reply(200, ['ok' => true, 'subscribed' => false]);
}

$keys = $in['keys'] ?? null;
if (!is_array($keys) || !validKey($keys['p256dh'] ?? null, 80, 100) || !validKey($keys['auth'] ?? null, 20, 30)) reply(400, ['error' => 'keys']);

$favs = [];
foreach (is_array($in['favorites'] ?? null) ? $in['favorites'] : [] as $v) {
    if (is_int($v) && $v > 0 && $v < 1000000) $favs[$v] = $v;
    if (count($favs) >= MAX_FAVS) break;
}
$lang = in_array($in['lang'] ?? '', LANGS, true) ? $in['lang'] : 'en';

$isNew = !is_file($file);
if ($isNew && count(glob(DATA_DIR . '/*.json') ?: []) >= MAX_SUBS * 2) reply(503, ['error' => 'full']);   // *.json zählt auch *.sent.json

$old = $isNew ? [] : (json_decode((string)file_get_contents($file), true) ?: []);
$record = [
    'endpoint'  => $in['endpoint'],
    'keys'      => ['p256dh' => $keys['p256dh'], 'auth' => $keys['auth']],
    'favorites' => array_values($favs),
    'lang'      => $lang,
    'created'   => $old['created'] ?? gmdate('c'),
    'updated'   => gmdate('c'),
];
$tmp = "$file.tmp" . bin2hex(random_bytes(4));
if (file_put_contents($tmp, json_encode($record), LOCK_EX) === false || !rename($tmp, $file)) reply(500, ['error' => 'write']);
reply(200, ['ok' => true, 'subscribed' => true, 'favorites' => count($favs)]);
