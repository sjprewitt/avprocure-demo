<?php
// export-db.php — streams a data-only copy of the SQLite database as a download.
// ADMIN ONLY. The users / access_log tables (password hashes) are stripped so no
// auth secrets ever leave in the file — this is a data export, not a full backup.

require_once __DIR__ . '/auth.php';
auth_session_start();

if (!auth_check() || empty($_SESSION['is_admin'])) {
    http_response_code(403);
    header('Content-Type: text/plain');
    exit("Admin access required.\n");
}

$src = dirname(__DIR__) . '/avprocure-data/avprocure.db';
if (!is_readable($src)) {
    http_response_code(500);
    header('Content-Type: text/plain');
    exit("Database not found.\n");
}

$tmp = tempnam(sys_get_temp_dir(), 'avpdb');
@unlink($tmp); // VACUUM INTO requires the target file to not already exist

try {
    // Consistent snapshot (WAL-safe) via VACUUM INTO.
    $db = new SQLite3($src);
    $db->busyTimeout(8000);
    $db->exec("VACUUM INTO '" . SQLite3::escapeString($tmp) . "'");
    $db->close();

    // Strip auth tables from the copy, then compact.
    $t = new SQLite3($tmp);
    $t->exec('DROP TABLE IF EXISTS users');
    $t->exec('DROP TABLE IF EXISTS access_log');
    $t->exec('VACUUM');
    $t->close();
} catch (Exception $e) {
    if (file_exists($tmp)) @unlink($tmp);
    error_log('export-db failed: ' . $e->getMessage());
    http_response_code(500);
    header('Content-Type: text/plain');
    exit("Export failed. See server logs.\n");
}

$fname = 'avprocure-' . date('Y-m-d') . '.db';
header('Content-Type: application/octet-stream');
header('Content-Disposition: attachment; filename="' . $fname . '"');
header('Content-Length: ' . filesize($tmp));
header('Cache-Control: no-store');
readfile($tmp);
@unlink($tmp);
