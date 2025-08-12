#!/bin/bash

# Test für die echo_info Funktion
echo "Testing function definition..."

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

# Test der Funktionen
echo_info "This should work now"
echo_warn "This is a warning"
echo_error "This is an error"

echo "If you see colored output above, the functions work correctly."
