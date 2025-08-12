#!/usr/bin/env bash

# DNS Fix Script für ältere Debian-Systeme
# Dieses Script wird auf dem Server ausgeführt

set -euo pipefail

# Farben für Output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
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

echo_info "🔧 DNS-Konfiguration wird repariert..."

# 1. Backup der aktuellen DNS-Konfiguration
echo_info "Backup der aktuellen DNS-Konfiguration..."
sudo cp /etc/resolv.conf /etc/resolv.conf.backup.$(date +%Y%m%d_%H%M%S)

# 2. Aktuelle DNS-Konfiguration anzeigen
echo_info "Aktuelle DNS-Konfiguration:"
cat /etc/resolv.conf

# 3. Neue DNS-Server konfigurieren
echo_info "Konfiguriere öffentliche DNS-Server..."
sudo tee /etc/resolv.conf << EOF
# DNS-Konfiguration für Mailikan
# Generiert am $(date)
nameserver 8.8.8.8
nameserver 8.8.4.4
nameserver 1.1.1.1
nameserver 1.0.0.1
search localdomain
EOF

# 4. DNS Cache leeren (falls vorhanden)
echo_info "DNS-Cache wird geleert..."
sudo systemctl restart networking || echo_warn "Networking service restart failed"

# Falls nscd installiert ist
if command -v nscd &> /dev/null; then
    sudo systemctl restart nscd || echo_warn "nscd restart failed"
fi

# 5. DNS-Auflösung testen
echo_info "🧪 Teste DNS-Auflösung..."

# Test mit verschiedenen Domains
test_domains=("google.com" "strato.de" "strato.imap.com")

for domain in "${test_domains[@]}"; do
    echo -n "Testing $domain: "
    if nslookup "$domain" >/dev/null 2>&1; then
        echo -e "${GREEN}✓ OK${NC}"
    else
        echo -e "${RED}✗ FAILED${NC}"
    fi
done

# 6. Spezifischer Test für Strato IMAP
echo_info "🔍 Teste spezifisch strato.imap.com..."
if nslookup strato.imap.com; then
    echo_info "✅ strato.imap.com kann aufgelöst werden!"
    
    # IP-Adresse ermitteln
    STRATO_IP=$(nslookup strato.imap.com | grep "Address:" | tail -n1 | awk '{print $2}')
    echo_info "IP-Adresse von strato.imap.com: $STRATO_IP"
    
    # Ping-Test
    echo_info "Teste Ping zu strato.imap.com..."
    if ping -c 3 strato.imap.com; then
        echo_info "✅ Ping erfolgreich!"
    else
        echo_warn "⚠️ Ping fehlgeschlagen - möglicherweise blockiert"
    fi
    
    # Port-Test für IMAP
    echo_info "Teste IMAP-Port 993..."
    if timeout 10 bash -c "</dev/tcp/strato.imap.com/993"; then
        echo_info "✅ Port 993 ist erreichbar!"
    else
        echo_warn "⚠️ Port 993 nicht erreichbar - Firewall prüfen"
    fi
    
else
    echo_error "❌ strato.imap.com kann NICHT aufgelöst werden!"
    
    # Alternative: Manuelle IP-Einträge
    echo_info "Versuche manuelle IP-Auflösung..."
    
    # Diese IPs sind öffentlich bekannte Strato-Server (können sich ändern)
    cat >> /etc/hosts << HOSTS_EOF

# Manuelle DNS-Einträge für Strato Email
# Hinzugefügt am $(date)
81.169.145.92 strato.imap.com
81.169.145.92 imap.strato.de
HOSTS_EOF
    
    echo_info "Manuelle DNS-Einträge hinzugefügt. Teste erneut..."
    if ping -c 1 strato.imap.com; then
        echo_info "✅ Manuelle DNS-Auflösung erfolgreich!"
    fi
fi

# 7. UFW-Ports für Email freigeben
echo_info "🔓 Konfiguriere UFW für Email-Ports..."

# Prüfen ob UFW aktiv ist
if command -v ufw &> /dev/null; then
    echo_info "UFW Status:"
    sudo ufw status
    
    echo_info "Gebe Email-Ports frei..."
    
    # Ausgehende Verbindungen für Email
    sudo ufw allow out 993/tcp  # IMAP SSL
    sudo ufw allow out 465/tcp  # SMTP SSL
    sudo ufw allow out 587/tcp  # SMTP TLS
    sudo ufw allow out 53       # DNS
    sudo ufw allow out 80/tcp   # HTTP
    sudo ufw allow out 443/tcp  # HTTPS
    
    echo_info "UFW-Regeln aktualisiert:"
    sudo ufw status
else
    echo_warn "UFW ist nicht installiert"
fi

# 8. Abschließender Test
echo_info "🎯 Abschließender Test der Email-Verbindung..."

# Test der IMAP-Verbindung
echo_info "Teste IMAP-Verbindung zu strato.imap.com:993..."
timeout 10 bash -c 'exec 3<>/dev/tcp/strato.imap.com/993 && echo "IMAP connection successful" || echo "IMAP connection failed"'

echo_info "✅ DNS-Konfiguration abgeschlossen!"
echo ""
echo_info "📋 Nächste Schritte:"
echo "  1. Neustart der Mailikan-App: pm2 restart mailikan"
echo "  2. Logs prüfen: pm2 logs mailikan"
echo "  3. Email-Sync testen über die Web-Oberfläche"
echo ""
echo_info "🔧 Bei weiteren Problemen:"
echo "  - Logs: /var/log/mailikan/app.log"
echo "  - DNS-Test: nslookup strato.imap.com"
echo "  - Port-Test: telnet strato.imap.com 993"
