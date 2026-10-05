<?php
require_once __DIR__ . '/auth.php';
auth_session_start();
if (!auth_check()) { http_response_code(401); echo json_encode(['error' => 'Unauthorized']); exit; }

header('Content-Type: application/json');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
    exit;
}

$b64 = file_get_contents('php://input');
if (!$b64) {
    http_response_code(400);
    echo json_encode(['error' => 'No data received']);
    exit;
}

$xlsx = base64_decode($b64, true);
if ($xlsx === false || substr($xlsx, 0, 2) !== 'PK') {
    http_response_code(400);
    echo json_encode(['error' => 'Invalid xlsx data']);
    exit;
}

$target = __DIR__ . '/avprocure-export.xlsx';
$tmp    = $target . '.tmp';

if (file_put_contents($tmp, $xlsx) === false) {
    http_response_code(500);
    echo json_encode(['error' => 'Write failed']);
    exit;
}

if (!rename($tmp, $target)) {
    unlink($tmp);
    http_response_code(500);
    echo json_encode(['error' => 'Rename failed']);
    exit;
}

echo json_encode(['ok' => true, 'bytes' => strlen($xlsx)]);
