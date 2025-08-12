#!/bin/bash

# Mailikan Deployment Script für Debian Server
# Dieses Script wird DIREKT auf dem Server ausgeführt
# Usage: wget -O deploy.sh https://raw.githubusercontent.com/Plobli/Mailikan/main/deploy.sh && chmod +x deploy.sh && ./deploy.sh

set -e

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

# Konfiguration
GITHUB_REPO="https://github.com/Plobli/Mailikan.git"
REMOTE_DIR="/opt/mailikan"
NODE_VERSION="18"
CURRENT_USER=$(whoami)

# Domain interaktiv abfragen
echo_info "Mailikan Deployment Configuration"
echo ""
read -p "Enter your domain name (e.g., mailikan.example.com): " DOMAIN

if [ -z "$DOMAIN" ]; then
    echo_error "Domain name is required!"
    exit 1
fi

echo_info "Using domain: $DOMAIN"

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

# Backup des bestehenden Caddyfiles erstellen
if [ -f /etc/caddy/Caddyfile ]; then
    echo_info "Backing up existing Caddyfile..."
    sudo cp /etc/caddy/Caddyfile "/etc/caddy/Caddyfile.backup.$(date +%Y%m%d_%H%M%S)"
fi

# Prüfen ob Domain bereits in Caddyfile existiert
if [ -f /etc/caddy/Caddyfile ] && grep -q "^${DOMAIN}" /etc/caddy/Caddyfile; then
    echo_warn "Domain ${DOMAIN} already exists in Caddyfile. Updating configuration..."
    
    # Temporäre Datei für neue Konfiguration
    TEMP_CADDY=$(mktemp)
    
    # Bestehende Konfiguration kopieren, aber Domain-Block ersetzen
    awk -v domain="$DOMAIN" '
    BEGIN { in_domain_block = 0; skip_block = 0 }
    /^[a-zA-Z0-9.-]+/ {
        if ($0 == domain " {" || $0 == domain "{") {
            skip_block = 1
            next
        } else {
            skip_block = 0
        }
    }
    /^}$/ {
        if (skip_block) {
            skip_block = 0
            next
        }
    }
    !skip_block { print }
    ' /etc/caddy/Caddyfile > "$TEMP_CADDY"
    
    # Neue Domain-Konfiguration anhängen
    cat >> "$TEMP_CADDY" << CADDY_EOF

# Mailikan Configuration for ${DOMAIN}
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

# HTTP zu HTTPS Redirect für ${DOMAIN}
http://${DOMAIN} {
    redir https://${DOMAIN}{uri} permanent
}
CADDY_EOF

    # Neue Konfiguration installieren
    sudo mv "$TEMP_CADDY" /etc/caddy/Caddyfile
    
else
    echo_info "Adding new domain configuration to Caddyfile..."
    
    # Falls Caddyfile nicht existiert, erstellen
    if [ ! -f /etc/caddy/Caddyfile ]; then
        sudo touch /etc/caddy/Caddyfile
    fi
    
    # Neue Konfiguration anhängen
    sudo tee -a /etc/caddy/Caddyfile << CADDY_EOF

# Mailikan Configuration for ${DOMAIN}
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

# HTTP zu HTTPS Redirect für ${DOMAIN}
http://${DOMAIN} {
    redir https://${DOMAIN}{uri} permanent
}
CADDY_EOF

fi

# Caddy Konfiguration validieren
echo_info "Validating Caddy configuration..."
if sudo caddy validate --config /etc/caddy/Caddyfile; then
    echo_info "Caddy configuration is valid"
else
    echo_error "Caddy configuration is invalid! Restoring backup..."
    if [ -f "/etc/caddy/Caddyfile.backup.$(date +%Y%m%d_%H%M%S)" ]; then
        sudo cp "/etc/caddy/Caddyfile.backup.$(date +%Y%m%d_%H%M%S)" /etc/caddy/Caddyfile
    fi
    exit 1
fi

# Caddy Log Verzeichnis erstellen
sudo mkdir -p /var/log/caddy
sudo chown caddy:caddy /var/log/caddy

# Caddy Service neustarten
sudo systemctl reload caddy

echo_info "Caddy configuration updated!"

echo_info "Deployment completed! Your app should be available at https://$DOMAIN"
echo ""
echo_info "🎉 Deployment Summary:"
echo "  📱 App URL: https://$DOMAIN"
echo "  📁 App Directory: $REMOTE_DIR"
echo "  📊 Process Manager: PM2 (pm2 status)"
echo "  🌐 Web Server: Caddy"
echo "  📝 Logs: pm2 logs mailikan"
echo ""
echo_warn "📋 Next Steps:"
echo "  1. Configure your DNS to point $DOMAIN to this server"
echo "  2. Set up your email credentials in the web interface"
echo "  3. Configure backup schedule: crontab -e"
echo "     Add: 0 2 * * * $REMOTE_DIR/backup.sh"
echo "  4. Monitor logs: pm2 logs mailikan"
echo ""
echo_info "🔧 Useful Commands:"
echo "  pm2 restart mailikan     # Restart app"
echo "  pm2 logs mailikan        # View logs"
echo "  sudo systemctl reload caddy  # Reload web server"
echo "  $REMOTE_DIR/backup.sh    # Create backup"
