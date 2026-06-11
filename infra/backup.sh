#!/usr/bin/env bash
# Nightly backup for Loaded-Out: Postgres + Mongo dumps with 14-day rotation.
# Cron: 20 3 * * * /home/pehlacloud/projects/loaded-out/infra/backup.sh >> /home/pehlacloud/backups/loadedout/backup.log 2>&1
set -euo pipefail

BACKUP_DIR="/home/pehlacloud/backups/loadedout"
STAMP=$(date +%Y%m%d_%H%M%S)
KEEP_DAYS=14

mkdir -p "$BACKUP_DIR"

echo "[$(date -Is)] starting backup $STAMP"

# Postgres — custom format (compressed, restorable with pg_restore)
docker exec infra-db-1 pg_dump -U lifeplan_user -d lifeplan_db -Fc \
  > "$BACKUP_DIR/pg_${STAMP}.dump"

# Mongo — archive format
docker exec infra-mongo-1 mongodump --archive --quiet --db lifeplan \
  > "$BACKUP_DIR/mongo_${STAMP}.archive"

# Sanity: refuse silently-empty dumps
[ -s "$BACKUP_DIR/pg_${STAMP}.dump" ] || { echo "ERROR: empty pg dump"; exit 1; }

# Rotate
find "$BACKUP_DIR" -name 'pg_*.dump' -mtime +$KEEP_DAYS -delete
find "$BACKUP_DIR" -name 'mongo_*.archive' -mtime +$KEEP_DAYS -delete

echo "[$(date -Is)] backup done: $(du -h "$BACKUP_DIR/pg_${STAMP}.dump" | cut -f1) pg, $(du -h "$BACKUP_DIR/mongo_${STAMP}.archive" | cut -f1) mongo"
