#!/bin/bash
set -e

DOMAIN="${1:-$SERVER_DOMAIN}"
TOKEN="${2:-$DUCKDNS_TOKEN}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SSL_DIR="$SCRIPT_DIR/ssl"

if [ -z "$DOMAIN" ] || [ -z "$TOKEN" ]; then
    echo "Kullanım: ./setup-ssl.sh <DOMAIN> <DUCKDNS_TOKEN>"
    echo "Örnek:   ./setup-ssl.sh your-domain.duckdns.org your-duckdns-token"
    exit 1
fi

echo "=========================================================="
echo "🔒 TalkApp Let's Encrypt SSL Kurulumu Başlatılıyor..."
echo "📡 Domain: $DOMAIN"
echo "=========================================================="

mkdir -p "$SSL_DIR"

# 1. acme.sh kurulu değilse kur
if [ ! -f "$HOME/.acme.sh/acme.sh" ]; then
    echo "📦 acme.sh indiriliyor ve kuruluyor..."
    curl -s https://get.acme.sh | sh -s email="admin@$DOMAIN"
fi

ACME="$HOME/.acme.sh/acme.sh"

# 2. DuckDNS DNS-01 ile Let's Encrypt sertifikasını al
echo "🔑 Let's Encrypt sertifikası alınıyor (DuckDNS DNS doğrulaması)..."
export DuckDNS_Token="$TOKEN"
"$ACME" --set-default-ca --server letsencrypt
"$ACME" --issue --dns dns_duckdns -d "$DOMAIN" --force

# 3. Sertifikayı TalkApp ssl klasörüne yerleştir ve Docker'ı yeniden başlat
echo "📋 Sertifikalar TalkApp dizinine kopyalanıyor..."
"$ACME" --install-cert -d "$DOMAIN" \
    --key-file "$SSL_DIR/key.pem" \
    --fullchain-file "$SSL_DIR/cert.pem" \
    --reloadcmd "cd $SCRIPT_DIR && docker compose restart"

echo "=========================================================="
echo "✅ Let's Encrypt SSL Sertifikası Kuruldu!"
echo "🌐 Adres: https://$DOMAIN"
echo "=========================================================="
