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

  # Generate iOS .mobileconfig profile so the iPad can install the cert via Safari
  UUID1=$(cat /proc/sys/kernel/random/uuid 2>/dev/null || echo "A1B2C3D4-0001-0001-0001-000000000001")
  UUID2=$(cat /proc/sys/kernel/random/uuid 2>/dev/null || echo "A1B2C3D4-0002-0002-0002-000000000002")
  CERT_DATA=$(base64 "$CERT")

  cat > /app/certs/cert.mobileconfig << PROFILE
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>PayloadContent</key>
	<array>
		<dict>
			<key>PayloadCertificateFileName</key>
			<string>kiosk.cer</string>
			<key>PayloadContent</key>
			<data>
$CERT_DATA
			</data>
			<key>PayloadDescription</key>
			<string>Visitor Kiosk TLS Certificate</string>
			<key>PayloadDisplayName</key>
			<string>Visitor Kiosk</string>
			<key>PayloadIdentifier</key>
			<string>com.visitorkiosk.cert</string>
			<key>PayloadType</key>
			<string>com.apple.security.root</string>
			<key>PayloadUUID</key>
			<string>$UUID1</string>
			<key>PayloadVersion</key>
			<integer>1</integer>
		</dict>
	</array>
	<key>PayloadDescription</key>
	<string>Installs the TLS certificate for the Visitor Check-In kiosk</string>
	<key>PayloadDisplayName</key>
	<string>Visitor Kiosk Certificate</string>
	<key>PayloadIdentifier</key>
	<string>com.visitorkiosk</string>
	<key>PayloadRemovalDisallowed</key>
	<false/>
	<key>PayloadType</key>
	<string>Configuration</string>
	<key>PayloadUUID</key>
	<string>$UUID2</string>
	<key>PayloadVersion</key>
	<integer>1</integer>
</dict>
</plist>
PROFILE

  echo "[kiosk] --- iPad setup ---"
  echo "[kiosk] On the iPad, open Safari and go to: http://$HOST/cert"
  echo "[kiosk] Safari will prompt to install a profile — tap Install."
  echo "[kiosk] Then: Settings → General → About → Certificate Trust Settings → enable full trust."
  echo "[kiosk] ----------------"
fi

exec node server.js
