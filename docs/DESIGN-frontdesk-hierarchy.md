# AVProcure Design Note — Front Desk Hierarchy (Client → Location → Project)

**Status:** Phases 0–3 implemented (v0.8.11.26.1); Phases 4–5 open · **Author:** design discussion, 2026-08-10 · **Decision:** three-level nested tree, QBO-aligned

---

## 1. Context & problem

Front Desk today is a **flat client list**. Each client links to projects via a single
`projects.clientId` foreign key — a **two-level** model (Client → Project). Real accounts don't
fit that: one client can own **several physical work sites** (a primary home, a lake house, an
office), and each site can run **several parallel projects** (Network, Theater, Lighting, Service,
Change Order).

The target shape is a **three-level nested tree**, expandable with disclosure arrows:

```
▸ Client
   ▸ Location (work site)
        Project 1
        Project 2
        Service
        Change Order
```

This is not a cosmetic choice. The reference screenshot that motivated it is the **QuickBooks
Online Customers list**, which models exactly this as **Customer → sub-customer → sub-customer**,
with invoices attachable at any level. Building Front Desk in this shape makes the eventual QBO
sync (see `DESIGN-quickbooks` thinking / §7) a near-1:1 mapping instead of a reshaping job.

---

## 2. The model

Insert one new level **between** clients and projects:

| Level | Table | Parent FK | QBO object |
|---|---|---|---|
| 1 — Client | `clients` (existing) | — | Customer (top) |
| 2 — Location / work site | **`client_locations`** (new) | `clientId` | sub-customer |
| 3 — Project | `projects` (existing) | **`clientLocationId`** (new column) | sub-customer (leaf) |

> **Naming decision — read this.** The user asked for consistent naming (`clients` /
> `clientLocations` / `clientProjects`). The middle table **is** named `client_locations`
> (JS entity `clientLocations`). The leaf level **keeps the name `projects`** rather than becoming
> `clientProjects`, because `projects` is referenced in 20+ JS call sites plus the API entity map
> and carries all the scope / PO / inventory-link / deployment / invoice machinery — a rename is a
> large, risky refactor for a cosmetic gain. Instead the relationship is made legible through the
> **foreign-key name**: `projects.clientLocationId`. The schema then reads top-to-bottom as
> `clients ← client_locations (clientId) ← projects (clientLocationId)`, so the linkage is obvious
> without touching the leaf table's name. (Revisit only if the rename is later judged worth it.)

**Why not one self-referential table?** QBO itself uses a single `Customer` table with a
`ParentRef` chain. We deliberately do **not** mirror that locally: `projects` is a heavyweight,
deeply-wired entity (typed job/stock/outbound, scope fill, POs, deployment). Keep it distinct and
**flatten the three levels into QBO Customers at sync time**, not in our schema.

---

## 3. Schema changes (minimal, additive)

1. **New table `client_locations`:**
   ```sql
   CREATE TABLE IF NOT EXISTS client_locations (
       id        TEXT PRIMARY KEY,
       clientId  TEXT NOT NULL,
       name      TEXT NOT NULL,
       street    TEXT, city TEXT, state TEXT, zip TEXT,
       phone     TEXT,
       notes     TEXT,
       isDefault INTEGER DEFAULT 0,     -- the auto-created "Main" site
       qbId        TEXT,                -- QBO sub-customer id (reserved)
       qbSyncToken TEXT                 -- QBO optimistic-concurrency token (reserved)
   );
   ```
   Add to `create_schema()` **and** register the entity in `api.php` (entity map, pk map, GET/data).

2. **`projects.clientLocationId TEXT`** — new column (schema + migration list). Authoritative link
   to the parent site; the client is derived via `client_locations.clientId`.

3. **Reserve QBO mapping columns now** (cheap now, painful to retrofit) on all three levels:
   `clients`, `client_locations`, `projects` each gain `qbId` + `qbSyncToken`.

4. `projects.clientId` — **kept during migration** for safety, but `clientLocationId` becomes the
   source of truth. Audit the 20+ `project.clientId` reads (§6) and migrate them to derive through
   the location. Consider dropping `clientId` only after all readers are converted (a later phase).

All additive, all backward-compatible. **Snapshot first** (`VACUUM INTO backup/avprocure-YYYY-MM-DD-pre-fd-hierarchy.db`).

---

## 4. Auto-create template ("Main" folder) + backfill

Decided: on client creation (and when backfilling existing clients), auto-scaffold a starter tree
so nothing is orphaned and the user reorganizes later.

**New-client scaffold:**
- 1 `client_locations` row named **"Main"** (`isDefault=1`), seeded from the client address.
- Under that location, auto-create **three sibling project folders** at the same level —
  **Main**, **Change Order**, **Service** — each an empty `projects` row sharing that location's
  `clientLocationId`. (They are siblings under the Location, NOT nested under the Main project;
  a project is a leaf and holds no child projects.)

**Backfill of existing data (one-time migration):**
- For each existing client → create one default **"Main"** location.
- **Reparent** all that client's existing projects (those with `clientId = c.id`) under it by
  setting `clientLocationId`.
- Also auto-create the empty **Service** and **Change Order** projects per client.
- Projects with **no** `clientId` today stay unassigned (they surface under the default client /
  an "Unassigned" node, matching current behavior).

---

## 5. The Shop as a client (accounting visibility)

Decided: the shop's own inventory/operations must be visible to the accountant **inside the same
client tree**, not hidden in a separate view. Map it onto the existing seeded default client:

```
House Account (client — the existing isDefault shop-owner seed)
  └─ Shop (client_location)
       ├─ shop-stock   (project, type=stock)
       ├─ shop-ops     (project)
       └─ shop-other   (project)
```

- Reuse the existing **`isDefault`** shop-owner client (rename to taste).
- `shop-stock` keeps `type='stock'` so its inventory stays **pool-available to jobs** — the tree
  parentage (`clientLocationId`) is purely additive and does **not** change inventory behavior.
- `shop-ops` / `shop-other` are new sibling projects for non-stock shop overhead.
- **Bonus:** once shop projects are identified by tree membership + `type`, we can retire the
  fragile `project.name === 'shop-stock'` string match that currently drives `getStockItems()`
  (js/stock.js) and `finalizeReceive()` (js/orders.js) — the exact fragility flagged in
  `DESIGN-project-types.md` §1. (Retirement is a follow-up phase, not required for the tree.)

`type='outbound'` pallets are **not** covered by the user's decision yet — left as an open question
(§9): likely their own pseudo-client or a "Disposition" node later.

---

## 6. UI — reuse the Locations tree, don't reinvent it

The **warehouse Locations tab already implements this exact interaction**: a collapsible,
disclosure-arrow tree with expand-state preservation and cascade-delete warnings. Reuse the
pattern — `renderFDClientsTable` (today a flat `<tr>` list) becomes a 3-level tree built the way
`renderLocPage` / `locShowWarehouseDetail` build the warehouse tree, borrowing:

- `locToggleNode` → per-node expand/collapse
- `locExpandAll` / `locCollapseAll`
- `locCaptureExpanded` / `locRestoreExpanded` → keep the tree open across re-renders
- cascade-delete confirmation (deleting a client warns about its locations → projects → scope)

**Call sites to update** (the `project.clientId` readers to migrate to location-derived lookups):
- `renderFDClientsTable` (project count per client) — now count through locations
- `renderClientDetailProjects`, `openFDClientDetail`, `unlinkProjectFromClient`
- `openAddProjectToClient` / `confirmLinkExistingProject` / `confirmNewProjectForClient`
  (linking a project now targets a **location**, not a client directly)
- `populateProjClientSelects` and the Projects-tab client column
- `npoClientAddr` / default-client address resolution in js/orders.js

**New actions needed:** add/edit/delete Location under a client; move a project between locations;
add project under a location (replaces "add project to client").

---

## 7. QBO alignment (the payoff — next initiative, not this one)

At sync time the three local levels flatten into a QBO **Customer / sub-customer** chain via
`ParentRef`:

| AVProcure | QBO |
|---|---|
| `clients` row | Customer (top), `qbId` stored back |
| `client_locations` row | sub-customer, `ParentRef` = client's `qbId` |
| `projects` row | sub-customer (leaf), `ParentRef` = location's `qbId` |
| `invoices` (attached to a project's scope) | Invoice on the leaf sub-customer |
| `vendor_bills` | Bill (vendor side — separate; see QBO note) |

QBO allows up to ~4 sub-levels, so Client → Location → Project (3) fits comfortably. Each level
carries `qbId` + `qbSyncToken` (reserved in §3) for idempotent push and update concurrency.
**Deferred QBO-phase decision (no input needed now):** invoice each project (leaf) standalone and
roll up to the client for reporting (`BillWithParent`) — matches how AVProcure already invoices
per-project. This becomes a checkbox when the sync is built.

---

## 8. Phased rollout (each phase independently shippable & reversible)

- **Phase 0 — Schema.** Add `client_locations` table + `projects.clientLocationId`; reserve
  `qbId`/`qbSyncToken` on all three levels; register the entity in `api.php`. Snapshot first.
- **Phase 1 — Backfill.** Migration: one default "Main" location per client; reparent existing
  projects; auto-create empty Service / Change Order. Set up House Account → Shop → shop projects.
- **Phase 2 — Tree UI.** Rebuild Front Desk clients view as the 3-level collapsible tree (reusing
  the Locations tree pattern); migrate the `clientId` readers to location-derived lookups; new
  add/edit/delete/move actions.
- **Phase 3 — New-client scaffold.** Auto-create the Main location + Main/Service/Change Order
  projects on client creation.
- **Phase 4 — Retire fragile shop detection.** Key shop-stock off tree membership + `type`,
  removing the `name === 'shop-stock'` string matches (ties into `DESIGN-project-types.md` Phase 2/4).
- **Phase 5 — QBO sync.** Separate initiative; the schema from Phase 0 already reserves the hooks.

The model is usable after Phase 2; QBO is a clean bolt-on afterward.

---

## 9. Open questions

1. **Outbound pallets** (`type='outbound'`) — do they get a home in the client tree (own
   pseudo-client / "Disposition" node), or stay in a separate view? Not covered by the shop
   decision.
2. **Dropping `projects.clientId`** — keep the denormalized column indefinitely for convenience, or
   remove it once all readers derive through the location? (Recommend: remove after Phase 2 verified.)
3. **Service / Change Order as auto-projects vs. a project `type`** — currently modeled as ordinary
   empty projects (decided). If they later need distinct behavior, promote to `projects.type` values.
4. **`BillWithParent`** (QBO) — deferred to the sync phase; default is per-project invoicing with
   client-level rollup reporting.

---

## 10. Deliberately avoided

- **No self-referential `customers` table** — would force `projects` (heavyweight, typed) into a
  generic node and lose its machinery. Flatten to QBO at sync time instead.
- **No rename of `projects` → `clientProjects`** — cosmetic gain, large blast radius; the FK name
  `clientLocationId` carries the relationship instead.
- **No overloading the existing `locations` table** — that is *warehouse geography* (aisle/rack/
  shelf, the map). The client work-site level is a distinct table, `client_locations`.
