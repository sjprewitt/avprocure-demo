<?php
declare(strict_types=1);

// ── Session ───────────────────────────────────────────────────────────────────

function auth_session_start(): void {
    if (session_status() === PHP_SESSION_ACTIVE) return;
    session_name('avpsid');
    ini_set('session.cookie_secure',   '1');
    ini_set('session.cookie_httponly', '1');
    ini_set('session.cookie_samesite', 'Strict');
    ini_set('session.use_strict_mode', '1');
    ini_set('session.gc_maxlifetime',  '28800');
    ini_set('session.cookie_lifetime', '0');
    ini_set('session.cookie_path',     '/avprocure/');
    session_start();
}

function auth_check(): bool {
    return isset($_SESSION['user_id']) && (int)$_SESSION['user_id'] > 0;
}

// ── Database ──────────────────────────────────────────────────────────────────

function auth_db(): SQLite3 {
    static $db = null;
    if ($db !== null) return $db;
    // DB lives outside the web root — see DB_PATH note in api.php.
    $db = new SQLite3(dirname(__DIR__) . '/avprocure-data/avprocure.db');
    $db->enableExceptions(true);
    $db->busyTimeout(5000);
    $db->exec('PRAGMA journal_mode=WAL');
    return $db;
}

// ── Logging ───────────────────────────────────────────────────────────────────

function auth_get_ip(): string {
    $remote = $_SERVER['REMOTE_ADDR'] ?? '';
    $trusted = ['127.0.0.1', '::1'];
    if (in_array($remote, $trusted, true)) {
        $xff   = $_SERVER['HTTP_X_FORWARDED_FOR'] ?? '';
        $first = trim(explode(',', $xff)[0]);
        if ($xff !== '' && filter_var($first, FILTER_VALIDATE_IP)) return $first;
    }
    return $remote;
}

function auth_log(string $username, bool $success, string $note = ''): void {
    $db   = auth_db();
    $stmt = $db->prepare(
        'INSERT INTO access_log (username, ip, xff, user_agent, success, note)
         VALUES (:u, :ip, :xff, :ua, :s, :n)'
    );
    $stmt->bindValue(':u',   $username,                                   SQLITE3_TEXT);
    $stmt->bindValue(':ip',  $_SERVER['REMOTE_ADDR'] ?? '',               SQLITE3_TEXT);
    $stmt->bindValue(':xff', $_SERVER['HTTP_X_FORWARDED_FOR'] ?? '',      SQLITE3_TEXT);
    $stmt->bindValue(':ua',  $_SERVER['HTTP_USER_AGENT'] ?? '',           SQLITE3_TEXT);
    $stmt->bindValue(':s',   $success ? 1 : 0,                           SQLITE3_INTEGER);
    $stmt->bindValue(':n',   $note,                                       SQLITE3_TEXT);
    $stmt->execute();
}

// ── Rate limiting ───────────────────────────────────────────────────────────

// Returns true when this IP has had too many recent failed login attempts and
// should be temporarily locked out. Counts only credential failures within the
// rolling window so a lockout naturally expires once attempts age out.
function auth_login_locked_out(string $ip, int $window_seconds = 900, int $max_failures = 5): bool {
    if ($ip === '') return false;
    $db   = auth_db();
    $stmt = $db->prepare(
        "SELECT COUNT(*) FROM access_log
          WHERE ip = :ip AND success = 0
            AND note IN ('wrong_password', 'user_not_found', 'account_disabled')
            AND ts >= datetime('now', 'utc', :win)"
    );
    $stmt->bindValue(':ip',  $ip, SQLITE3_TEXT);
    $stmt->bindValue(':win', '-' . $window_seconds . ' seconds', SQLITE3_TEXT);
    $count = (int)$stmt->execute()->fetchArray(SQLITE3_NUM)[0];
    return $count >= $max_failures;
}

// ── Bootstrap ─────────────────────────────────────────────────────────────────

function auth_seed(): void {
    $db = auth_db();

    $db->exec("CREATE TABLE IF NOT EXISTS users (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        username      TEXT    NOT NULL UNIQUE COLLATE NOCASE,
        password_hash TEXT    NOT NULL,
        is_admin      INTEGER NOT NULL DEFAULT 0,
        is_active     INTEGER NOT NULL DEFAULT 1,
        created_at    TEXT    NOT NULL DEFAULT (datetime('now','utc')),
        last_login    TEXT
    )");

    $db->exec("CREATE TABLE IF NOT EXISTS access_log (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        ts         TEXT    NOT NULL DEFAULT (datetime('now','utc')),
        username   TEXT    NOT NULL,
        ip         TEXT,
        xff        TEXT,
        user_agent TEXT,
        success    INTEGER NOT NULL DEFAULT 0,
        note       TEXT
    )");

    if ((int)$db->querySingle('SELECT COUNT(*) FROM users') === 0) {
        error_log('AVProcure: users table is empty — create an admin account directly in the database.');
    }
}
