<?php
/**
 * migrate-vendors.php — one-time backfill promoting the free-text `vendor` field on
 * orders / vendor_bills / rmas into first-class `vendors` records, linked by vendorId.
 * See Step 2 of the QBO roadmap. IDEMPOTENT and CLI-ONLY.
 *
 * Usage:
 *   php migrate-vendors.php                 # migrate the live DB (auto-snapshots first)
 *   php migrate-vendors.php --dry-run       # show what WOULD change, write nothing
 *   php migrate-vendors.php /path/to.db     # target a specific DB file
 *   php migrate-vendors.php --no-snapshot   # skip the VACUUM INTO snapshot
 *
 * One vendor record is created per distinct (case-insensitive) name found across the
 * three tables; each row's vendorId is set to the matching vendor. Near-duplicates
 * (e.g. "Harman" vs "Harman International") are kept separate — merge them later in the UI.
 */

if (PHP_SAPI !== 'cli') { http_response_code(403); header('Content-Type: text/plain'); exit("CLI only.\n"); }

$DB     = (isset($argv[1]) && !str_starts_with($argv[1], '--')) ? $argv[1] : (dirname(__DIR__) . '/avprocure-data/avprocure.db');
$DRY    = in_array('--dry-run', $argv, true);
$NOSNAP = in_array('--no-snapshot', $argv, true);
if (!file_exists($DB)) { fwrite(STDERR, "DB not found: $DB\n"); exit(1); }
echo "Target DB: $DB" . ($DRY ? "  [DRY RUN]" : "") . "\n";

$db = new SQLite3($DB);
$db->enableExceptions(true);
$db->busyTimeout(8000);
$db->exec('PRAGMA journal_mode=WAL');

function nid(): string { return bin2hex(random_bytes(9)); }

// ── 1. Ensure schema (idempotent; mirrors api.php) ──
$db->exec('CREATE TABLE IF NOT EXISTS vendors (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, contactName TEXT, email TEXT, phone TEXT,
    website TEXT, street TEXT, city TEXT, state TEXT, zip TEXT, terms TEXT,
    accountNumber TEXT, notes TEXT, qbId TEXT, qbSyncToken TEXT)');
foreach ([
    'ALTER TABLE orders       ADD COLUMN vendorId TEXT',
    'ALTER TABLE vendor_bills ADD COLUMN vendorId TEXT',
    'ALTER TABLE rmas         ADD COLUMN vendorId TEXT',
] as $sql) { try { $db->exec($sql); } catch (Exception $e) { /* column exists */ } }

// ── 2. Snapshot ──
if (!$DRY && !$NOSNAP) {
    $snap = __DIR__ . '/backup/avprocure-' . date('Y-m-d') . '-pre-vendors.db';
    if (file_exists($snap)) echo "Snapshot already exists: $snap\n";
    else { $db->exec("VACUUM INTO '" . SQLite3::escapeString($snap) . "'"); echo "Snapshot: $snap\n"; }
}

// ── 3. Collect distinct vendor names across the three tables ──
$names = []; // lowerKey => display name (first non-empty casing wins)
foreach (['orders', 'vendor_bills', 'rmas'] as $tbl) {
    $res = $db->query("SELECT DISTINCT TRIM(vendor) v FROM $tbl WHERE vendor IS NOT NULL AND TRIM(vendor) <> ''");
    while ($row = $res->fetchArray(SQLITE3_ASSOC)) {
        $v = trim($row['v']); $k = strtolower($v);
        if (!isset($names[$k])) $names[$k] = $v;
    }
}

$made = ['vendorsCreated'=>0, 'vendorsExisting'=>0, 'ordersLinked'=>0, 'billsLinked'=>0, 'rmasLinked'=>0];

$db->exec('BEGIN');
try {
    foreach ($names as $k => $display) {
        // find-or-create the vendor (case-insensitive)
        $st = $db->prepare('SELECT id FROM vendors WHERE lower(name) = :k LIMIT 1');
        $st->bindValue(':k', $k);
        $ex = $st->execute()->fetchArray(SQLITE3_ASSOC);
        if ($ex) { $vid = $ex['id']; $made['vendorsExisting']++; }
        else {
            $vid = nid();
            $ins = $db->prepare('INSERT INTO vendors (id, name) VALUES (:i, :n)');
            $ins->bindValue(':i', $vid); $ins->bindValue(':n', $display); $ins->execute();
            $made['vendorsCreated']++;
        }
        // link the three tables (only rows not yet linked)
        foreach (['orders'=>'ordersLinked', 'vendor_bills'=>'billsLinked', 'rmas'=>'rmasLinked'] as $tbl => $ctr) {
            $u = $db->prepare("UPDATE $tbl SET vendorId = :v
                               WHERE lower(TRIM(vendor)) = :k AND (vendorId IS NULL OR vendorId = '')");
            $u->bindValue(':v', $vid); $u->bindValue(':k', $k); $u->execute();
            $made[$ctr] += $db->changes();
        }
    }
    if ($DRY) { $db->exec('ROLLBACK'); echo "\n[DRY RUN] rolled back.\n"; }
    else      { $db->exec('COMMIT'); }
} catch (Exception $e) {
    $db->exec('ROLLBACK');
    fwrite(STDERR, "\nMigration FAILED — rolled back.\n" . $e->getMessage() . "\n");
    exit(1);
}

echo "\nSummary: " . json_encode($made, JSON_PRETTY_PRINT) . "\n";
echo $DRY ? "Dry run complete.\n" : "Vendor backfill complete.\n";
