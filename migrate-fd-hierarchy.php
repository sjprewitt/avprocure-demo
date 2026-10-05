<?php
/**
 * migrate-fd-hierarchy.php — one-time backfill for the Front Desk hierarchy
 * (Client → Location → Project). See docs/DESIGN-frontdesk-hierarchy.md.
 *
 * IDEMPOTENT: safe to run more than once. A client that already has a
 * client_location is treated as already-migrated and skipped.
 *
 * CLI ONLY (guarded below) so it can never be triggered over the web.
 *
 * Usage:
 *   php migrate-fd-hierarchy.php                 # migrate the live DB (auto-snapshots first)
 *   php migrate-fd-hierarchy.php --dry-run       # show what WOULD change, write nothing
 *   php migrate-fd-hierarchy.php /path/to.db     # target a specific DB file
 *   php migrate-fd-hierarchy.php --no-snapshot   # skip the VACUUM INTO snapshot
 *
 * What it does:
 *   1. Ensures the hierarchy schema exists (client_locations + new columns) — idempotent.
 *   2. Snapshots the DB (VACUUM INTO backup/…-pre-fd-hierarchy.db) unless --dry-run/--no-snapshot.
 *   3. SHOP: finds (or creates) the default "shop owner" client, gives it a "Shop" location,
 *      and files shop-stock / shop-ops / shop-other under it (reparenting existing projects
 *      by name, creating any that are missing).
 *   4. EVERY OTHER client: creates one default "Main" location, moves that client's existing
 *      projects under it, and adds the three default sibling folders — Main / Change Order /
 *      Service — beside them ("add trio everywhere").
 *   5. Projects with no client are left untouched (they surface under "Unassigned" in the UI).
 */

if (PHP_SAPI !== 'cli') {
    http_response_code(403);
    header('Content-Type: text/plain');
    exit("This migration runs from the command line only.\n");
}

$DB     = $argv[1] ?? (dirname(__DIR__) . '/avprocure-data/avprocure.db');
if (isset($argv[1]) && str_starts_with($argv[1], '--')) {
    // First arg was a flag, not a path — fall back to the default DB path.
    $DB = dirname(__DIR__) . '/avprocure-data/avprocure.db';
}
$DRY    = in_array('--dry-run', $argv, true);
$NOSNAP = in_array('--no-snapshot', $argv, true);

if (!file_exists($DB)) { fwrite(STDERR, "DB not found: $DB\n"); exit(1); }
echo "Target DB: $DB" . ($DRY ? "  [DRY RUN]" : "") . "\n";

$db = new SQLite3($DB);
$db->enableExceptions(true);
$db->busyTimeout(5000);
$db->exec('PRAGMA journal_mode=WAL');
$db->exec('PRAGMA foreign_keys=ON');

/** Opaque, collision-safe TEXT primary key. */
function nid(): string { return bin2hex(random_bytes(9)); }
function one(SQLite3 $db, string $sql, array $binds = []): ?array {
    $st = $db->prepare($sql);
    foreach ($binds as $k => $v) $st->bindValue($k, $v);
    return $st->execute()->fetchArray(SQLITE3_ASSOC) ?: null;
}
function allrows(SQLite3 $db, string $sql, array $binds = []): array {
    $st = $db->prepare($sql);
    foreach ($binds as $k => $v) $st->bindValue($k, $v);
    $r = $st->execute(); $out = [];
    while ($x = $r->fetchArray(SQLITE3_ASSOC)) $out[] = $x;
    return $out;
}

// ── 1. Ensure schema (idempotent; mirrors the bits of api.php create_schema we depend on) ──
$db->exec('CREATE TABLE IF NOT EXISTS client_locations (
    id TEXT PRIMARY KEY, clientId TEXT NOT NULL, name TEXT NOT NULL,
    street TEXT, city TEXT, state TEXT, zip TEXT, phone TEXT, notes TEXT,
    isDefault INTEGER DEFAULT 0, qbId TEXT, qbSyncToken TEXT)');
foreach ([
    'ALTER TABLE projects ADD COLUMN clientLocationId TEXT',
    'ALTER TABLE projects ADD COLUMN type TEXT DEFAULT "job"',
    'ALTER TABLE clients  ADD COLUMN isDefault INTEGER DEFAULT 0',
    'ALTER TABLE clients  ADD COLUMN qbId TEXT',
    'ALTER TABLE clients  ADD COLUMN qbSyncToken TEXT',
    'ALTER TABLE projects ADD COLUMN qbId TEXT',
    'ALTER TABLE projects ADD COLUMN qbSyncToken TEXT',
] as $sql) { try { $db->exec($sql); } catch (Exception $e) { /* column exists */ } }

// ── 2. Snapshot ──
if (!$DRY && !$NOSNAP) {
    $snap = __DIR__ . '/backup/avprocure-' . date('Y-m-d') . '-pre-fd-hierarchy.db';
    if (file_exists($snap)) {
        echo "Snapshot already exists, keeping it: $snap\n";
    } else {
        $db->exec("VACUUM INTO '" . SQLite3::escapeString($snap) . "'");
        echo "Snapshot written: $snap\n";
    }
}

$made = ['locationsCreated'=>0,'foldersCreated'=>0,'projectsReparented'=>0,'clientsMigrated'=>0,'clientsSkipped'=>0];

$db->exec('BEGIN');
try {
    // ── 3. SHOP: owner client → Shop location → shop-stock / shop-ops / shop-other ──
    $SHOP = ['shop-stock', 'shop-ops', 'shop-other'];
    $owner = one($db, 'SELECT * FROM clients WHERE isDefault = 1 LIMIT 1');
    if (!$owner) {
        $oid = nid();
        $st = $db->prepare('INSERT INTO clients (id, name, isDefault) VALUES (:i, :n, 1)');
        $st->bindValue(':i', $oid); $st->bindValue(':n', 'House Account'); $st->execute();
        $owner = ['id' => $oid, 'name' => 'House Account'];
        echo "  + created shop-owner client 'House Account'\n";
    }
    $ownerId = $owner['id'];

    $shopLoc = one($db, 'SELECT id FROM client_locations WHERE clientId = :c AND lower(name) = "shop" LIMIT 1', [':c' => $ownerId]);
    if ($shopLoc) {
        $shopLocId = $shopLoc['id'];
    } else {
        $shopLocId = nid();
        $st = $db->prepare('INSERT INTO client_locations (id, clientId, name, isDefault) VALUES (:i, :c, "Shop", 1)');
        $st->bindValue(':i', $shopLocId); $st->bindValue(':c', $ownerId); $st->execute();
        $made['locationsCreated']++;
        echo "  + created 'Shop' location under {$owner['name']}\n";
    }

    foreach ($SHOP as $sn) {
        // Match by normalized name (hyphen/space-insensitive): "Shop-Ops" == "shop ops" == "shop-ops"
        $p = one($db, 'SELECT id, clientLocationId FROM projects WHERE replace(replace(lower(name)," ","-"),"_","-") = :n LIMIT 1', [':n' => $sn]);
        if ($p) {
            if (empty($p['clientLocationId'])) {
                $st = $db->prepare('UPDATE projects SET clientLocationId = :l, clientId = :c WHERE id = :i');
                $st->bindValue(':l', $shopLocId); $st->bindValue(':c', $ownerId); $st->bindValue(':i', $p['id']); $st->execute();
                $made['projectsReparented']++;
                echo "    · filed existing '$sn' under Shop\n";
            }
        } else {
            $pid = nid();
            $st = $db->prepare('INSERT INTO projects (id, name, clientId, clientLocationId, status, type) VALUES (:i, :n, :c, :l, "Open", "stock")');
            $st->bindValue(':i', $pid); $st->bindValue(':n', $sn); $st->bindValue(':c', $ownerId); $st->bindValue(':l', $shopLocId); $st->execute();
            $made['foldersCreated']++;
            echo "    · created shop folder '$sn'\n";
        }
    }

    // ── 4. Every other client: Main location + reparent + trio ──
    $TRIO = ['Main', 'Change Order', 'Service'];
    foreach (allrows($db, 'SELECT * FROM clients') as $c) {
        if ($c['id'] === $ownerId) continue; // shop owner handled above
        // Idempotency: a client that already has any location is considered migrated.
        if (one($db, 'SELECT id FROM client_locations WHERE clientId = :c LIMIT 1', [':c' => $c['id']])) {
            $made['clientsSkipped']++; continue;
        }
        // Default "Main" location, seeded from the client's address fields.
        $mid = nid();
        $st = $db->prepare('INSERT INTO client_locations (id, clientId, name, street, city, state, zip, phone, isDefault)
                            VALUES (:i, :c, "Main", :st, :ci, :sta, :z, :ph, 1)');
        $st->bindValue(':i', $mid);              $st->bindValue(':c', $c['id']);
        $st->bindValue(':st',  $c['street'] ?? ''); $st->bindValue(':ci', $c['city'] ?? '');
        $st->bindValue(':sta', $c['state']  ?? ''); $st->bindValue(':z',  $c['zip']  ?? '');
        $st->bindValue(':ph',  $c['phone']  ?? '');
        $st->execute();
        $made['locationsCreated']++;

        // Move this client's existing projects under Main.
        $st = $db->prepare('UPDATE projects SET clientLocationId = :l
                            WHERE clientId = :c AND (clientLocationId IS NULL OR clientLocationId = "")');
        $st->bindValue(':l', $mid); $st->bindValue(':c', $c['id']); $st->execute();
        $made['projectsReparented'] += $db->changes();

        // Add the three default sibling folders (skip a name that already exists under this location).
        foreach ($TRIO as $fn) {
            if (one($db, 'SELECT id FROM projects WHERE clientLocationId = :l AND lower(name) = lower(:n) LIMIT 1', [':l' => $mid, ':n' => $fn])) continue;
            $pid = nid();
            $st = $db->prepare('INSERT INTO projects (id, name, clientId, clientLocationId, status, type) VALUES (:i, :n, :c, :l, "Open", "job")');
            $st->bindValue(':i', $pid); $st->bindValue(':n', $fn); $st->bindValue(':c', $c['id']); $st->bindValue(':l', $mid); $st->execute();
            $made['foldersCreated']++;
        }
        $made['clientsMigrated']++;
    }

    if ($DRY) { $db->exec('ROLLBACK'); echo "\n[DRY RUN] all changes rolled back.\n"; }
    else      { $db->exec('COMMIT'); }
} catch (Exception $e) {
    $db->exec('ROLLBACK');
    fwrite(STDERR, "\nMigration FAILED — rolled back, DB unchanged.\n" . $e->getMessage() . "\n");
    exit(1);
}

echo "\nSummary: " . json_encode($made, JSON_PRETTY_PRINT) . "\n";
echo $DRY ? "Dry run complete — nothing written.\n" : "Migration complete.\n";
