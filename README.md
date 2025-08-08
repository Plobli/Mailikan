# Email Kanban Board

Eine Web-Anwendung zum Organisieren von E-Mails in einem Kanban-Board. E-Mails werden über IMAP von einem E-Mail-Server abgerufen und können zwischen drei Spalten verschoben werden: **Posteingang**, **In Bearbeitung** und **Warte auf Antwort**.

## 🚀 Features

- 📧 **IMAP-Integration**: Automatisches Abrufen von E-Mails von Ihrem E-Mail-Server
- 📋 **Kanban-Board**: Drei Spalten für effiziente E-Mail-Organisation
- 🖱️ **Drag & Drop**: Intuitive Bedienung durch Ziehen und Ablegen
- 📱 **Responsive Design**: Funktioniert auf Desktop und mobilen Geräten
- 🔄 **Echtzeit-Synchronisation**: Manuelle und automatische E-Mail-Synchronisation
- 👁️ **E-Mail-Vorschau**: Schnelle Ansicht der E-Mail-Inhalte

## 📋 Voraussetzungen

- Node.js (Version 14 oder höher)
- npm oder yarn
- E-Mail-Account mit IMAP-Zugang

## 🛠️ Installation

1. **Repository klonen oder Dateien herunterladen**
   ```bash
   git clone <repository-url>
   cd kanban-email-website
   ```

2. **Abhängigkeiten installieren**
   ```bash
   npm install
   ```

3. **Umgebungsvariablen konfigurieren**
   ```bash
   cp .env.example .env
   ```
   
   Bearbeiten Sie die `.env` Datei mit Ihren E-Mail-Einstellungen:
   ```env
   IMAP_HOST=imap.gmail.com
   IMAP_PORT=993
   IMAP_USER=ihre-email@gmail.com
   IMAP_PASSWORD=ihr-passwort
   IMAP_TLS=true
   PORT=3000
   ```

4. **Anwendung starten**
   ```bash
   npm start
   ```
   
   Für Entwicklung mit Auto-Reload:
   ```bash
   npm run dev
   ```

5. **Browser öffnen**
   
   Besuchen Sie `http://localhost:3000`

## 🔧 Konfiguration

### IMAP-Einstellungen

Gängige IMAP-Einstellungen für verschiedene E-Mail-Anbieter:

**Gmail:**
```env
IMAP_HOST=imap.gmail.com
IMAP_PORT=993
IMAP_TLS=true
```

**Outlook/Hotmail:**
```env
IMAP_HOST=imap-mail.outlook.com
IMAP_PORT=993
IMAP_TLS=true
```

**Yahoo:**
```env
IMAP_HOST=imap.mail.yahoo.com
IMAP_PORT=993
IMAP_TLS=true
```

### Sicherheitshinweise

- Verwenden Sie App-spezifische Passwörter für Gmail und andere Anbieter
- Aktivieren Sie IMAP in Ihren E-Mail-Einstellungen
- Stellen Sie sicher, dass Ihr E-Mail-Anbieter IMAP-Zugriff erlaubt

## 🐧 Deployment auf Debian/Ubuntu Server

### 1. Server vorbereiten

```bash
# System aktualisieren
sudo apt update && sudo apt upgrade -y

# Node.js installieren
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# PM2 für Prozessmanagement installieren
sudo npm install -g pm2
```

### 2. Anwendung deployen

```bash
# Projekt auf den Server kopieren
scp -r . user@your-server:/home/user/kanban-email-website

# Auf dem Server
cd /home/user/kanban-email-website
npm install --production

# Umgebungsvariablen konfigurieren
cp .env.example .env
nano .env  # Ihre E-Mail-Einstellungen eintragen
```

### 3. Mit PM2 starten

```bash
# Anwendung starten
pm2 start server.js --name "email-kanban"

# PM2 beim Systemstart aktivieren
pm2 startup
pm2 save
```

### 4. Nginx als Reverse Proxy (optional)

```bash
# Nginx installieren
sudo apt install nginx

# Nginx-Konfiguration erstellen
sudo nano /etc/nginx/sites-available/email-kanban
```

Nginx-Konfiguration:
```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

```bash
# Site aktivieren
sudo ln -s /etc/nginx/sites-available/email-kanban /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

## 📁 Projektstruktur

```
kanban-email-website/
├── server.js                 # Hauptserver-Datei
├── package.json              # Node.js-Abhängigkeiten
├── .env.example              # Beispiel-Umgebungsvariablen
├── services/
│   ├── emailService.js       # IMAP-E-Mail-Service
│   └── kanbanService.js      # Kanban-Datenverwaltung
├── public/
│   ├── index.html            # Frontend HTML
│   ├── styles.css            # CSS-Styling
│   └── script.js             # Frontend JavaScript
└── data/
    └── emails.json           # Lokale E-Mail-Datenbank (wird automatisch erstellt)
```

## 🔧 API-Endpunkte

- `GET /api/emails` - Alle E-Mails abrufen
- `POST /api/emails/sync` - E-Mails vom Server synchronisieren
- `PUT /api/emails/:id/column` - E-Mail in andere Spalte verschieben

## 🛡️ Sicherheit

- Die Anwendung speichert E-Mails lokal in einer JSON-Datei
- IMAP-Zugangsdaten werden in Umgebungsvariablen gespeichert
- Keine E-Mails werden an externe Dienste gesendet
- Für Produktionsumgebungen sollten Sie HTTPS verwenden

## 🔍 Troubleshooting

### IMAP-Verbindungsprobleme

1. **Überprüfen Sie Ihre E-Mail-Einstellungen**
2. **Aktivieren Sie IMAP in Ihrem E-Mail-Account**
3. **Verwenden Sie App-spezifische Passwörter**
4. **Prüfen Sie Firewall-Einstellungen**

### Häufige Fehler

- `AUTHENTICATIONFAILED`: Falsches Passwort oder IMAP nicht aktiviert
- `ECONNREFUSED`: Falscher IMAP-Host oder Port
- `ETIMEDOUT`: Netzwerk- oder Firewall-Problem

## 📝 Lizenz

MIT License - Siehe LICENSE-Datei für Details.

## 🤝 Beitragen

Beiträge sind willkommen! Bitte erstellen Sie einen Pull Request oder öffnen Sie ein Issue.

---

**Entwickelt für die private E-Mail-Organisation mit Fokus auf Einfachheit und Effizienz.**
