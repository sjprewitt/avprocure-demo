# AVProcure

**Version:** `0.8.12.26.29`  
**Status:** Pre-release / Active Development  
**Last Updated:** October 5, 2026

---

## What Is AVProcure?

AVProcure is a browser application for AV integration procurement, inventory, and warehouse management. It supplements and partially replaces D-Tools SI and manual Excel workflows.

No build step and no bundler. Data loads from SQLite through a small PHP REST API, and every change persists immediately — there is no save button.

**Try it without any real data:** `demo/build.sh` generates a fully populated database from invented data. See [Demo dataset](#demo-dataset).

---

## Demo dataset

`demo/build.sh` creates a complete, fully populated database from invented data,
so the application can be run and explored without any real customer, pricing or
vendor information.

```bash
./demo/build.sh          # -> demo/avprocure-demo.db
```

Three steps, each independently runnable:

| Step | Script | Notes |
|---|---|---|
| Schema | `build-schema.php` | Extracts `create_schema()` from `api.php` at run time, so the demo schema cannot drift from the real one |
| Data | `seed-demo.py` | Deterministic — the same seed always produces the same database |
| Login | `create-admin.php` | Creates the `users` table and one admin account |

Roughly 290 catalog entries, 865 inventory units, 190 purchase orders, 59
projects across 24 clients, plus deployments, invoices, vendor bills, shipments
and RMAs. Scope lines are generated *from* each project's own order and receipt
history, so coverage (Filled / Partial / Pending) reflects a believable supply
chain rather than random pairings.

To run it locally with no web server configuration, place the application in a
directory whose parent also holds `avprocure-data/`, and serve the parent:

```bash
php -S 127.0.0.1:8080 router.php     # see demo/README.md
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| App | `index.html` (shell) + `css/app.css` + `js/` modules (core, data, inventory, deploy, pricebook, projects, orders, rmas, stock, locations, frontdesk, export) |
| Data persistence | SQLite (`avprocure.db`) via PHP REST API (`api.php`) |
| Authentication | Session-based auth (`gate.php` / `auth.php`); admin panel (`admin.php`) |
| Excel export | SheetJS (`xlsx.full.min.js` via CDN) — export only |
| Barcode scanning | `BarcodeDetector` Web API (Chrome Android / Safari 17+) |
| Fonts | Space Mono, Syne (Google Fonts) |
| Hosting | Any PHP 8 host. Apache with `mod_rewrite`, or `php -S` for local use |

---

## API

`api.php` is a single-file PHP REST API with the following routes. All endpoints require an authenticated session (401 returned otherwise).

| Method | Route | Action |
|---|---|---|
| `GET` | `/api/data` | Full load — all 16 entities in one response |
| `GET` | `/api/{entity}` | Fetch one entity table |
| `POST` | `/api/{entity}` | Insert or replace a record |
| `PUT` | `/api/{entity}/{id}` | Update a record by primary key |
| `DELETE` | `/api/{entity}/{id}` | Delete a record by primary key |
| `POST` | `/api/migrate` | Bulk import from browser JSON |

**Entities:** `catalog`, `inventory`, `projects`, `projectItems`, `orders`, `orderItems`, `rmas`, `locations`, `transfers`, `invoices`, `invoiceItems`, `invoicePayments`, `vendorBills`, `vendorBillItems`, `vendorBillPayments`, `clients`

All changes write to SQLite immediately on every action. No debounce, no manual save step.

---

## Database Schema

23 application tables in `avprocure.db`, created by `create_schema()` in `api.php` on every request (`CREATE TABLE IF NOT EXISTS`), plus two auth tables created by `auth.php`. `schema.sql` is a static reference dump and may lag the live schema.

**Core app tables**

| Table | Primary Key | Notes |
|---|---|---|
| `catalog` | `sku` | Product catalog / pricebook |
| `inventory` | `id` | Individual inventory records |
| `projects` | `id` | Project records |
| `project_items` | `id` | Scope line items per project |
| `orders` | `poNumber` | Purchase order headers |
| `order_items` | `id` | Line items per PO |
| `rmas` | `rmaId` | Return/repair requests |
| `locations` | `id` | Warehouse location hierarchy |
| `transfers` | `id` | Location/project transfer log |
| `clients` | `id` | Client records; linked to projects via `clientId` |
| `client_locations` | `id` | Work sites per client (Front Desk middle tier) |
| `vendors` | `id` | Vendor records; POs/bills/RMAs link via `vendorId` |
| `deployments` | `id` | Equipment release records (who took what, where) |
| `deployment_items` | `id` | Units per deployment |
| `deploy_carts` | `id` | Saved, named staging carts |
| `shipments` | `id` | Inbound shipment tracking per PO |
| `shipment_items` | `id` | Quantities per shipment |
| `invoices` | `id` | Customer invoice headers |
| `invoice_items` | `id` | Line items per invoice |
| `invoice_payments` | `id` | Payment records per invoice |
| `vendor_bills` | `id` | Vendor bill headers |
| `vendor_bill_items` | `id` | Line items per vendor bill |
| `vendor_bill_payments` | `id` | Payment records per vendor bill |

**Auth / system tables**

| Table | Primary Key | Notes |
|---|---|---|
| `users` | `id` | User accounts (username, bcrypt hash, is_admin, is_active) |
| `access_log` | `id` | Login/logout audit log (IP, user agent, success/failure) |
| `sqlite_sequence` | — | SQLite autoincrement tracking (internal) |

`inventoryIds` arrays (on `project_items`) are stored as JSON text and serialized/deserialized transparently by `api.php`.

---

## Authentication

Access is gated by `gate.php`, which serves the login page, handles login/logout POST requests, and injects a logout button into `index.html` for authenticated sessions.

| File | Role |
|---|---|
| `gate.php` | Entry point — renders login form or serves the app; handles re-auth popup flow |
| `auth.php` | Session management, DB helper, access logging, user seeding |
| `admin.php` | Admin-only panel at `/avprocure/admin.php` |

**Session:** 8-hour lifetime (`session.gc_maxlifetime = 28800`), `HttpOnly` + `SameSite=Strict` cookies, session ID regenerated on login.

**CSRF:** All POST forms (login, logout, admin actions) require a CSRF token validated with `hash_equals()`.

**Admin panel** (`admin.php`) — admin-only; accessible after login:
- Create users, set admin role
- Change passwords
- Enable / disable accounts
- View last 200 access log entries (timestamp, username, IP, X-Forwarded-For, user agent, success/failure)

**First account:** none is created automatically. `auth_seed()` creates the `users`
table and logs a notice if it is empty; create the first admin directly in the
database. `demo/create-admin.php` shows the expected row shape — username plus a
`password_hash` produced by PHP `password_hash($pass, PASSWORD_DEFAULT)`.

**Re-auth flow:** If the API returns `401` mid-session, the app opens a popup login window. On success the popup posts a `postMessage` to the parent and closes; the original request is retried transparently.

---

## Features

### Inventory Tab

**Add Form**
- Manufacturer and model with autocomplete (from pricebook)
- Category field: auto-fills and locks when item is in pricebook; editable for unknown items
- SKU auto-assigns when a known pricebook entry is matched
- Serialized / Bulk toggle
- 3-tier cascading location picker: Aisle → Rack → Shelf (each tier optional, filters to relevant children)
- Condition and Inv Status selects; status auto-sets based on location type (staging → Staged, general → In Stock)
- Project assignment
- Notes
- **Batch Add** — add multiple serialized items at once (bulk serial entry)
- "Add to Pricebook?" prompt when manufacturer/model is not in catalog — creates pricebook entry and inventory record in one step; category field from the inventory form pre-fills the prompt

**Scan Mode** *(mobile)*
- Toggle via ⬡ Scan Mode; green banner shows current sticky location and status
- Location and status lock between adds — move through the warehouse without re-selecting
- Tap the location chip to change the sticky location; status chip cycles through available statuses
- Any manual location change in the form automatically becomes the new sticky

**Barcode / Serial Scanner** *(mobile)*
- ⊡ button on all serial number fields (hidden on desktop)
- Tapping immediately opens the native device camera
- Photo processed via `BarcodeDetector` Web API — auto-fills the serial field and closes on success
- On failure: modal shows the captured photo, a status message, and a manual text input as fallback
- Retry camera or type manually; Cancel closes without action

**Inventory Table**
- Grouped by manufacturer + model; expandable rows for serialized items
- Inline location editing per row (single flat select)
- Inline quantity editing for bulk items
- Sort by any column
- Transfer item between location and/or project (serial-aware; logs to transfers table)
- Delete individual items

**Filter Bar**
- **Aisle / Rack / Shelf** cascade dropdowns: selecting Aisle filters to all items in that aisle; selecting Rack narrows further; Shelf shows only that shelf. Each tier is optional.
- **Status** dropdown: filters by inventory status (Unallocated, In Stock, Staged, etc.)
- **Search** bar: full-text search across SKU, manufacturer, model, serial, location, project, notes, status
- Active location and/or status filters auto-pre-fill the add form when the form resets after an add

**Save State Badge**
- Always-visible badge in the top bar: `Saving…` while DB writes are in flight, `Export pending` for dirty in-memory state, `Saved ✓` when clean

---

### Pricebook Tab

- 2,900+ product catalog entries from D-Tools SI export
- Full-text search
- Category filter chips
- Add new catalog items with auto-generated SKU (`CAT-MFG-####`)
- Edit and delete existing entries
- Manufacturer, model, category, subcategory, unit cost, unit price, MSRP, URL, short/long description
- SKU auto-generation: category code + manufacturer code + 4-digit sequence, derived from `CAT_CODES` map

**SKU Format**
```
CAT-MFG-####
Example: NET-UBI-0027
         │   │   └── 4-digit sequence (per cat+mfg combo)
         │   └────── 3-letter manufacturer code (auto-derived)
         └────────── 3-letter category code (from CAT_CODES)
```

---

### Projects Tab

- Project list with status indicators (Open, In Progress, Complete)
- Per-project detail view with two sub-tabs:
  - **Scope** — add pricebook items with Qty Needed / Qty on PO / Qty Received / status columns; status auto-advances (On PO, Partially Received, etc.)
  - **POs** — purchase orders for the project; PO numbers link to PO detail
- Available inventory alert when adding a scope item: offers to allocate existing stock instead of ordering new

---

### Orders Tab

- PO list with status filter tabs: Open, Backorder, Received, Cancelled, All
- PO detail view with all line items
- Inline quantity and price editing
- Edit PO and Edit Line Item modals
- New PO workflow: select project scope items → set vendor, prices → confirm → PO created and scope items updated
- Receive Shipment workflow: mark quantities received; creates inventory records or updates bulk quantities
- Export PO to Excel via SheetJS
- PO statuses: `Submitted`, `In Transit`, `Backorder`, `Received`, `Cancelled`
- Tax, tariff, and shipping fields on PO header

---

### RMAs Tab

- Track return and repair requests
- Fields: type, project, SKU, manufacturer, model, quantity, vendor, status, reason, date opened, date closed
- Vendor RMA # — the number *they* issued, distinct from our internal `rmaId`;
  it is what goes on the label and the box
- Return shipping: carrier (UPS / FedEx / USPS / DHL / Freight / Other), billing
  (Bill Receiver / Third Party — both bill the vendor's own account — / Prepaid /
  Collect / Vendor label provided), billing account #, tracking #, date shipped,
  Ship To return address
- For a return the vendor is the recipient, so **Bill Receiver** is normally the
  correct mode, not Third Party (which means the payer is neither shipper nor
  recipient). Both silently revert the charge to us if the account number is
  missing or fails the carrier's postal-code check against the Ship To address
- Tracking numbers link out to the carrier's tracking page. **No carrier API is
  integrated** — the label is bought in the carrier's own tool (UPS.com,
  WorldShip, CampusShip) and its tracking number recorded here
- Status: Open / Shipped / Received / Closed / Denied

---

### Front Desk Tab

- Three-tier hierarchy: **Client → Work site → Project**. A client may have
  several sites (main residence, guest house, office); each site holds its own
  projects
- Clients list **Last, First**, derived from the structured name fields where
  present and otherwise from the stored name; organisation names are left
  un-inverted
- Accounts receivable (customer invoices, payments) and accounts payable
  (vendor bills, payments) live here
- Projects can be moved between sites and clients without losing their scope,
  orders or inventory links

---

### Deployments

- Units are staged into a named cart, then released as a **deployment**: a
  permanent record of who took what, where, and when
- Printable release manifest and pick list, with per-unit serial numbers
- Every released unit also writes a transfer-log entry, so an item's movement
  history is reconstructable
- Dropship receiving: a shipment sent straight to site can be received directly
  to Deployed, producing the same release record without a warehouse round trip

---

### Warehouse Map

- Visual floor plan of the warehouse: aisles, racks and shelves, rendered from
  the `locations` tree
- Click through from a rack to the inventory it holds

---

### Shop Stock Tab

- Standalone shop consumables inventory
- Seeded from Shop-Stock project scope items
- Full parity with main inventory tab (add, edit, delete, par levels)

---

### Locations Tab

- Full warehouse hierarchy management
- **Warehouse Wizard**: guided setup — name warehouse, define tier names (Aisle/Rack/Shelf), set quantities and naming patterns, designate staging locations, generates all location records in one step
- **Tree view** per warehouse: collapsible, shows full location codes
- Add top-tier locations and child nodes manually; suggest sequential names automatically
- Edit location names; delete locations (with cascade and inventory-reference warnings)
- Location codes use `-` as delimiter at all tiers (e.g., `A-1-2`)
- Staging vs. General Stock classification per location
- Stats chips: warehouse count, total location count, staging count

---

## Save / Load Workflow

1. **Load:** On page load, `fetchAllData()` calls `GET /api/data` and populates all in-memory arrays. Falls back to fetching `avprocure-export.xlsx` if the API is unavailable.
2. **Edit:** Make changes in any tab. Every write calls `dbSave()` / `dbDelete()` which immediately hits the REST API. The save state badge reflects in-flight writes.
3. **Export:** The **Export to Excel** button in the status bar builds a fresh workbook via SheetJS and downloads it. The xlsx file is not used for persistence.

> No data is lost on page refresh — all state lives in SQLite.

---

## Mobile Layout

The app is fully responsive, optimized for narrow mobile screens (~374px, Samsung Galaxy Z Fold 6 cover screen).

### Bottom Navigation Bar
Fixed bottom bar at ≤768px with four primary tabs — Map, Inventory, Projects, Orders — plus a **≡ More** dropup that reveals the remaining pages (Front Desk, Pricebook, RMAs, Shop Stock, Locations). Replaces the hamburger menu entirely on mobile.

### Slide-Up Add Form
The add form is hidden behind a **＋ FAB** (floating action button, fixed bottom-right). Tapping slides the form up as a bottom sheet. A backdrop tap or the ✕ FAB closes it. FAB auto-hides on pages with no add form.

### Inventory Filter Bar (Mobile)
Three rows:
1. Stat chips (SKUs / units / serialized / bulk)
2. Aisle | Rack | Shelf — equal-width cascade selects, full width
3. Status dropdown + Search bar — search takes remaining space

### Scan Mode Banner
Full-width green banner under the toolbar: shows sticky location chip (tap to change) and sticky status chip (tap to cycle). Dismissed by ✕ End Scan.

### Viewport
`body` uses `height: 100dvh` (dynamic viewport height) — browser chrome never clips the bottom of the app.

---

## File Hosting

Runs on any PHP 8 host with the `sqlite3` extension.

**Apache:** `.htaccess` rewrites `/api/*` to `api.php`, so the vhost needs `AllowOverride All`.

**Database location:** `api.php` and `auth.php` resolve the database as `../avprocure-data/avprocure.db`, relative to the application directory — deliberately outside the web root, so the file (which holds password hashes) is never reachable over HTTP. The directory must be writable by the web server user; `0770` with the server user as group owner is sufficient, and `chmod 666` on the database is not.

**Re-auth origins:** the popup re-auth flow validates its `postMessage` target against `AVPROCURE_ORIGINS`, a comma-separated environment variable. Set it per deployment, e.g. `SetEnv AVPROCURE_ORIGINS "https://av.example.org"`.

---

## Known Constraints

- `BarcodeDetector` API availability: Chrome on Android and Safari 17+. On unsupported browsers, the scanner falls back to manual text entry.
- Authentication is implemented (session-based, CSRF-protected), but all authenticated users share one SQLite data set — no per-user data isolation
- Single SQLite file — not suitable for high-concurrency multi-user writes (fine for a small team)
- `save.php` is a legacy artifact from the pre-SQLite auto-save workflow (v0.5.11) — it remains on disk but is no longer called by the app

---

## Version Format

```
0 . 5.29.26 . 1
│   └───────┘  └─ Revision number (first update on this date = 1)
│   Date of last update (MM.DD.YY — US format)
└─ Release stage (0 = pre-release; increments to 1.0 on first stable release)
```

---

## Development Notes

- CSS lives in `css/app.css`; JS is split across `js/` modules loaded in order: `core.js` → `data.js` → `inventory.js` → `deploy.js` → `pricebook.js` → `projects.js` → `orders.js` → `rmas.js` → `stock.js` → `locations.js` → `frontdesk.js` → `export.js`. All globals are module-level `let`/`const` declarations in `data.js` and are accessible to all subsequent modules via load order (no ES module syntax, no bundler). Barcode-scanner functions live in `inventory.js` (there is no separate `scanner.js`)
- The `acCtx` object and `acFilter` / `acDoSelect` / `acKey` / `acOpen` functions handle all autocomplete dropdowns; any new autocomplete field requires a context entry in `acCtx`
- `_locCascadeInit` / `_locCascadeT1` / `_locCascadeT2` / `_locCascadeT3` / `_locCascadeSetLeaf` — reusable cascade location picker used in the inventory add form, transfer modal, and inventory filter bar
- Mobile breakpoint: `max-width: 768px`; `.scan-btn` hidden at `min-width: 769px`
- `dbSave(entity, record)` / `dbDelete(entity, id)` — all persistence goes through these; they call the REST API and update the save state badge
- `schema.sql` — static dump of the full DB schema; used as reference only. `api.php` auto-creates all tables via `create_schema()` on first request
- `save.php` — legacy file from the pre-SQLite auto-save workflow; no longer called. Accepts a base64-encoded xlsx body and writes it atomically to `avprocure-export.xlsx`. Retained for reference only

---

## Roadmap

| Item | Status |
|---|---|
| SQLite persistence via REST API | **Complete** (v0.6.0.26.1) |
| Mobile-responsive layout | **Complete** (v0.5.11.26.1) |
| 3-tier cascading location picker (add form + transfer modal) | **Complete** (v0.5.14.26.1) |
| 3-tier cascading location filter bar | **Complete** (v0.5.14.26.1) |
| Scan Mode (sticky location/status for warehouse walks) | **Complete** (v0.5.14.26.1) |
| Mobile barcode / camera scanner | **Complete** (v0.5.14.26.1) |
| "Add to Pricebook?" inline prompt during inventory add | **Complete** (v0.5.14.26.1) |
| Persistent save state badge | **Complete** (v0.5.14.26.1) |
| Filter-to-form pre-fill | **Complete** (v0.5.14.26.1) |
| Location code delimiter standardization (`-`) | **Complete** (v0.5.14.26.1) |
| Session-based authentication + admin panel | **Complete** (v0.5.29.26.1) |
| Clients table + project client linkage | **Complete** (v0.5.29.26.1) |
| Inventory table pagination (50 groups/page) | **Complete** (v0.6.3.26.2) |
| Inventory render performance (location optgroup cache, project Map, sort key precompute, filter debounce) | **Complete** (v0.6.3.26.2) |
| Refactor to multi-file layout (css/app.css + js/ modules) | **Complete** (v0.6.3.26.2) |
| Front Desk tab: Clients, Invoices (+payments), Vendor Bills (+payments) | **Complete** (v0.7.x) |
| Invoices schema + API + UI (invoices, invoice_items, invoice_payments) | **Complete** |
| Vendor Bills schema + API + UI (vendor_bills, vendor_bill_items, vendor_bill_payments) | **Complete** |
| Project types (`job` / `stock` / `outbound`) — Phases 0–3 | **Complete** (v0.7.20.26.6) |
| Pallet manifest export + outbound "Mark Pallet Shipped" + `Sold` terminal state | **Complete** (v0.7.20.26.6) |
| Deployment cart → release manifest → approve (paper trail) | **Complete** (v0.7.27.26.2) |
| Saved (named) server-side deployment carts | **Complete** (v0.7.28.26.6) |
| Inventory pick list (printable pull-sheet from checked rows) | **Complete** (v0.7.28.26.4) |
| Change-status / undeploy modal on inventory rows | **Complete** (v0.7.29.26.1) |
| Purchase cost history view (+ received-line cost lock) | **Complete** (v0.7.23.26.6) |
| Cancelled POs excluded from scope "on PO" figures | **Complete** (v0.7.23.26.2) |
| PO PDF export (formatted, print-ready; priced + no-prices pick list w/ serials) | **Complete** (v0.7.23.26.x) |
| Warehouse map: clickable aisle / rack / shelf inventory links | **Complete** (v0.7.23.26.3) |
| Project types — Phase 4 (real stock locations, catalog reorder targets, SKU-grouped stock tab) | Planned |
| Project types — Phase 5 (outbound shipment carrier/tracking via `shipments.projectId`) | Planned |
| Mobile work cart — Phase A blip resilience (queue failed writes, retry on reconnect) | Planned (ships independently) |
| Mobile work cart — Phases B–D (cart UI, kiosk session, label printing, offline) | On hold (hardware cost) |
| Improved barcode detection reliability | Ongoing |
| Warehouse map: geometry for the 35 racks the SVG omits (aisles M/N/O, etc.) | Planned |
| eBay Listings / eBay Inventory Checklist tab integration | Planned |
| Shop-Stock full import integration | Planned |
| Google Sheets integration (replace local SQLite for multi-site use) | Future consideration |

---

## License

No open-source licence is granted. This repository is published as a portfolio
and demonstration piece: you are welcome to read it, run it, and evaluate it.
All rights are reserved by the author, and it is not licensed for reuse or
redistribution. If you want to use any of it, get in touch.
