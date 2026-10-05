# AVProcure Design Note — Project Types (`job` / `stock` / `outbound`)

**Status:** Proposed · **Author:** design discussion, 2026-07-20 · **Decision:** Option A (typed project)

---

## 1. Context & problem

`projects` has quietly become a **generic container of scope + inventory**, and three
distinct *subtypes* now ride on it:

- **Client AV job** — the original use (procure → install → invoice a client).
- **Shop-stock** — the shop's own pooled inventory (consumables + spares/returns).
- **Outbound pallet** — equipment leaving the building for resale/e-waste (compensation in).

Today these are told apart by fragile means, which has produced real defects:

- Shop-stock is detected by the string `projectName === 'shop-stock'` (js/orders.js
  `finalizeReceive`). Rename the project and receiving silently changes behavior.
- Received shop-stock is force-tagged `projectId=''`, `location='Stock'` — so it can never
  link to its own scope, its scope lines look permanently unfilled, and it reappears in the
  PO picker. (`'Stock'` is a magic string, not a real location; those rows are off the map.)
- The Shop Stock tab hides ~81% of stock because `isStockItem` checks `invStatus ∈ {On Hand,
  Out of Stock}` while `finalizeReceive` writes `invStatus='In Stock'`.
- Outbound pallets are just ordinary projects, so they **pollute client reporting** (all 26
  projects counted together; `contractValue` is 0 on every one), and their inventory never
  leaves the on-hand/available pool when the pallet ships.

**Goal:** one coherent model — a `type` dimension on `projects` — that *shares* all existing
machinery (scope fill, allocate, transfer, invoice, manifest) while *branching* reporting and
inventory behavior by type. This is the well-worn ERP pattern of a common header with a
document type. It is not a quick fix, and it is not a dead end: if outbound ever grows its own
complex lifecycle (compliance certificates, multi-pallet shipments, per-disposal margins),
typed-project rows promote cleanly into a dedicated module later.

---

## 2. The model

Add **`projects.type`** with three values:

| type | meaning | inventory behavior | invoiced? | in client reporting? |
|---|---|---|---|---|
| `job` (default) | client AV project | Allocated → Deployed | yes (client) | yes |
| `stock` | shop's own inventory pool | pooled & **available** to jobs | no | no |
| `outbound` | a pallet/disposition leaving | terminal (`Sold`) on ship | yes (buyer) | no |

One column drives four things: **reporting exclusion**, **invoice-picker eligibility**,
**inventory availability**, and **lifecycle vocabulary**.

---

## 3. Schema changes (minimal)

1. `projects.type TEXT DEFAULT 'job'` — add to `create_schema()` **and** the migration list
   in `api.php`.
2. `shipments.projectId TEXT` (nullable) — today `shipments` require a `poNumber`; this lets
   carrier/tracking attach to an outbound pallet. Add to schema + migrations.
3. New allowed `inventory.invStatus` value **`Sold`** (a.k.a. "Shipped Out") — no column
   change, just a new terminal state.
4. *(Optional, later)* a per-SKU reorder target on `catalog` (e.g. `parTarget REAL`) for
   consumables — see §5. `inventory.par` is currently used on **0 rows** and is misplaced
   (a SKU in two aisles = two records; which holds the par?).

All additive, all backward-compatible. **Snapshot the DB (VACUUM INTO) before any migration.**

---

## 4. Behavior by type

### 4.1 Availability — the crux (`js/projects.js` lines ~511, ~970)
Today allocation requires `!inv.projectId`. New rule:

> **available** = not committed to a `job` **and** not terminal
> ≈ `(!inv.projectId || projectOf(inv).type === 'stock') && invStatus ∉ {Deployed, Sold, Returned}`

This lets shop-stock (owned by the `stock` project) be allocatable to jobs, while a job's
Allocated units are not — and it is the pivot the whole model turns on.

### 4.2 Shop-stock (`type='stock'`)
- Replace `isShopStock = projectName==='shop-stock'` with a **type check**.
- Received stock is owned by the stock project (real `locationId` in its actual aisle) — retire
  the `location='Stock'` magic string; stock items rejoin the location hierarchy and the map.
- `isStockItem` stays **physical** — `location='Stock'` OR an On-Hand/Out-of-Stock status —
  NOT ownership-based. (Phase 2 verification disproved the original "ownership-based" plan:
  the stock project also owns *deployed/allocated* equipment that must NOT appear on the Shop
  Stock tab. Ownership is used for allocation availability, not tab membership.) The fix that
  resolved the invisible-stock bug was dropping the "empty invStatus" guard from the location
  clause so `In Stock` items at the Stock location show. Ownership (`projectId = stock project`)
  is a separate concern used by the allocation-availability filters (`!projectId ||
  isStockProjectId`). Retiring `location='Stock'` for real locations is deferred to Phase 4.
- Reorder target → `catalog` (per SKU), opt-in; that flag *is* the consumable/asset
  distinction. Tab **groups by SKU** (OH = `SUM(qty)` of uncommitted); reorder =
  `target − OH − onOrder` via the existing scope math.

### 4.3 Outbound (`type='outbound'`)
- Pallet = an `outbound` project; **buyer = its `clientId`**.
- Contents = scope, filled by serialized/bulk inventory (exactly as PreLovd-Pallet1 already is).
- **Manifest** = existing `exportPalletManifest()`.
- **Compensation** = invoice to the buyer via Front Desk invoice-from-scope (AR). Already works
  (PreLovd scope sums to $5,269). Note: this is *asset-disposal income*, not project revenue —
  fine in the invoice model; may want an accounting tag later.
- **"Mark Pallet Shipped" action** — the inverse of `finalizeReceive`. For each filled unit:
  set `invStatus='Sold'`, stamp a ship date, and log a `transfers` row to a "shipped out"
  sentinel for audit; set project `status='Complete'`; optionally attach a `shipment`
  (carrier/tracking) via `shipments.projectId`. Sold units leave on-hand + availability.

### 4.4 Reporting / UI
- Project stats/chips, the projects list, and the Front Desk **invoice project-picker** filter
  to `type='job'` (or render types in separate sections).
- Stock and Outbound get their own filtered views (the Shop Stock tab keys off `type='stock'`;
  an Outbound view lists `type='outbound'` pallets).

---

## 5. Inventory lifecycle (states)

```
available pool   Unallocated · In Stock · On Hand
committed to job Allocated · Staged
terminal (gone)  Deployed (installed at client)  ·  Sold (disposed/outbound)  ·  Returned
```

Terminal states are excluded from on-hand counts and from availability. `Sold` is kept
**distinct from `Deployed`** so e-waste disposal can be reported/margined separately from
client installs.

---

## 6. Connections to the rest of the DB

| Entity | Effect |
|---|---|
| `project_items` (scope) | unchanged — fill/manifest already read it |
| `inventory` | gains `Sold` terminal state; availability rule updated |
| `invoices` | outbound comp = AR from buyer; `stock` never client-invoiced (type filter) |
| `transfers` | gains a "shipped out" sink for the outbound audit trail |
| `shipments` | `+projectId` so tracking can attach to a pallet (today PO-only) |
| `orders` / `vendor_bills` | unaffected; a `stock` project's POs are overhead purchasing |
| `catalog` | optional per-SKU reorder target for consumables |
| `clients` | doubles as outbound "buyer"; otherwise unchanged |

---

## 7. Phased rollout (deliberate, each phase independently shippable & reversible)

- **Phase 0 — Schema.** Add `projects.type` (default `job`) and `shipments.projectId`.
  Backfill: Shop-Stock → `stock`; existing pallets (PreLovd-Pallet1) → `outbound`. Snapshot first.
- **Phase 1 — Reporting filter.** Exclude non-`job` types from client stats/lists/invoice-picker.
  Low risk, immediate clarity.
- **Phase 2 — Availability + shop-stock detection.** New availability rule; retire the
  `shop-stock` name match and `location='Stock'`.
- **Phase 3 — Outbound terminal state + ship action.** Add `Sold`; build "Mark Pallet Shipped";
  transfers sink.
- **Phase 4 — Stock cleanup.** Real locations for the 21 current stock rows (needs human
  knowledge — not automatable); catalog reorder targets; SKU-grouped tab; retire `isStockItem`
  heuristic.
- **Phase 5 — Outbound tracking.** `shipments.projectId` UI (carrier/tracking on a pallet).

No big-bang; the model is usable after Phase 1.

---

## 8. Deliberately avoided

- **No parallel outbound/disposition tables** — would duplicate scope, fill, invoice, and the
  manifest that already work.
- **No name-string hacks** — type is explicit and stable.

---

## 9. Open questions (decide before/within the relevant phase)

1. **Consumables on client scopes** (11 exist today). If a client-scope line for zip ties never
   gets inventory-linked, it shows "needs ordering" forever (same symptom class as the legacy project-tag
   bug). Do consumable scope lines get exempted from fill-tracking, or auto-satisfied? *This is
   the one genuine fork.*
2. **`Sold` vs reuse `Deployed`** — recommend a distinct `Sold` for disposal reporting.
3. **Assigning real locations** to the current 21 `location='Stock'` rows needs human knowledge.
