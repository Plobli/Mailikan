#!/usr/bin/env bash

# Mailikan Debug Deployment Script
# Usage: bash debug-deploy.sh

set -euo pipefail

# Debug-Modus aktivieren
set -x

# Einfache Ausgabe-Funktionen
info() { echo -e "\033[0;32m[INFO]\033[0m $1"; }
warn() { echo -e "\033[1;33m[WARN]\033[0m $1"; }
error() { echo -e "\033[0;31m[ERROR]\033[0m $1"; }

# Konfiguration
GITHUB_REPO="https://github.com/Plobli/Mailikan.git"
REMOTE_DIR="/opt/mailikan"
NODE_VERSION="18"
CURRENT_USER=$(whoami)

info "Debug: Current user is $CURRENT_USER"
info "Debug: Current directory is $(pwd)"

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

# System-Checks
info "=== System Information ==="
info "OS: $(uname -a)"
info "User: $(whoami)"
info "Home: $HOME"
info "PATH: $PATH"

# Service-Checks
info "=== Service Status ==="
systemctl is-active caddy || warn "Caddy is not running"
systemctl is-enabled caddy || warn "Caddy is not enabled"

# PM2 Status
if command -v pm2 &> /dev/null; then
    info "PM2 Status:"
    pm2 status || true
else
    info "PM2 not installed yet"
fi

# Caddy Config Check
if [[ -f /etc/caddy/Caddyfile ]]; then
    info "Existing Caddyfile found:"
    sudo head -20 /etc/caddy/Caddyfile || true
else
    info "No Caddyfile found"
fi

# Projekt Setup (verkürzt für Debug)
info "=== Project Setup ==="

if [[ -d "${REMOTE_DIR}" ]]; then
    info "Project directory exists: ${REMOTE_DIR}"
    ls -la "${REMOTE_DIR}" || true
else
    info "Creating project directory: ${REMOTE_DIR}"
    sudo mkdir -p "${REMOTE_DIR}"
    sudo chown "${CURRENT_USER}:${CURRENT_USER}" "${REMOTE_DIR}"
fi

# Nur Caddy-Teil testen
info "=== Testing Caddy Configuration ==="

# Backup erstellen
if [[ -f /etc/caddy/Caddyfile ]]; then
    info "Backing up existing Caddyfile..."
    sudo cp /etc/caddy/Caddyfile "/etc/caddy/Caddyfile.backup.debug.$(date +%Y%m%d_%H%M%S)"
fi

# Test-Konfiguration schreiben
info "Writing test configuration..."
sudo tee /tmp/test-caddyfile << EOF
# Test Configuration for ${DOMAIN}
${DOMAIN} {
    respond "Mailikan Test - $(date)"
}
EOF

# Validierung testen
info "Testing Caddy validation..."
if timeout 10 sudo caddy validate --config /tmp/test-caddyfile; then
    info "✅ Caddy validation works"
else
    error "❌ Caddy validation failed"
    exit 1
fi

# Caddy Status prüfen
info "Checking Caddy status..."
sudo systemctl status caddy --no-pager -l || true

# Log-Check
if [[ -f /var/log/caddy/access.log ]]; then
    info "Recent Caddy logs:"
    sudo tail -10 /var/log/caddy/access.log || true
fi

info "=== Debug completed ==="
info "If you got here, basic Caddy functionality works."
info "You can now try the full deployment script."

# Cleanup
sudo rm -f /tmp/test-caddyfile
