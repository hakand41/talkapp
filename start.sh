#!/usr/bin/env bash

# TalkApp Linux / VPS Startup Script
echo "========================================================"
echo "  [TalkApp] Linux Sunucu Baslatici"
echo "========================================================"

# Check node
if ! command -v node &> /dev/null; then
    echo "[HATA] Node.js bulunamadi! Lutfen Node.js kurun:"
    echo "curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -"
    echo "sudo apt-get install -y nodejs"
    exit 1
fi

# Install dependencies if not present
if [ ! -d "node_modules" ]; then
    echo "[BILGI] Paketler kuruluyor..."
    npm install --omit=dev --no-audit --no-fund
fi

echo "[BILGI] Sunucu baslatiliyor (PORT 3000)..."
node server.js
