<?php
/**
 * save_css.php — Accepts a POST request with CSS selectors for a site
 * and saves them to defaultcss.json.
 * 
 * POST parameters:
 *   hostname    (required) — The site hostname (e.g. "example.com")
 *   contentCss  (required) — CSS selector for the content element
 *   titleCss    (optional) — CSS selector for the chapter title
 *   removeCss   (optional) — CSS selector for elements to remove
 * 
 * Usage:
 *   curl -X POST http://your-server.com/save_css.php \
 *     -d "hostname=example.com" \
 *     -d "contentCss=div.chapter-content" \
 *     -d "titleCss=h1.title" \
 *     -d "removeCss=.ads, .nav"
 */

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

// Handle CORS preflight
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Only POST requests are accepted']);
    exit;
}

$hostname = isset($_POST['hostname']) ? trim($_POST['hostname']) : '';
$contentCss = isset($_POST['contentCss']) ? trim($_POST['contentCss']) : '';
$titleCss = isset($_POST['titleCss']) ? trim($_POST['titleCss']) : '';
$removeCss = isset($_POST['removeCss']) ? trim($_POST['removeCss']) : '';

// Validate required fields
if (empty($hostname)) {
    http_response_code(400);
    echo json_encode(['error' => 'hostname is required']);
    exit;
}
if (empty($contentCss)) {
    http_response_code(400);
    echo json_encode(['error' => 'contentCss is required']);
    exit;
}

// Basic sanitization: strip HTML tags from all inputs
$hostname = strip_tags($hostname);
$contentCss = strip_tags($contentCss);
$titleCss = strip_tags($titleCss);
$removeCss = strip_tags($removeCss);

// Load existing JSON file or create empty object
$jsonFile = __DIR__ . '/defaultcss.json';
$data = ['last_updated' => time(), 'configs' => []];
if (file_exists($jsonFile)) {
    $raw = file_get_contents($jsonFile);
    $parsed = json_decode($raw, true);
    if (is_array($parsed) && isset($parsed['configs'])) {
        $data = $parsed;
    }
}

// Update global timestamp and add/overwrite the entry for this hostname
$data['last_updated'] = time();
$data['configs'][$hostname] = [
    'contentCss' => $contentCss,
    'titleCss' => $titleCss,
    'removeCss' => $removeCss
];

// Save back to JSON file
$result = file_put_contents($jsonFile, json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES));
if ($result === false) {
    http_response_code(500);
    echo json_encode(['error' => 'Failed to write to file']);
    exit;
}

http_response_code(200);
echo json_encode([
    'success' => true,
    'message' => "Config saved for '$hostname'",
    'data' => $data[$hostname]
]);
