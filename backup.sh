#!/bin/bash

# Mailikan Backup Script
# Sichert Benutzerdaten und E-Mail-Konfigurationen

set -e

# Konfiguration
BACKUP_DIR="/opt/mailikan/backups"
DATA_DIR="/opt/mailikan/data"
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_NAME="mailikan_backup_${DATE}"
RETENTION_DAYS=30

# Farben für Output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

echo_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

echo_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Backup-Verzeichnis erstellen
mkdir -p "${BACKUP_DIR}"

echo_info "Starting backup process..."

# Backup erstellen
cd /opt/mailikan
tar -czf "${BACKUP_DIR}/${BACKUP_NAME}.tar.gz" \
    --exclude='node_modules' \
    --exclude='*.log' \
    --exclude='backups' \
    data/ \
    package.json \
    server.js \
    services/ \
    public/ \
    ecosystem.production.config.js \
    mailikan.service

if [ $? -eq 0 ]; then
    echo_info "Backup created successfully: ${BACKUP_NAME}.tar.gz"
    
    # Backup-Größe anzeigen
    BACKUP_SIZE=$(du -h "${BACKUP_DIR}/${BACKUP_NAME}.tar.gz" | cut -f1)
    echo_info "Backup size: ${BACKUP_SIZE}"
else
    echo_error "Backup creation failed!"
    exit 1
fi

# Alte Backups löschen (älter als RETENTION_DAYS)
echo_info "Cleaning up old backups (older than ${RETENTION_DAYS} days)..."
find "${BACKUP_DIR}" -name "mailikan_backup_*.tar.gz" -type f -mtime +${RETENTION_DAYS} -delete

# Backup-Status anzeigen
BACKUP_COUNT=$(ls -1 "${BACKUP_DIR}"/mailikan_backup_*.tar.gz 2>/dev/null | wc -l)
echo_info "Total backups available: ${BACKUP_COUNT}"

# Optional: Backup zu Remote-Server senden
# Uncomment und anpassen falls gewünscht:
# REMOTE_HOST="backup-server.example.com"
# REMOTE_USER="backup"
# REMOTE_DIR="/backups/mailikan"
# 
# echo_info "Uploading backup to remote server..."
# scp "${BACKUP_DIR}/${BACKUP_NAME}.tar.gz" "${REMOTE_USER}@${REMOTE_HOST}:${REMOTE_DIR}/"

echo_info "Backup process completed successfully!"

# Log-Eintrag für Systemd Journal
logger -t mailikan-backup "Backup completed: ${BACKUP_NAME}.tar.gz"
