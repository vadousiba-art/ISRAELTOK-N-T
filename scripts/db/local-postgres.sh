#!/usr/bin/env bash
# Starts a throwaway local Postgres that behaves like Neon for testing:
# the app connects as a NON-superuser owner role ("neondb_owner"), exactly the
# privilege level Neon gives you. Creates three databases:
#   yoru_test    for `TEST_DATABASE_URL=... npm test`
#   yoru_source  stands in for the Supabase database in a migration rehearsal
#   yoru_target  stands in for the Neon database in a migration rehearsal
#
#   bash scripts/db/local-postgres.sh          # start (idempotent)
#   bash scripts/db/local-postgres.sh stop
#
# Needs the Postgres 16+ server binaries (apt install postgresql). Local only:
# trust authentication on 127.0.0.1, data in the postgres user's home.
set -euo pipefail
PORT="${PGPORT_LOCAL:-54329}"
BIN="$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)"
RUN_AS="postgres"
DATA="$(getent passwd "$RUN_AS" | cut -d: -f6)/yoru-local-pg"
as_pg() { if [ "$(id -un)" = "$RUN_AS" ]; then bash -c "$1"; else su "$RUN_AS" -s /bin/bash -c "$1"; fi; }

if [ "${1:-start}" = "stop" ]; then
  as_pg "$BIN/pg_ctl -D '$DATA' stop -m fast" || true
  exit 0
fi
if [ ! -d "$DATA" ]; then
  as_pg "$BIN/initdb -D '$DATA' -A trust -U postgres >/dev/null"
fi
if ! as_pg "$BIN/pg_ctl -D '$DATA' status" >/dev/null 2>&1; then
  as_pg "$BIN/pg_ctl -D '$DATA' -o '-p $PORT -k /tmp -c listen_addresses=127.0.0.1' -l '$DATA/server.log' -w start" >/dev/null
fi
P="psql -h 127.0.0.1 -p $PORT -U postgres -v ON_ERROR_STOP=1 -qtA"
$P -c "select 1 from pg_roles where rolname='neondb_owner'" | grep -q 1 || \
  $P -c "create role neondb_owner login createrole createdb nosuperuser"
for db in yoru_test yoru_source yoru_target; do
  owner=neondb_owner; [ "$db" = yoru_source ] && owner=postgres
  $P -c "select 1 from pg_database where datname='$db'" | grep -q 1 || {
    $P -c "create database $db owner $owner"
    $P -d "$db" -c "alter schema public owner to $owner"
  }
done
echo "local Postgres on 127.0.0.1:$PORT"
echo "  TEST_DATABASE_URL=postgres://neondb_owner@127.0.0.1:$PORT/yoru_test"
echo "  source (Supabase stand-in): postgres://postgres@127.0.0.1:$PORT/yoru_source"
echo "  target (Neon stand-in):     postgres://neondb_owner@127.0.0.1:$PORT/yoru_target"
