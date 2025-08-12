#!/bin/bash

# Mailikan Deployment Script für Debian Server
# Dieses Script wird DIREKT auf dem Server ausgeführt
# Usage: wget -O deploy.sh https://raw.githubusercontent.com/Plobli/Mailikan/main/deploy.sh && chmod +x deploy.sh && ./deploy.sh

set -e

# Konfiguration
GITHUB_REPO="https://github.com/Plobli/Mailikan.git"
REMOTE_DIR="/opt/mailikan"
DOMAIN="your-domain.com"  # Anpassen Sie dies an Ihre Domain
NODE_VERSION="18"
CURRENT_USER=$(whoami)

# Farben für Output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

echo_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

echo_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Deployment Typ bestimmen
DEPLOY_TYPE=${1:-production}
echo_info "Deploying in $DEPLOY_TYPE mode on $(hostname)"

# Git und Prerequisites prüfen
echo_info "Checking prerequisites..."
if ! command -v git &> /dev/null; then
    echo_info "Installing git..."
    sudo apt update
    sudo apt install -y git
fi

# Projekt von GitHub klonen/aktualisieren
echo_info "Downloading project from GitHub..."
if [ -d "${REMOTE_DIR}/.git" ]; then
    echo_info "Updating existing repository..."
    cd ${REMOTE_DIR}
    sudo -u ${CURRENT_USER} git pull origin main
else
    echo_info "Cloning repository..."
    sudo mkdir -p ${REMOTE_DIR}
    sudo chown ${CURRENT_USER}:${CURRENT_USER} ${REMOTE_DIR}
    git clone ${GITHUB_REPO} ${REMOTE_DIR}
    cd ${REMOTE_DIR}
fi

# Server Setup und Installation
echo_info "Setting up server environment..."

# System Update
sudo apt update

# Node.js Installation (falls nicht vorhanden)
if ! command -v node &> /dev/null; then
    echo_info "Installing Node.js ${NODE_VERSION}..."
    curl -fsSL https://deb.nodesource.com/setup_${NODE_VERSION}.x | sudo -E bash -
    sudo apt-get install -y nodejs
fi

# PM2 Installation (falls nicht vorhanden)
if ! command -v pm2 &> /dev/null; then
    echo_info "Installing PM2..."
    sudo npm install -g pm2
fi

# Projektverzeichnis Berechtigungen setzen
sudo chown -R ${CURRENT_USER}:${CURRENT_USER} ${REMOTE_DIR}

# In Projektverzeichnis wechseln
cd ${REMOTE_DIR}

# Dependencies installieren
echo_info "Installing dependencies..."
npm ci --production

# Data Verzeichnis erstellen falls nicht vorhanden
mkdir -p data

# Berechtigungen setzen
chmod +x backup.sh

# Log-Verzeichnis erstellen
sudo mkdir -p /var/log/mailikan
sudo chown ${CURRENT_USER}:${CURRENT_USER} /var/log/mailikan

# Systemd Service installieren
sudo cp mailikan.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable mailikan

# PM2 mit Ecosystem Config starten
pm2 stop mailikan || true
pm2 delete mailikan || true
pm2 start ecosystem.production.config.js
pm2 save

# PM2 Startup konfigurieren
sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u ${CURRENT_USER} --hp /home/${CURRENT_USER}

echo_info "Application deployment completed successfully!"

# Caddy Konfiguration
echo_info "Setting up Caddy configuration..."

# Caddy Konfigurationsdatei erstellen
sudo tee /etc/caddy/Caddyfile << CADDY_EOF
# Mailikan Caddy Configuration
${DOMAIN} {
    # Reverse Proxy zu Node.js App
    reverse_proxy localhost:3000
    
    # Headers für Sicherheit
    header {
        # Security Headers
        Strict-Transport-Security "max-age=31536000; includeSubDomains; preload"
        X-Frame-Options "DENY"
        X-Content-Type-Options "nosniff"
        X-XSS-Protection "1; mode=block"
        Referrer-Policy "strict-origin-when-cross-origin"
        
        # CORS Headers (falls benötigt)
        Access-Control-Allow-Origin "*"
        Access-Control-Allow-Methods "GET, POST, PUT, DELETE, OPTIONS"
        Access-Control-Allow-Headers "Content-Type, Authorization"
    }
    
    # Statische Assets cachen
    @static {
        path *.css *.js *.png *.jpg *.jpeg *.gif *.ico *.svg *.woff *.woff2
    }
    header @static Cache-Control "public, max-age=31536000"
    
    # Logging
    log {
        output file /var/log/caddy/mailikan.log
        format json
    }
    
    # Kompression
    encode gzip
}

# HTTP zu HTTPS Redirect
http://${DOMAIN} {
    redir https://${DOMAIN}{uri} permanent
}
CADDY_EOF

# Caddy Log Verzeichnis erstellen
sudo mkdir -p /var/log/caddy
sudo chown caddy:caddy /var/log/caddy

# Caddy Service neustarten
sudo systemctl reload caddy

echo_info "Caddy configuration updated!"

echo_info "Deployment completed! Your app should be available at https://$DOMAIN"
echo_warn "Don't forget to:"
echo "  1. Update the DOMAIN variable in this script if needed"
echo "  2. Configure your DNS to point to this server"
echo "  3. Set up your email credentials in the web interface"
echo "  4. Configure backup schedule with crontab"
