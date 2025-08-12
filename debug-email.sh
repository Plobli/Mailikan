#!/usr/bin/env bash

# Mailikan Debug Script für Email-Synchronisation
# Usage: bash debug-email.sh

set -euo pipefail

# Farben für Output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

info() { echo -e "${GREEN}[INFO]${NC} $1"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
error() { echo -e "${RED}[ERROR]${NC} $1"; }

REMOTE_DIR="/opt/mailikan"
MAILIKAN_PORT="3001"

info "=== Mailikan Email Debug ==="

# 1. App-Status prüfen
info "1. Checking application status..."
if command -v pm2 &> /dev/null; then
    pm2 status mailikan || warn "PM2 status failed"
    pm2 logs mailikan --lines 20 || warn "PM2 logs failed"
else
    warn "PM2 not found"
fi

# 2. Port-Check
info "2. Checking port ${MAILIKAN_PORT}..."
if sudo netstat -tlnp | grep ":${MAILIKAN_PORT}"; then
    info "✅ Port ${MAILIKAN_PORT} is listening"
else
    error "❌ Port ${MAILIKAN_PORT} not listening"
fi

# 3. Umgebungsvariablen prüfen
info "3. Checking environment variables..."
if [[ -f "${REMOTE_DIR}/.env" ]]; then
    info "✅ .env file exists"
    echo "Environment variables:"
    cat "${REMOTE_DIR}/.env" | grep -v SESSION_SECRET || true
else
    error "❌ .env file missing"
fi

# 4. Data-Verzeichnis prüfen
info "4. Checking data directory..."
if [[ -d "${REMOTE_DIR}/data" ]]; then
    info "✅ Data directory exists"
    ls -la "${REMOTE_DIR}/data/" || true
else
    error "❌ Data directory missing"
fi

# 5. Logs prüfen
info "5. Checking application logs..."
if [[ -f "/var/log/mailikan/app.log" ]]; then
    info "Application logs (last 20 lines):"
    tail -20 /var/log/mailikan/app.log || true
else
    warn "No application log file found"
fi

# 6. Netzwerk-Test
info "6. Testing network connectivity..."
if command -v curl &> /dev/null; then
    info "Testing external connectivity:"
    curl -s --connect-timeout 5 http://google.com > /dev/null && info "✅ External network OK" || warn "❌ External network issue"
    
    info "Testing local app:"
    if curl -s --connect-timeout 5 "http://localhost:${MAILIKAN_PORT}" > /dev/null; then
        info "✅ Local app responds"
    else
        error "❌ Local app not responding"
    fi
else
    warn "curl not available for network tests"
fi

# 7. Email-Konfiguration prüfen
info "7. Checking email configuration..."
if [[ -f "${REMOTE_DIR}/data/users.json" ]]; then
    info "✅ users.json exists"
    if [[ -s "${REMOTE_DIR}/data/users.json" ]]; then
        info "✅ users.json has content"
        # Zeige Struktur ohne Passwörter
        jq -r 'to_entries[] | "User: \(.key), Email configured: \(.value | has("emailConfig"))"' "${REMOTE_DIR}/data/users.json" 2>/dev/null || info "Content exists but not JSON parseable"
    else
        warn "❌ users.json is empty"
    fi
else
    error "❌ users.json missing - no email configuration found"
fi

if [[ -f "${REMOTE_DIR}/data/emails.json" ]]; then
    info "✅ emails.json exists"
    EMAIL_COUNT=$(jq '. | length' "${REMOTE_DIR}/data/emails.json" 2>/dev/null || echo "0")
    info "📧 Emails in database: ${EMAIL_COUNT}"
else
    warn "❌ emails.json missing"
fi

# 8. Prozess-Information
info "8. Process information..."
if pgrep -f "mailikan" > /dev/null; then
    info "✅ Mailikan process running"
    ps aux | grep mailikan | grep -v grep || true
else
    error "❌ No Mailikan process found"
fi

# 9. Vergleich mit lokaler Konfiguration
info "9. Configuration comparison..."
echo ""
warn "📋 Next debugging steps:"
echo "1. Check if email credentials are configured in web interface"
echo "2. Check firewall settings for outbound IMAP connections"
echo "3. Test IMAP connection manually:"
echo "   telnet <imap-server> 993"
echo "4. Check application logs for IMAP errors:"
echo "   pm2 logs mailikan"
echo "5. Restart application:"
echo "   pm2 restart mailikan"
echo ""
info "🔧 Manual configuration check:"
echo "Visit: http://$(curl -s ifconfig.me):${MAILIKAN_PORT}/settings"
echo "Or: http://localhost:${MAILIKAN_PORT}/settings"
