#!/usr/bin/env bash
# Sauvegarde de la base SQLite de La Foulée.
#
# - Copie *cohérente* à chaud via l'API de sauvegarde SQLite (`.backup`) :
#   jamais un simple `cp` d'une base en cours d'écriture.
# - Contrôle d'intégrité de la copie, compression, rotation (14 jours).
# - Copie hors du serveur si BACKUP_REMOTE est défini (rsync/ssh), sinon la
#   sauvegarde reste sur le même disque que la base — insuffisant seul.
#
# Variables (toutes facultatives) :
#   FOULEE_DB       base à sauvegarder   (défaut /opt/foulee/prisma/dev.db)
#   BACKUP_DIR      dossier local        (défaut /var/backups/foulee)
#   BACKUP_KEEP     jours conservés      (défaut 14)
#   BACKUP_REMOTE   cible rsync, ex. "backup@nas.maison:/srv/foulee/"
set -euo pipefail

DB="${FOULEE_DB:-/opt/foulee/prisma/dev.db}"
DIR="${BACKUP_DIR:-/var/backups/foulee}"
KEEP="${BACKUP_KEEP:-14}"
STAMP="$(date +%Y-%m-%d_%H%M)"
OUT="$DIR/foulee-$STAMP.db"

command -v sqlite3 >/dev/null || { echo "sqlite3 manquant : sudo apt install sqlite3" >&2; exit 1; }
[ -f "$DB" ] || { echo "Base introuvable : $DB" >&2; exit 1; }
mkdir -p "$DIR"
chmod 700 "$DIR"

sqlite3 "$DB" ".timeout 10000" ".backup '$OUT'"
if [ "$(sqlite3 "$OUT" 'PRAGMA integrity_check;')" != "ok" ]; then
  echo "Copie corrompue : $OUT" >&2
  rm -f "$OUT"
  exit 1
fi
gzip -9 "$OUT"
chmod 600 "$OUT.gz"

find "$DIR" -name 'foulee-*.db.gz' -mtime +"$KEEP" -delete

if [ -n "${BACKUP_REMOTE:-}" ]; then
  rsync -a --delete "$DIR/" "$BACKUP_REMOTE"
fi

echo "Sauvegarde OK : $OUT.gz ($(du -h "$OUT.gz" | cut -f1))"
