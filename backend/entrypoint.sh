#!/bin/sh
set -e

echo "[Entrypoint] Waiting for database..."
# health-check: poll until postgres accepts connections
until python -c "
import os, psycopg2
psycopg2.connect(
    dbname=os.environ['POSTGRES_DB'],
    user=os.environ['POSTGRES_USER'],
    password=os.environ['POSTGRES_PASSWORD'],
    host=os.environ['POSTGRES_HOST'],
    port=os.environ['POSTGRES_PORT'],
)
" 2>/dev/null; do
  sleep 1
done
echo "[Entrypoint] Database is ready."

echo "[Entrypoint] Applying migrations..."
python manage.py migrate --noinput
echo "[Entrypoint] Migrations done."

exec "$@"
