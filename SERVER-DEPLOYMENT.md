# Mailikan Server Deployment Guide

## Schnell-Deployment direkt auf dem Server

### 1. Auf Server einloggen
```bash
ssh christopher@194.55.13.83
```

### 2. Deployment-Script herunterladen und ausführen
```bash
# Script von GitHub herunterladen
wget -O deploy.sh https://raw.githubusercontent.com/Plobli/Mailikan/main/deploy.sh

# Script ausführbar machen
chmod +x deploy.sh

# Domain anpassen (optional - vor dem Ausführen)
nano deploy.sh
# Ändern Sie: DOMAIN="your-domain.com" zu Ihrer echten Domain

# Deployment starten
./deploy.sh production
```

### 3. Das Script macht automatisch:
- ✅ Repository von GitHub klonen
- ✅ Node.js installieren
- ✅ PM2 installieren
- ✅ Dependencies installieren
- ✅ Anwendung starten
- ✅ Caddy konfigurieren
- ✅ SSL einrichten

### 4. Updates deployen
```bash
cd /opt/mailikan
./deploy.sh production
```

## Alternative: Ein-Liner Deployment

Für komplett automatisches Deployment:
```bash
curl -fsSL https://raw.githubusercontent.com/Plobli/Mailikan/main/deploy.sh | bash
```

## Troubleshooting

### Permissions-Probleme
```bash
sudo chown -R christopher:christopher /opt/mailikan
```

### Service-Status prüfen
```bash
# PM2 Status
pm2 status

# Systemd Status
sudo systemctl status mailikan

# Caddy Status
sudo systemctl status caddy
```

### Logs anzeigen
```bash
# Application Logs
pm2 logs mailikan

# Caddy Logs
sudo tail -f /var/log/caddy/mailikan.log

# System Logs
journalctl -u mailikan -f
```

### Ports prüfen
```bash
# Prüfen ob Port 3000 läuft
sudo netstat -tlnp | grep :3000

# Prüfen ob Caddy läuft
sudo netstat -tlnp | grep :80
sudo netstat -tlnp | grep :443
```

## Nach dem Deployment

1. **DNS konfigurieren**: Ihre Domain muss auf `194.55.13.83` zeigen
2. **Backup einrichten**: 
   ```bash
   # Cronjob für tägliche Backups
   crontab -e
   # Hinzufügen: 0 2 * * * /opt/mailikan/backup.sh
   ```
3. **Email-Einstellungen**: Über das Web-Interface konfigurieren
4. **Monitoring**: Logs regelmäßig prüfen

## Nützliche Befehle

```bash
# App neustarten
pm2 restart mailikan

# Caddy neustarten
sudo systemctl restart caddy

# Komplett neu deployen
cd /opt/mailikan && git pull && npm ci --production && pm2 restart mailikan

# Backup erstellen
/opt/mailikan/backup.sh
```
