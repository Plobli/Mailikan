#!/usr/bin/env bash

# Mailikan Simple Deployment Script für Debian Server
# Usage: bash simple-deploy.sh

set -euo pipefail

# Einfache Ausgabe-Funktionen
info() { echo -e "\033[0;32m[INFO]\033[0m $1"; }
warn() { echo -e "\033[1;33m[WARN]\033[0m $1"; }
error() { echo -e "\033[0;31m[ERROR]\033[0m $1"; }

# Konfiguration
GITHUB_REPO="https://github.com/Plobli/Mailikan.git"
REMOTE_DIR="/opt/mailikan"
NODE_VERSION="18"
CURRENT_USER=$(whoami)

# Domain abfragen
info "Mailikan Deployment Configuration"
echo ""
echo -n "Enter your domain name (e.g., mailikan.example.com): "
read DOMAIN

if [[ -z "${DOMAIN}" ]]; then
    error "Domain name is required!"
    exit 1
fi

info "Using domain: ${DOMAIN}"

# Deployment Typ
DEPLOY_TYPE=${1:-production}
info "Deploying in ${DEPLOY_TYPE} mode on $(hostname)"

# Git installieren falls nötig
if ! command -v git &> /dev/null; then
    info "Installing git..."
    sudo apt update
    sudo apt install -y git
fi

# Projekt klonen/aktualisieren
info "Downloading project from GitHub..."
if [[ -d "${REMOTE_DIR}/.git" ]]; then
    info "Updating existing repository..."
    cd "${REMOTE_DIR}"
    sudo -u "${CURRENT_USER}" git pull origin main
else
    info "Cloning repository..."
    sudo mkdir -p "${REMOTE_DIR}"
    sudo chown "${CURRENT_USER}:${CURRENT_USER}" "${REMOTE_DIR}"
    git clone "${GITHUB_REPO}" "${REMOTE_DIR}"
    cd "${REMOTE_DIR}"
fi

# Server Setup
info "Setting up server environment..."

# System Update
sudo apt update

# Node.js installieren
if ! command -v node &> /dev/null; then
    info "Installing Node.js ${NODE_VERSION}..."
    curl -fsSL "https://deb.nodesource.com/setup_${NODE_VERSION}.x" | sudo -E bash -
    sudo apt-get install -y nodejs
fi

# PM2 installieren
if ! command -v pm2 &> /dev/null; then
    info "Installing PM2..."
    sudo npm install -g pm2
fi

# Berechtigungen setzen
sudo chown -R "${CURRENT_USER}:${CURRENT_USER}" "${REMOTE_DIR}"
cd "${REMOTE_DIR}"

# Dependencies installieren
info "Installing dependencies..."
npm ci --production

# Verzeichnisse erstellen
mkdir -p data
chmod +x backup.sh

# Log-Verzeichnis
sudo mkdir -p /var/log/mailikan
sudo chown "${CURRENT_USER}:${CURRENT_USER}" /var/log/mailikan

# Systemd Service
sudo cp mailikan.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable mailikan

# PM2 starten
pm2 stop mailikan || true
pm2 delete mailikan || true
pm2 start ecosystem.production.config.js
pm2 save

# PM2 Startup
sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u "${CURRENT_USER}" --hp "/home/${CURRENT_USER}"

info "Application deployment completed!"

# Caddy Konfiguration
info "Setting up Caddy configuration..."

# Backup erstellen
if [[ -f /etc/caddy/Caddyfile ]]; then
    info "Backing up existing Caddyfile..."
    sudo cp /etc/caddy/Caddyfile "/etc/caddy/Caddyfile.backup.$(date +%Y%m%d_%H%M%S)"
fi

# Neue Konfiguration hinzufügen
if [[ -f /etc/caddy/Caddyfile ]] && grep -q "^${DOMAIN}" /etc/caddy/Caddyfile; then
    warn "Domain ${DOMAIN} already exists in Caddyfile. Please update manually."
else
    info "Adding domain configuration to Caddyfile..."
    
    # Falls Caddyfile nicht existiert
    if [[ ! -f /etc/caddy/Caddyfile ]]; then
        sudo touch /etc/caddy/Caddyfile
    fi
    
    # Konfiguration anhängen
    sudo tee -a /etc/caddy/Caddyfile > /dev/null << EOF

# Mailikan Configuration for ${DOMAIN}
${DOMAIN} {
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
    
    log {
        output file /var/log/caddy/mailikan.log
    }
    
    encode gzip
}

http://${DOMAIN} {
    redir https://${DOMAIN}{uri} permanent
}
EOF
fi

# Caddy validieren und neustarten
info "Validating and reloading Caddy..."
if sudo caddy validate --config /etc/caddy/Caddyfile; then
    sudo mkdir -p /var/log/caddy
    sudo chown caddy:caddy /var/log/caddy
    sudo systemctl reload caddy
    info "Caddy configuration updated!"
else
    error "Caddy configuration invalid!"
    exit 1
fi

# Zusammenfassung
info "🎉 Deployment completed!"
echo ""
echo "📱 App URL: https://${DOMAIN}"
echo "📁 App Directory: ${REMOTE_DIR}"
echo "📊 Process Manager: PM2"
echo "🌐 Web Server: Caddy"
echo ""
warn "Next Steps:"
echo "1. Configure DNS: ${DOMAIN} → $(curl -s ifconfig.me)"
echo "2. Setup email credentials in web interface"
echo "3. Setup backups: crontab -e"
echo "   Add: 0 2 * * * ${REMOTE_DIR}/backup.sh"
echo ""
info "Useful commands:"
echo "pm2 logs mailikan         # View logs"
echo "pm2 restart mailikan      # Restart app"
echo "sudo systemctl reload caddy  # Reload web server"
