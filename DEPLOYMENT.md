# Mailikan Deployment Guide

## Deployment auf Debian Server mit Caddy

### Voraussetzungen auf dem Server
- Debian/Ubuntu Server
- Caddy installiert und konfiguriert
- SSH-Zugang
- Node.js 18+ (wird automatisch installiert)

### 1. Deployment-Script vorbereiten

Bearbeiten Sie `deploy.sh` und passen Sie folgende Variablen an:
```bash
SERVER_HOST="194.55.13.83"        # Ihre Server-IP
SERVER_USER="christopher"          # Ihr SSH-Benutzer
DOMAIN="your-domain.com"          # Ihre Domain
```

### 2. Domain und DNS konfigurieren

Stellen Sie sicher, dass Ihre Domain auf die Server-IP zeigt:
```
A-Record: your-domain.com → 194.55.13.83
```

### 3. Deployment ausführen

```bash
# Script ausführbar machen
chmod +x deploy.sh

# Deployment starten
./deploy.sh production
```

### 4. Manuelle Schritte auf dem Server

Falls das automatische Deployment fehlschlägt, können Sie diese Schritte manuell ausführen:

```bash
# Mit Server verbinden
ssh christopher@194.55.13.83

# Node.js installieren (falls nicht vorhanden)
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# PM2 installieren
sudo npm install -g pm2

# Projektverzeichnis erstellen
sudo mkdir -p /opt/mailikan
sudo chown christopher:christopher /opt/mailikan

# Projekt hochladen (von lokalem Rechner)
rsync -avz --exclude node_modules ./ christopher@194.55.13.83:/opt/mailikan/

# Auf Server: Dependencies installieren
cd /opt/mailikan
npm ci --production

# PM2 starten
pm2 start ecosystem.production.config.js
pm2 save
pm2 startup
```

### 5. Caddy konfigurieren

Editieren Sie `/etc/caddy/Caddyfile`:

```caddy
your-domain.com {
    reverse_proxy localhost:3000
    
    header {
        Strict-Transport-Security "max-age=31536000; includeSubDomains; preload"
        X-Frame-Options "DENY"
        X-Content-Type-Options "nosniff"
        X-XSS-Protection "1; mode=block"
    }
    
    @static {
        path *.css *.js *.png *.jpg *.jpeg *.gif *.ico *.svg
    }
    header @static Cache-Control "public, max-age=31536000"
    
    encode gzip
    
    log {
        output file /var/log/caddy/mailikan.log
    }
}
```

Caddy neustarten:
```bash
sudo systemctl reload caddy
```

### 6. Systemd Service (Alternative zu PM2)

```bash
# Service installieren
sudo cp mailikan.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable mailikan
sudo systemctl start mailikan
```

### 7. Backup einrichten

```bash
# Backup-Script ausführbar machen
chmod +x backup.sh

# Cronjob für tägliche Backups
crontab -e

# Folgende Zeile hinzufügen (täglich um 2:00 Uhr)
0 2 * * * /opt/mailikan/backup.sh
```

### 8. Logs überwachen

```bash
# PM2 Logs
pm2 logs mailikan

# Systemd Logs
journalctl -u mailikan -f

# Caddy Logs
tail -f /var/log/caddy/mailikan.log
```

### 9. SSL/HTTPS

Caddy konfiguriert automatisch SSL-Zertifikate von Let's Encrypt. Stellen Sie sicher, dass:
- Port 80 und 443 geöffnet sind
- Die Domain korrekt auf den Server zeigt
- Caddy läuft und konfiguriert ist

### Troubleshooting

#### App startet nicht
```bash
# Logs prüfen
pm2 logs mailikan
journalctl -u mailikan

# Port prüfen
sudo netstat -tlnp | grep :3000
```

#### Caddy Probleme
```bash
# Caddy Status prüfen
sudo systemctl status caddy

# Konfiguration testen
sudo caddy validate --config /etc/caddy/Caddyfile
```

#### Firewall
```bash
# UFW Firewall (falls aktiviert)
sudo ufw allow 80
sudo ufw allow 443
sudo ufw allow 22
```

### Wartung

#### Updates
```bash
cd /opt/mailikan
git pull origin main
npm ci --production
pm2 restart mailikan
```

#### Backup wiederherstellen
```bash
cd /opt/mailikan
tar -xzf backups/mailikan_backup_YYYYMMDD_HHMMSS.tar.gz
pm2 restart mailikan
```

### Monitoring

Für Produktionsumgebungen empfiehlt sich zusätzlich:
- Uptime-Monitoring (z.B. UptimeRobot)
- Log-Aggregation (z.B. ELK Stack)
- Performance-Monitoring (z.B. New Relic)
- Backup-Monitoring
