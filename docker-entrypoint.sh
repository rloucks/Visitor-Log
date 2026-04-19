#!/bin/sh
set -e

KEY=/app/certs/key.pem
CERT=/app/certs/cert.pem

# Ensure the certs directory is writable regardless of how Docker created it
mkdir -p /app/certs /app/data /app/uploads/photos
chmod 755 /app/certs /app/data /app/uploads 2>/dev/null || true

if [ ! -f "$KEY" ] || [ ! -f "$CERT" ]; then
  HOST="${SERVER_HOSTNAME:-localhost}"

  echo "[kiosk] Generating self-signed TLS certificate for: $HOST"

  # Build SubjectAltName — iOS Safari requires SANs (rejects certs without them)
  if echo "$HOST" | grep -qE '^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$'; then
    ALT="IP.1 = $HOST
IP.2 = 127.0.0.1
DNS.1 = localhost"
  else
    ALT="DNS.1 = $HOST
DNS.2 = localhost
IP.1 = 127.0.0.1"
  fi

  CFG=$(mktemp)
  cat > "$CFG" << OPENSSLCFG
[req]
prompt             = no
default_md         = sha256
distinguished_name = dn
x509_extensions    = v3_req

[dn]
CN = $HOST

[v3_req]
subjectAltName   = @alt_names
basicConstraints = CA:FALSE
keyUsage         = digitalSignature, keyEncipherment

[alt_names]
$ALT
OPENSSLCFG

  openssl req -x509 -newkey rsa:2048 \
    -keyout "$KEY" -out "$CERT" \
    -days 730 -nodes \
    -config "$CFG"

  rm -f "$CFG"

  echo "[kiosk] Certificate written to /app/certs/cert.pem"
  echo "[kiosk] --- iPad setup ---"
  echo "[kiosk] 1. Copy cert.pem from the 'certs' volume to your iPad (AirDrop, email, etc.)"
  echo "[kiosk] 2. On iPad: Settings → General → VPN & Device Management → install the profile"
  echo "[kiosk] 3. Settings → General → About → Certificate Trust Settings → enable full trust"
  echo "[kiosk] ----------------"
fi

exec node server.js
