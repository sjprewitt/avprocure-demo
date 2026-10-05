<?php
require_once __DIR__ . '/auth.php';
auth_session_start();
auth_seed();

header('Content-Type: application/json');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }

if (!auth_check()) {
    // Do NOT send a new session cookie — if the browser had a valid cookie, keep it intact.
    // Otherwise the new empty session replaces the real one and all subsequent requests fail.
    header_remove('Set-Cookie');
    http_response_code(401);
    echo json_encode(['error' => 'Unauthorized', 'session' => 'expired']);
    exit;
}

// DB lives outside the web root (see also auth.php). Apache denies the
// /avprocure-data/ path at the config level, so the SQLite file with its
// password hashes is never reachable over HTTP even if .htaccess fails.
define('DB_PATH', dirname(__DIR__) . '/avprocure-data/avprocure.db');

function db(): SQLite3 {
    static $db = null;
    if ($db) return $db;
    $db = new SQLite3(DB_PATH);
    $db->enableExceptions(true);
    $db->busyTimeout(5000);
    $db->exec('PRAGMA journal_mode=WAL');
    $db->exec('PRAGMA foreign_keys=ON');
    return $db;
}

function respond($data, int $code = 200): void {
    http_response_code($code);
    echo json_encode($data);
    exit;
}

function err(string $msg, int $code = 400): void {
    respond(['error' => $msg], $code);
}

function body(): array {
    $raw = file_get_contents('php://input');
    $decoded = json_decode($raw, true);
    if ($decoded === null && $raw !== '') err('Invalid JSON body');
    return $decoded ?? [];
}

// ── Parse route ──────────────────────────────────────────────────────────────
$method = $_SERVER['REQUEST_METHOD'];

// PATH_INFO is set by Apache when .htaccess rewrites /api/* → api.php/*
// Fall back to parsing REQUEST_URI directly (e.g. CLI tests)
$path = $_SERVER['PATH_INFO'] ?? '';
if (!$path) {
    $uri  = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
    $path = preg_replace('#^.*?/api(?:\.php)?#', '', $uri);
}

$parts  = array_values(array_filter(explode('/', trim($path, '/'))));
$entity = $parts[0] ?? '';
$id     = $parts[1] ?? null;

// Ensure schema exists on every request (no-op if tables already present)
create_schema(db());

// ── Route table ──────────────────────────────────────────────────────────────
match (true) {
    $entity === 'data'    && $method === 'GET'    => route_get_all(),
    $entity === 'migrate' && $method === 'POST'   => route_migrate(),
    $entity !== ''        && $method === 'GET'    => route_get($entity),
    $entity !== ''        && $method === 'POST'   => route_post($entity),
    $entity !== ''        && $method === 'PUT'    => route_put($entity, $id),
    $entity !== ''        && $method === 'DELETE' => route_delete($entity, $id),
    default => err('Not found', 404),
};

// ── GET /api/data — full load ─────────────────────────────────────────────────
function route_get_all(): void {
    $db = db();
    respond([
        'catalog'      => rows($db, 'SELECT * FROM catalog'),
        'inventory'    => rows($db, 'SELECT * FROM inventory'),
        'projects'     => rows($db, 'SELECT * FROM projects'),
        'projectItems' => rows($db, 'SELECT * FROM project_items'),
        'orders'       => rows($db, 'SELECT * FROM orders'),
        'orderItems'   => rows($db, 'SELECT * FROM order_items'),
        'rmas'         => rows($db, 'SELECT * FROM rmas'),
        'locations'    => rows($db, 'SELECT * FROM locations'),
        'transfers'    => rows($db, 'SELECT * FROM transfers'),
        'invoices'           => rows($db, 'SELECT * FROM invoices'),
        'invoiceItems'       => rows($db, 'SELECT * FROM invoice_items'),
        'invoicePayments'    => rows($db, 'SELECT * FROM invoice_payments'),
        'vendorBills'        => rows($db, 'SELECT * FROM vendor_bills'),
        'vendorBillItems'    => rows($db, 'SELECT * FROM vendor_bill_items'),
        'vendorBillPayments' => rows($db, 'SELECT * FROM vendor_bill_payments'),
        'clients'            => rows($db, 'SELECT * FROM clients'),
        'clientLocations'    => rows($db, 'SELECT * FROM client_locations'),
        'vendors'            => rows($db, 'SELECT * FROM vendors'),
        'shipments'          => rows($db, 'SELECT * FROM shipments'),
        'shipmentItems'      => rows($db, 'SELECT * FROM shipment_items'),
        'deployments'        => rows($db, 'SELECT * FROM deployments'),
        'deploymentItems'    => rows($db, 'SELECT * FROM deployment_items'),
        'deployCarts'        => rows($db, 'SELECT * FROM deploy_carts'),
    ]);
}

// ── GET /api/{entity} ─────────────────────────────────────────────────────────
function route_get(string $entity): void {
    $table = entity_table($entity);
    respond(rows(db(), "SELECT * FROM $table"));
}

// ── POST /api/{entity} ────────────────────────────────────────────────────────
function route_post(string $entity): void {
    $table  = entity_table($entity);
    $data   = body();
    $pk     = pk($entity);
    if (empty($data[$pk])) err("Missing primary key: $pk");
    upsert($table, $data);
    respond(['ok' => true]);
}

// ── PUT /api/{entity}/{id} ────────────────────────────────────────────────────
function route_put(string $entity, ?string $id): void {
    if (!$id) err('Missing id');
    $table = entity_table($entity);
    $data  = body();
    $pk    = pk($entity);
    $data[$pk] = $id;
    upsert($table, $data);
    respond(['ok' => true]);
}

// ── DELETE /api/{entity}/{id} ─────────────────────────────────────────────────
function route_delete(string $entity, ?string $id): void {
    if (!$id) err('Missing id');
    $table = entity_table($entity);
    $pk    = pk($entity);
    $db    = db();
    $stmt  = $db->prepare("DELETE FROM $table WHERE $pk = :id");
    $stmt->bindValue(':id', $id, SQLITE3_TEXT);
    $stmt->execute();
    respond(['ok' => true]);
}

// ── POST /api/migrate — import all data from browser ─────────────────────────
function route_migrate(): void {
    $db   = db();
    $data = body();

    create_schema($db);

    $db->exec('BEGIN');
    try {
        foreach ([
            'catalog'             => ['catalog',              'catalog'],
            'inventory'           => ['inventory',            'inventory'],
            'projects'            => ['projects',             'projects'],
            'projectItems'        => ['project_items',        'projectItems'],
            'orders'              => ['orders',               'orders'],
            'orderItems'          => ['order_items',          'orderItems'],
            'rmas'                => ['rmas',                 'rmas'],
            'locations'           => ['locations',            'locations'],
            'transfers'           => ['transfers',            'transfers'],
            'clients'             => ['clients',              'clients'],
            'clientLocations'     => ['client_locations',     'clientLocations'],
            'vendors'             => ['vendors',              'vendors'],
            'invoices'            => ['invoices',             'invoices'],
            'invoiceItems'        => ['invoice_items',        'invoiceItems'],
            'invoicePayments'     => ['invoice_payments',     'invoicePayments'],
            'vendorBills'         => ['vendor_bills',         'vendorBills'],
            'vendorBillItems'     => ['vendor_bill_items',    'vendorBillItems'],
            'vendorBillPayments'  => ['vendor_bill_payments', 'vendorBillPayments'],
            'deployments'         => ['deployments',          'deployments'],
            'deploymentItems'     => ['deployment_items',     'deploymentItems'],
            'deployCarts'         => ['deploy_carts',         'deployCarts'],
        ] as $key => [$table, $_]) {
            $rows = $data[$key] ?? [];
            foreach ($rows as $row) {
                upsert($table, $row);
            }
        }
        $db->exec('COMMIT');
    } catch (Exception $e) {
        $db->exec('ROLLBACK');
        error_log('AVProcure migration failed: ' . $e->getMessage());
        err('Migration failed. See server logs.', 500);
    }

    respond(['ok' => true, 'migrated' => array_map(fn($k) => [$k => count($data[$k] ?? [])], array_keys($data))]);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function rows(SQLite3 $db, string $sql): array {
    $result = $db->query($sql);
    $out = [];
    while ($row = $result->fetchArray(SQLITE3_ASSOC)) {
        // Deserialize JSON-stored arrays
        foreach (['inventoryIds', 'unfilledIds'] as $field) {
            if (isset($row[$field])) {
                $decoded = json_decode($row[$field], true);
                $row[$field] = is_array($decoded) ? $decoded : [];
            }
        }
        $out[] = $row;
    }
    return $out;
}

// Allowed columns per table, read from the live schema. Cached per request.
// $table is always one of the fixed values from entity_table(), so the
// interpolation below is not attacker-controlled.
function table_columns(string $table): array {
    static $cache = [];
    if (isset($cache[$table])) return $cache[$table];
    $cols = [];
    $res  = db()->query("PRAGMA table_info($table)");
    while ($row = $res->fetchArray(SQLITE3_ASSOC)) {
        $cols[$row['name']] = true;
    }
    return $cache[$table] = $cols;
}

function upsert(string $table, array $data): void {
    if (empty($data)) return;
    $db = db();

    // Serialize array fields
    foreach (['inventoryIds', 'unfilledIds', 'otherCharges', 'items'] as $field) {
        if (isset($data[$field]) && is_array($data[$field])) {
            $data[$field] = json_encode($data[$field]);
        }
    }

    // Whitelist: drop any keys that are not real columns of this table so
    // attacker-controlled JSON keys can never become SQL identifiers.
    $data = array_intersect_key($data, table_columns($table));
    if (empty($data)) return;

    $cols    = array_keys($data);
    $holders = array_map(fn($c) => ":$c", $cols);
    $sql     = sprintf(
        'INSERT OR REPLACE INTO %s (%s) VALUES (%s)',
        $table,
        implode(',', $cols),
        implode(',', $holders)
    );
    $stmt = $db->prepare($sql);
    foreach ($data as $col => $val) {
        $type = is_int($val) || is_float($val) ? SQLITE3_NUM : SQLITE3_TEXT;
        $stmt->bindValue(":$col", $val ?? '', $type);
    }
    $stmt->execute();
}

function entity_table(string $entity): string {
    $map = [
        'catalog'      => 'catalog',
        'inventory'    => 'inventory',
        'projects'     => 'projects',
        'projectItems' => 'project_items',
        'orders'       => 'orders',
        'orderItems'   => 'order_items',
        'rmas'         => 'rmas',
        'locations'    => 'locations',
        'transfers'    => 'transfers',
        'invoices'           => 'invoices',
        'invoiceItems'       => 'invoice_items',
        'invoicePayments'    => 'invoice_payments',
        'vendorBills'        => 'vendor_bills',
        'vendorBillItems'    => 'vendor_bill_items',
        'vendorBillPayments' => 'vendor_bill_payments',
        'clients'            => 'clients',
        'clientLocations'    => 'client_locations',
        'vendors'            => 'vendors',
        'shipments'          => 'shipments',
        'shipmentItems'      => 'shipment_items',
        'deployments'        => 'deployments',
        'deploymentItems'    => 'deployment_items',
        'deployCarts'        => 'deploy_carts',
    ];
    if (!isset($map[$entity])) err("Unknown entity: $entity", 404);
    return $map[$entity];
}

function pk(string $entity): string {
    return match ($entity) {
        'catalog'      => 'sku',
        'inventory'    => 'id',
        'projects'     => 'id',
        'projectItems' => 'id',
        'orders'       => 'poNumber',
        'orderItems'   => 'id',
        'rmas'         => 'rmaId',
        'locations'    => 'id',
        'transfers'    => 'id',
        'invoices'           => 'id',
        'invoiceItems'       => 'id',
        'invoicePayments'    => 'id',
        'vendorBills'        => 'id',
        'vendorBillItems'    => 'id',
        'vendorBillPayments' => 'id',
        'clients'            => 'id',
        'clientLocations'    => 'id',
        'vendors'            => 'id',
        'shipments'          => 'id',
        'shipmentItems'      => 'id',
        'deployments'        => 'id',
        'deploymentItems'    => 'id',
        'deployCarts'        => 'id',
        default        => err("Unknown entity: $entity", 404),
    };
}

// ── Schema ────────────────────────────────────────────────────────────────────
function create_schema(SQLite3 $db): void {
    $db->exec('
        CREATE TABLE IF NOT EXISTS catalog (
            sku         TEXT PRIMARY KEY,
            manufacturer TEXT NOT NULL,
            model       TEXT NOT NULL,
            category    TEXT,
            subcategory TEXT,
            url         TEXT,
            shortDesc   TEXT,
            longDesc    TEXT,
            msrp        REAL DEFAULT 0,
            unitCost    REAL DEFAULT 0,
            unitPrice   REAL DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS inventory (
            id          TEXT PRIMARY KEY,
            sku         TEXT,
            manufacturer TEXT NOT NULL,
            model       TEXT NOT NULL,
            category    TEXT,
            type        TEXT DEFAULT "serialized",
            serial      TEXT,
            par         INTEGER DEFAULT 0,
            qty         INTEGER DEFAULT 1,
            location    TEXT,
            locationId  TEXT,
            condition   TEXT DEFAULT "New",
            status      TEXT DEFAULT "In Stock",
            invStatus   TEXT,
            project     TEXT,
            projectId   TEXT,
            poNumber    TEXT,
            notes       TEXT,
            dateAdded   TEXT,
            lastUpdated TEXT
        );

        CREATE TABLE IF NOT EXISTS projects (
            id            TEXT PRIMARY KEY,
            name          TEXT NOT NULL,
            status        TEXT DEFAULT "Open",
            type          TEXT DEFAULT "job",
            firstName     TEXT,
            lastName      TEXT,
            address       TEXT,
            phone         TEXT,
            email         TEXT,
            contractValue REAL DEFAULT 0,
            startDate     TEXT,
            targetDate    TEXT,
            notes         TEXT
        );

        CREATE TABLE IF NOT EXISTS project_items (
            id           TEXT PRIMARY KEY,
            projectId    TEXT NOT NULL,
            sku          TEXT,
            manufacturer TEXT,
            model        TEXT,
            category     TEXT,
            qty          INTEGER DEFAULT 1,
            unitCost     REAL DEFAULT 0,
            unitPrice    REAL DEFAULT 0,
            inventoryIds TEXT DEFAULT "[]",
            unfilledIds  TEXT DEFAULT "[]",
            itemStatus   TEXT DEFAULT "Ordered",
            notes        TEXT
        );

        CREATE TABLE IF NOT EXISTS orders (
            poNumber    TEXT PRIMARY KEY,
            vendor      TEXT,
            projectId   TEXT,
            projectName TEXT,
            status      TEXT DEFAULT "Submitted",
            date        TEXT,
            shipment    TEXT,
            totalValue          REAL DEFAULT 0,
            itemDiscountTotal   REAL DEFAULT 0,
            tax                 REAL DEFAULT 0,
            tariff              REAL DEFAULT 0,
            shipping            REAL DEFAULT 0,
            discount            REAL DEFAULT 0,
            notes               TEXT
        );

        CREATE TABLE IF NOT EXISTS order_items (
            id           TEXT PRIMARY KEY,
            poNumber     TEXT NOT NULL,
            sku          TEXT,
            manufacturer TEXT,
            model        TEXT,
            description  TEXT,
            category     TEXT,
            qtyOrdered   INTEGER DEFAULT 1,
            qtyReceived  INTEGER DEFAULT 0,
            unitCost     REAL DEFAULT 0,
            discount     REAL DEFAULT 0,
            notes        TEXT,
            dateReceived TEXT
        );

        CREATE TABLE IF NOT EXISTS rmas (
            rmaId       TEXT PRIMARY KEY,
            type        TEXT,
            projectId   TEXT,
            projectName TEXT,
            sku         TEXT,
            manufacturer TEXT,
            model       TEXT,
            qty         INTEGER DEFAULT 1,
            vendor      TEXT,
            status      TEXT DEFAULT "Open",
            reason      TEXT,
            dateOpened  TEXT,
            dateClosed  TEXT,
            carrier        TEXT,
            billingType    TEXT,
            billingAccount TEXT,
            trackingNumber TEXT,
            dateShipped    TEXT,
            vendorRmaNumber TEXT,
            shipToAddress   TEXT
        );

        CREATE TABLE IF NOT EXISTS locations (
            id          TEXT PRIMARY KEY,
            parentId    TEXT,
            warehouseId TEXT,
            name        TEXT NOT NULL,
            code        TEXT,
            tier        TEXT,
            tierIndex   INTEGER,
            type        TEXT,
            notes       TEXT
        );

        CREATE TABLE IF NOT EXISTS transfers (
            id             TEXT PRIMARY KEY,
            timestamp      TEXT,
            inventoryId    TEXT,
            sku            TEXT,
            manufacturer   TEXT,
            model          TEXT,
            serial         TEXT,
            qty            INTEGER DEFAULT 1,
            fromProjectId  TEXT,
            fromProject    TEXT,
            toProjectId    TEXT,
            toProject      TEXT,
            fromLocation   TEXT,
            fromLocationId TEXT,
            toLocation     TEXT,
            toLocationId   TEXT,
            notes          TEXT
        );

        CREATE TABLE IF NOT EXISTS invoices (
            id           TEXT PRIMARY KEY,
            invoiceNumber TEXT,
            projectId    TEXT,
            clientName   TEXT,
            date         TEXT,
            dueDate      TEXT,
            status       TEXT DEFAULT "Draft",
            subtotal     REAL DEFAULT 0,
            tax          REAL DEFAULT 0,
            taxMode      TEXT DEFAULT "$",
            tariff       REAL DEFAULT 0,
            tariffMode   TEXT DEFAULT "$",
            shipping     REAL DEFAULT 0,
            shippingMode TEXT DEFAULT "$",
            labor        REAL DEFAULT 0,
            laborMode    TEXT DEFAULT "$",
            notes        TEXT
        );

        CREATE TABLE IF NOT EXISTS invoice_items (
            id          TEXT PRIMARY KEY,
            invoiceId   TEXT NOT NULL,
            scopeItemId TEXT,
            sku         TEXT,
            description TEXT,
            qty         REAL DEFAULT 1,
            unitPrice   REAL DEFAULT 0,
            notes       TEXT
        );

        CREATE TABLE IF NOT EXISTS invoice_payments (
            id          TEXT PRIMARY KEY,
            invoiceId   TEXT NOT NULL,
            date        TEXT,
            amount      REAL DEFAULT 0,
            method      TEXT,
            notes       TEXT
        );

        CREATE TABLE IF NOT EXISTS vendor_bills (
            id           TEXT PRIMARY KEY,
            billNumber   TEXT,
            poNumber     TEXT,
            vendor       TEXT,
            date         TEXT,
            dueDate      TEXT,
            status       TEXT DEFAULT "Draft",
            subtotal     REAL DEFAULT 0,
            tax          REAL DEFAULT 0,
            taxMode      TEXT DEFAULT "$",
            tariff       REAL DEFAULT 0,
            tariffMode   TEXT DEFAULT "$",
            shipping     REAL DEFAULT 0,
            shippingMode TEXT DEFAULT "$",
            notes        TEXT
        );

        CREATE TABLE IF NOT EXISTS vendor_bill_items (
            id          TEXT PRIMARY KEY,
            billId      TEXT NOT NULL,
            poItemId    TEXT,
            sku         TEXT,
            description TEXT,
            qty         REAL DEFAULT 1,
            unitCost    REAL DEFAULT 0,
            notes       TEXT
        );

        CREATE TABLE IF NOT EXISTS vendor_bill_payments (
            id        TEXT PRIMARY KEY,
            billId    TEXT NOT NULL,
            date      TEXT,
            amount    REAL DEFAULT 0,
            method    TEXT,
            notes     TEXT
        );

        CREATE TABLE IF NOT EXISTS clients (
            id          TEXT PRIMARY KEY,
            name        TEXT NOT NULL,
            firstName   TEXT,
            lastName    TEXT,
            address     TEXT,
            street      TEXT,
            city        TEXT,
            state       TEXT,
            zip         TEXT,
            phone       TEXT,
            email       TEXT,
            notes       TEXT,
            isDefault   INTEGER DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS shipments (
            id             TEXT PRIMARY KEY,
            poNumber       TEXT NOT NULL,
            projectId      TEXT,
            carrier        TEXT,
            trackingNumber TEXT,
            estDelivery    TEXT,
            status         TEXT DEFAULT "In Transit",
            notes          TEXT
        );

        CREATE TABLE IF NOT EXISTS shipment_items (
            id          TEXT PRIMARY KEY,
            shipmentId  TEXT NOT NULL,
            orderItemId TEXT NOT NULL,
            qtyShipped  INTEGER DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS deployments (
            id                   TEXT PRIMARY KEY,
            date                 TEXT,
            timestamp            TEXT,
            status               TEXT DEFAULT "approved",
            recipient            TEXT,
            destination          TEXT,
            destinationProjectId TEXT,
            releasedBy           TEXT,
            notes                TEXT
        );

        CREATE TABLE IF NOT EXISTS deployment_items (
            id           TEXT PRIMARY KEY,
            deploymentId TEXT NOT NULL,
            inventoryId  TEXT,
            sku          TEXT,
            manufacturer TEXT,
            model        TEXT,
            serial       TEXT,
            qty          INTEGER DEFAULT 1
        );

        CREATE TABLE IF NOT EXISTS deploy_carts (
            id        TEXT PRIMARY KEY,
            name      TEXT,
            createdAt TEXT,
            updatedAt TEXT,
            notes     TEXT,
            items     TEXT
        );

        -- Front Desk hierarchy: the middle level between clients and projects.
        -- A client work site (home, lake house, office). Distinct from the
        -- `locations` table, which is warehouse geography (aisle/rack/shelf).
        CREATE TABLE IF NOT EXISTS client_locations (
            id          TEXT PRIMARY KEY,
            clientId    TEXT NOT NULL,
            name        TEXT NOT NULL,
            street      TEXT,
            city        TEXT,
            state       TEXT,
            zip         TEXT,
            phone       TEXT,
            notes       TEXT,
            isDefault   INTEGER DEFAULT 0,
            qbId        TEXT,
            qbSyncToken TEXT
        );

        -- Vendors as first-class records (maps to a QBO Vendor). POs / bills / RMAs
        -- link via vendorId; the legacy `vendor` text field is kept for display.
        CREATE TABLE IF NOT EXISTS vendors (
            id            TEXT PRIMARY KEY,
            name          TEXT NOT NULL,
            contactName   TEXT,
            email         TEXT,
            phone         TEXT,
            website       TEXT,
            street        TEXT,
            city          TEXT,
            state         TEXT,
            zip           TEXT,
            terms         TEXT,
            accountNumber TEXT,
            notes         TEXT,
            qbId          TEXT,
            qbSyncToken   TEXT
        );
    ');

    // Migrate existing tables that predate schema additions
    $migrations = [
        'ALTER TABLE order_items ADD COLUMN category TEXT',
        'ALTER TABLE projects ADD COLUMN clientId TEXT',
        'ALTER TABLE orders ADD COLUMN tax REAL DEFAULT 0',
        'ALTER TABLE orders ADD COLUMN tariff REAL DEFAULT 0',
        'ALTER TABLE orders ADD COLUMN shipping REAL DEFAULT 0',
        'ALTER TABLE orders ADD COLUMN discount REAL DEFAULT 0',
        'ALTER TABLE orders ADD COLUMN itemDiscountTotal REAL DEFAULT 0',
        'ALTER TABLE order_items ADD COLUMN discount REAL DEFAULT 0',
        'ALTER TABLE orders ADD COLUMN shipAddress TEXT',
        'ALTER TABLE orders ADD COLUMN otherCharges TEXT',
        'ALTER TABLE project_items ADD COLUMN filled INTEGER DEFAULT 0',
        'ALTER TABLE project_items ADD COLUMN unfilledIds TEXT DEFAULT "[]"',
        'ALTER TABLE locations ADD COLUMN street TEXT',
        'ALTER TABLE locations ADD COLUMN city TEXT',
        'ALTER TABLE locations ADD COLUMN state TEXT',
        'ALTER TABLE locations ADD COLUMN zip TEXT',
        'ALTER TABLE locations ADD COLUMN phone TEXT',
        'ALTER TABLE clients ADD COLUMN street TEXT',
        'ALTER TABLE clients ADD COLUMN city TEXT',
        'ALTER TABLE clients ADD COLUMN state TEXT',
        'ALTER TABLE clients ADD COLUMN zip TEXT',
        'ALTER TABLE projects ADD COLUMN type TEXT DEFAULT "job"',
        'ALTER TABLE shipments ADD COLUMN projectId TEXT',
        // Vendors as records: link columns (legacy `vendor` text kept for display).
        'ALTER TABLE orders       ADD COLUMN vendorId TEXT',
        'ALTER TABLE vendor_bills ADD COLUMN vendorId TEXT',
        'ALTER TABLE rmas         ADD COLUMN vendorId TEXT',
        // Return shipping: carrier, who pays (third-party = the vendor's own
        // account number), and the tracking number once it ships.
        'ALTER TABLE rmas ADD COLUMN carrier TEXT',
        'ALTER TABLE rmas ADD COLUMN billingType TEXT',
        'ALTER TABLE rmas ADD COLUMN billingAccount TEXT',
        'ALTER TABLE rmas ADD COLUMN trackingNumber TEXT',
        'ALTER TABLE rmas ADD COLUMN dateShipped TEXT',
        // The vendor's own RMA number (goes on the label and the box) is not our
        // internal rmaId; the return destination is likewise the vendor's, not
        // any address we already hold.
        'ALTER TABLE rmas ADD COLUMN vendorRmaNumber TEXT',
        'ALTER TABLE rmas ADD COLUMN shipToAddress TEXT',
        // Front Desk hierarchy: parent work-site link for each project.
        'ALTER TABLE projects ADD COLUMN clientLocationId TEXT',
        // QBO sync mapping — reserved now so integration is a bolt-on (id + optimistic-concurrency token).
        'ALTER TABLE clients  ADD COLUMN qbId TEXT',
        'ALTER TABLE clients  ADD COLUMN qbSyncToken TEXT',
        'ALTER TABLE projects ADD COLUMN qbId TEXT',
        'ALTER TABLE projects ADD COLUMN qbSyncToken TEXT',
    ];
    foreach ($migrations as $sql) {
        try { $db->exec($sql); } catch (Exception $e) { /* column already exists */ }
    }
}

