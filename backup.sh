#!/bin/bash

# Mailikan Backup Script
BACKUP_DIR="/home/user/mailikan-backups"
APP_DIR="/home/user/Mailikan"
DATE=$(date +%Y%m%d_%H%M%S)

# Backup-Verzeichnis erstellen
mkdir -p $BACKUP_DIR

# Daten sichern
tar -czf $BACKUP_DIR/mailikan_backup_$DATE.tar.gz -C $APP_DIR data/ .env

# Alte Backups löschen (älter als 30 Tage)
find $BACKUP_DIR -name "mailikan_backup_*.tar.gz" -mtime +30 -delete

echo "Backup erstellt: mailikan_backup_$DATE.tar.gz"
