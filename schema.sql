CREATE TABLE catalog (
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
CREATE TABLE inventory (
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
CREATE TABLE projects (
            id            TEXT PRIMARY KEY,
            name          TEXT NOT NULL,
            status        TEXT DEFAULT "Open",
            firstName     TEXT,
            lastName      TEXT,
            address       TEXT,
            phone         TEXT,
            email         TEXT,
            contractValue REAL DEFAULT 0,
            startDate     TEXT,
            targetDate    TEXT,
            notes         TEXT
        , clientId TEXT);
CREATE TABLE project_items (
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
            filled       INTEGER DEFAULT 0,
            itemStatus   TEXT DEFAULT "Ordered",
            notes        TEXT
        );
CREATE TABLE orders (
            poNumber    TEXT PRIMARY KEY,
            vendor      TEXT,
            projectId   TEXT,
            projectName TEXT,
            status      TEXT DEFAULT "Submitted",
            date        TEXT,
            shipment    TEXT,
            totalValue  REAL DEFAULT 0,
            notes       TEXT
        , tax REAL DEFAULT 0, tariff REAL DEFAULT 0, shipping REAL DEFAULT 0, discount REAL DEFAULT 0, itemDiscountTotal REAL DEFAULT 0, shipAddress TEXT, otherCharges TEXT);
CREATE TABLE order_items (
            id           TEXT PRIMARY KEY,
            poNumber     TEXT NOT NULL,
            sku          TEXT,
            manufacturer TEXT,
            model        TEXT,
            description  TEXT,
            qtyOrdered   INTEGER DEFAULT 1,
            qtyReceived  INTEGER DEFAULT 0,
            unitCost     REAL DEFAULT 0,
            notes        TEXT,
            dateReceived TEXT
        , category TEXT, discount REAL DEFAULT 0);
CREATE TABLE rmas (
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
            dateClosed  TEXT
        , carrier TEXT, billingType TEXT, billingAccount TEXT, trackingNumber TEXT, dateShipped TEXT, vendorRmaNumber TEXT, shipToAddress TEXT);
CREATE TABLE locations (
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
CREATE TABLE transfers (
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
CREATE TABLE invoices (
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
CREATE TABLE invoice_items (
            id          TEXT PRIMARY KEY,
            invoiceId   TEXT NOT NULL,
            scopeItemId TEXT,
            sku         TEXT,
            description TEXT,
            qty         REAL DEFAULT 1,
            unitPrice   REAL DEFAULT 0,
            notes       TEXT
        );
CREATE TABLE invoice_payments (
            id          TEXT PRIMARY KEY,
            invoiceId   TEXT NOT NULL,
            date        TEXT,
            amount      REAL DEFAULT 0,
            method      TEXT,
            notes       TEXT
        );
CREATE TABLE vendor_bills (
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
CREATE TABLE vendor_bill_items (
            id          TEXT PRIMARY KEY,
            billId      TEXT NOT NULL,
            poItemId    TEXT,
            sku         TEXT,
            description TEXT,
            qty         REAL DEFAULT 1,
            unitCost    REAL DEFAULT 0,
            notes       TEXT
        );
CREATE TABLE vendor_bill_payments (
            id        TEXT PRIMARY KEY,
            billId    TEXT NOT NULL,
            date      TEXT,
            amount    REAL DEFAULT 0,
            method    TEXT,
            notes     TEXT
        );
CREATE TABLE clients (
            id          TEXT PRIMARY KEY,
            name        TEXT NOT NULL,
            firstName   TEXT,
            lastName    TEXT,
            address     TEXT,
            phone       TEXT,
            email       TEXT,
            notes       TEXT,
            isDefault   INTEGER DEFAULT 0
        );
CREATE TABLE users (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        username      TEXT    NOT NULL UNIQUE COLLATE NOCASE,
        password_hash TEXT    NOT NULL,
        is_admin      INTEGER NOT NULL DEFAULT 0,
        is_active     INTEGER NOT NULL DEFAULT 1,
        created_at    TEXT    NOT NULL DEFAULT (datetime('now','utc')),
        last_login    TEXT
    );
CREATE TABLE sqlite_sequence(name,seq);
CREATE TABLE access_log (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        ts         TEXT    NOT NULL DEFAULT (datetime('now','utc')),
        username   TEXT    NOT NULL,
        ip         TEXT,
        xff        TEXT,
        user_agent TEXT,
        success    INTEGER NOT NULL DEFAULT 0,
        note       TEXT
    );
