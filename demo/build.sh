#!/bin/bash
# Build a complete AVProcure demo database from scratch. No production data is
# read, copied or required at any point.
set -euo pipefail
cd "$(dirname "$0")"
DB="${1:-avprocure-demo.db}"
rm -f "$DB"
php build-schema.php  "$DB"
python3 seed-demo.py  "$DB"
php create-admin.php  "$DB"
echo
echo "Done: $(pwd)/$DB"
