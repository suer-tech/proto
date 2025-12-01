#!/bin/bash
# Script to set up HTTPS for Protocol-Maker using nginx and Let's Encrypt
# Usage: ./setup-https.sh your-domain.com

set -e

DOMAIN=$1
EMAIL=${2:-"admin@${DOMAIN}"}

if [ -z "$DOMAIN" ]; then
    echo "Usage: $0 <domain> [email]"
    echo "Example: $0 protocol-maker.example.com admin@example.com"
    exit 1
fi

echo "Setting up HTTPS for Protocol-Maker on domain: $DOMAIN"
echo "Email for Let's Encrypt: $EMAIL"

# Check if running as root
if [ "$EUID" -ne 0 ]; then 
    echo "Please run as root (use sudo)"
    exit 1
fi

# Install certbot if not installed
if ! command -v certbot &> /dev/null; then
    echo "Installing certbot..."
    apt-get update
    apt-get install -y certbot python3-certbot-nginx
fi

# Create nginx configuration
echo "Creating nginx configuration..."
CONFIG_FILE="/etc/nginx/sites-available/protocol-maker"
cat > "$CONFIG_FILE" <<EOF
# HTTP to HTTPS redirect
server {
    listen 80;
    listen [::]:80;
    server_name ${DOMAIN} www.${DOMAIN};

    location /.well-known/acme-challenge/ {
        root /var/www/html;
    }

    location / {
        return 301 https://\$server_name\$request_uri;
    }
}

# HTTPS server (will be completed by certbot)
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name ${DOMAIN} www.${DOMAIN};

    # SSL certificates will be added by certbot

    # Frontend
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
    }

    # Backend API
    location /api/ {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        
        # Timeouts for long-running requests
        proxy_connect_timeout 300s;
        proxy_send_timeout 300s;
        proxy_read_timeout 300s;
    }

    client_max_body_size 500M;
}
EOF

# Enable site
if [ ! -L "/etc/nginx/sites-enabled/protocol-maker" ]; then
    ln -s "$CONFIG_FILE" /etc/nginx/sites-enabled/protocol-maker
fi

# Test nginx configuration
echo "Testing nginx configuration..."
nginx -t

# Reload nginx
echo "Reloading nginx..."
systemctl reload nginx

# Obtain SSL certificate
echo "Obtaining SSL certificate from Let's Encrypt..."
certbot --nginx -d "$DOMAIN" -d "www.${DOMAIN}" --non-interactive --agree-tos --email "$EMAIL" --redirect

# Set up auto-renewal
echo "Setting up automatic certificate renewal..."
systemctl enable certbot.timer
systemctl start certbot.timer

echo ""
echo "✓ HTTPS setup complete!"
echo "Your Protocol-Maker is now available at: https://${DOMAIN}"
echo ""
echo "Certificate will auto-renew. Test renewal with: sudo certbot renew --dry-run"

