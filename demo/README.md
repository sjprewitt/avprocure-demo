# AVProcure — demo dataset

Builds a complete, fully populated AVProcure database from invented data, for
demonstrating the application without exposing customer, pricing or vendor
information from any live installation.

```bash
./build.sh                     # -> avprocure-demo.db
./build.sh /tmp/other-name.db  # or build somewhere else
```

## What it does

| Step | Script | Notes |
|---|---|---|
| 1. Schema | `build-schema.php` | Extracts `create_schema()` from `../api.php` at run time and executes it, so the demo schema can never drift from the real one. |
| 2. Data | `seed-demo.py` | Generates the dataset. Deterministic — same seed, same database. |
| 3. Login | `create-admin.php` | Creates the `users` table and one admin account. Password is set at the top of that file. |

## Data provenance

Nothing is read from, copied from, or derived from a production database.
Manufacturer and model names are real and public; **all pricing is invented**,
and all clients, sites, projects, vendors, addresses, contacts, serial numbers
and tracking numbers are fictional.

## What the dataset is shaped to demonstrate

- **Scope coverage** — scope lines are generated *from* each project's real order
  and receipt history, so Filled / Partial / Pending reflect a believable supply
  chain rather than random pairings. This is the application's central feature.
- **Procurement lifecycle** — POs across Draft / Submitted / Backorder / Received,
  with partial receipts driving Backorder status.
- **Warehouse** — a full aisle/rack/shelf tree, with inventory distributed across
  it, plus a shop-stock pool with par levels so the reorder report is meaningful.
- **Deployment** — release records with per-unit transfer logs, so manifests print.
- **Front Desk** — clients → work sites → projects, with invoices, payments,
  vendor bills and inbound shipments.
- **RMAs** — returns across all four types and every status.

## Running a demo instance

The application reads `../avprocure-data/avprocure.db` relative to its own
directory. To stand up a demo copy:

```bash
git clone <this repo> /srv/avprocure-demo
mkdir -p /srv/avprocure-data
cp demo/avprocure-demo.db /srv/avprocure-data/avprocure.db
```

Point a vhost at `/srv/avprocure-demo` and log in with the account from
`create-admin.php`. Keep the demo instance on a separate database path from any
production copy.
