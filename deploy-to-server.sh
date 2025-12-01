#!/bin/bash

# Скрипт деплоя Protocol Maker на удаленный сервер с изоляцией окружения
# Использование: ./deploy-to-server.sh

set -e

# Цвета для вывода
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Параметры подключения
SSH_HOST="176.98.234.178"
SSH_PORT="11122"
SSH_USER="user"
SSH_KEY_FILE="$(dirname "$0")/user"
APP_NAME="protocol-maker"
# Используем домашнюю директорию для избежания необходимости sudo
# Получаем полный путь к домашней директории на сервере
APP_DIR_BASE=$(ssh -i "$SSH_KEY_FILE" -p "$SSH_PORT" -o StrictHostKeyChecking=no "${SSH_USER}@${SSH_HOST}" "echo \$HOME")
APP_DIR="${APP_DIR_BASE}/apps/${APP_NAME}"
# Определяем имя пользователя на сервере через SSH
REMOTE_USER="${SSH_USER}"

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}🚀 Protocol Maker Deployment Script${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Проверка SSH ключа
if [ ! -f "$SSH_KEY_FILE" ]; then
    echo -e "${RED}✗ SSH key file not found: $SSH_KEY_FILE${NC}"
    exit 1
fi

# Установка правильных прав на SSH ключ
chmod 600 "$SSH_KEY_FILE"

echo -e "${GREEN}✓ SSH key found${NC}"
echo -e "${GREEN}✓ Target server: ${SSH_USER}@${SSH_HOST}:${SSH_PORT}${NC}"
echo -e "${GREEN}✓ App directory: ${APP_DIR}${NC}"
echo ""

# Функция для выполнения команд на удаленном сервере
remote_exec() {
    ssh -i "$SSH_KEY_FILE" -p "$SSH_PORT" -o StrictHostKeyChecking=no "${SSH_USER}@${SSH_HOST}" "$@"
}

# Функция для копирования файлов на сервер
remote_copy() {
    scp -i "$SSH_KEY_FILE" -P "$SSH_PORT" -o StrictHostKeyChecking=no -r "$@"
}

# Шаг 1: Проверка подключения к серверу
echo -e "${YELLOW}[1/9] Testing SSH connection...${NC}"
if ! remote_exec "echo 'Connection successful'" > /dev/null 2>&1; then
    echo -e "${RED}✗ Cannot connect to server${NC}"
    exit 1
fi
echo -e "${GREEN}✓ SSH connection successful${NC}"
echo ""

# Шаг 2: Проверка зависимостей на сервере
echo -e "${YELLOW}[2/9] Checking server dependencies...${NC}"
MISSING_DEPS_OUTPUT=$(remote_exec "bash -c '
    MISSING_DEPS=()
    if ! command -v python3 &> /dev/null; then MISSING_DEPS+=(\"python3\"); fi
    if ! command -v node &> /dev/null; then MISSING_DEPS+=(\"nodejs\"); fi
    if ! command -v pnpm &> /dev/null; then MISSING_DEPS+=(\"pnpm\"); fi
    if ! command -v nginx &> /dev/null; then MISSING_DEPS+=(\"nginx\"); fi
    if [ \${#MISSING_DEPS[@]} -gt 0 ]; then
        echo \"MISSING:\${MISSING_DEPS[*]}\"
    else
        echo \"OK\"
    fi
'" 2>&1)

if echo "$MISSING_DEPS_OUTPUT" | grep -q "MISSING:"; then
    echo -e "${YELLOW}⚠ Some dependencies are missing. Installing...${NC}"
    echo -e "${YELLOW}Note: This requires sudo access. You may be prompted for password.${NC}"
    
    # Установка Node.js через nvm (без sudo)
    if echo "$MISSING_DEPS_OUTPUT" | grep -q "nodejs"; then
        echo "Installing Node.js via nvm..."
        remote_exec "bash -c '
            if [ ! -d ~/.nvm ]; then
                curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash > /dev/null 2>&1
            fi
            export NVM_DIR=\"\$HOME/.nvm\"
            [ -s \"\$NVM_DIR/nvm.sh\" ] && . \"\$NVM_DIR/nvm.sh\"
            nvm install 20 > /dev/null 2>&1
            nvm use 20 > /dev/null 2>&1
            nvm alias default 20 > /dev/null 2>&1
            echo \"Node.js installed\"
        '"
    fi
    
    # Установка pnpm (без sudo, через npm)
    if echo "$MISSING_DEPS_OUTPUT" | grep -q "pnpm"; then
        echo "Installing pnpm..."
        remote_exec "bash -c '
            export NVM_DIR=\"\$HOME/.nvm\"
            [ -s \"\$NVM_DIR/nvm.sh\" ] && . \"\$NVM_DIR/nvm.sh\"
            npm install -g pnpm > /dev/null 2>&1
            echo \"pnpm installed\"
        '"
    fi
    
    # Установка остальных зависимостей через sudo (требует пароль)
    NEEDS_SUDO=false
    if echo "$MISSING_DEPS_OUTPUT" | grep -q "nginx"; then
        NEEDS_SUDO=true
    fi
    
    if [ "$NEEDS_SUDO" = true ]; then
        echo -e "${YELLOW}⚠ Nginx installation requires sudo. Please run manually:${NC}"
        echo -e "${YELLOW}   ssh -i user -p 11122 user@176.98.234.178 'sudo apt-get update && sudo apt-get install -y nginx'${NC}"
        echo -e "${YELLOW}   Or configure passwordless sudo for this user.${NC}"
    fi
else
    echo -e "${GREEN}✓ All dependencies found${NC}"
fi
echo -e "${GREEN}✓ Server dependencies ready${NC}"
echo ""

# Шаг 3: Создание директории приложения
echo -e "${YELLOW}[3/9] Creating application directory...${NC}"
if remote_exec "test -d ${APP_DIR}" > /dev/null 2>&1; then
    echo -e "${YELLOW}⚠ Application directory already exists. Will update existing installation.${NC}"
fi
remote_exec "mkdir -p ${APP_DIR}"
echo -e "${GREEN}✓ Application directory ready${NC}"
echo ""

# Шаг 4: Копирование проекта на сервер
echo -e "${YELLOW}[4/9] Copying project files to server...${NC}"
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Создаем временный архив для передачи
TEMP_DIR=$(mktemp -d)
TEMP_ARCHIVE="${TEMP_DIR}/${APP_NAME}.tar.gz"

echo "Creating archive..."
cd "$PROJECT_DIR"
tar --exclude='node_modules' \
    --exclude='backend/venv' \
    --exclude='backend/__pycache__' \
    --exclude='backend/uploads/*' \
    --exclude='.git' \
    --exclude='dist' \
    --exclude='*.log' \
    -czf "$TEMP_ARCHIVE" .

echo "Uploading to server..."
remote_copy "$TEMP_ARCHIVE" "${SSH_USER}@${SSH_HOST}:${APP_DIR}/"

echo "Extracting on server..."
remote_exec "cd ${APP_DIR} && tar -xzf ${APP_NAME}.tar.gz && rm ${APP_NAME}.tar.gz"

# Очистка временных файлов
rm -rf "$TEMP_DIR"

echo -e "${GREEN}✓ Project files copied${NC}"
echo ""

# Шаг 5: Настройка бэкенда
echo -e "${YELLOW}[5/9] Setting up backend...${NC}"
remote_exec "bash -c '
    cd ${APP_DIR}/backend
    if [ ! -d venv ]; then
        python3 -m venv venv
    fi
    source venv/bin/activate
    pip install --upgrade pip --quiet
    pip install -r requirements.txt --quiet
    mkdir -p uploads data
'"
echo -e "${GREEN}✓ Backend setup complete${NC}"
echo ""

# Шаг 6: Проверка и создание .env файла
echo -e "${YELLOW}[6/9] Checking environment configuration...${NC}"
remote_exec "bash -c '
    cd ${APP_DIR}
    if [ ! -f .env ]; then
        cat > .env << EOF
# Backend API
PORT=3001
NODE_ENV=production

# OpenAI API Key (REQUIRED - update this!)
OPENAI_API_KEY=your_openai_api_key_here

# Hugging Face Token (REQUIRED for diarization - update this!)
HUGGINGFACE_HUB_TOKEN=your_huggingface_token_here

# Frontend API URL
VITE_API_URL=http://${SSH_HOST}:3001/api

# CORS Origins
CORS_ORIGINS=http://localhost:3000,http://${SSH_HOST}:3000,http://${SSH_HOST}
EOF
        echo \"⚠ .env file created with template values\"
        echo \"⚠ Please update API keys in ${APP_DIR}/.env\"
    else
        echo \"✓ .env file already exists\"
    fi
'"
echo ""

# Шаг 7: Сборка фронтенда
echo -e "${YELLOW}[7/9] Building frontend...${NC}"
remote_exec "bash -c '
    cd ${APP_DIR}
    export NODE_ENV=production
    pnpm install --frozen-lockfile
    pnpm build
    mkdir -p dist/public
'"
echo -e "${GREEN}✓ Frontend built${NC}"
echo ""

# Шаг 8: Создание systemd сервисов
echo -e "${YELLOW}[8/9] Creating systemd services...${NC}"

# Backend service
remote_exec "sudo tee /etc/systemd/system/${APP_NAME}-backend.service > /dev/null" << EOF
[Unit]
Description=Protocol Maker Backend API
After=network.target

[Service]
Type=simple
User=${REMOTE_USER}
WorkingDirectory=${APP_DIR}/backend
Environment="PATH=${APP_DIR}/backend/venv/bin:/usr/local/bin:/usr/bin:/bin"
EnvironmentFile=${APP_DIR}/.env
ExecStart=${APP_DIR}/backend/venv/bin/uvicorn main:app --host 127.0.0.1 --port 3001
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal

# Resource limits (important for 1GB RAM server)
MemoryLimit=512M
CPUQuota=50%

[Install]
WantedBy=multi-user.target
EOF

# Frontend service
remote_exec "sudo tee /etc/systemd/system/${APP_NAME}-frontend.service > /dev/null" << EOF
[Unit]
Description=Protocol Maker Frontend
After=network.target

[Service]
Type=simple
User=${REMOTE_USER}
WorkingDirectory=${APP_DIR}
Environment="NODE_ENV=production"
Environment="PORT=3000"
EnvironmentFile=${APP_DIR}/.env
ExecStart=/usr/bin/node ${APP_DIR}/dist/index.js
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal

# Resource limits
MemoryLimit=256M
CPUQuota=30%

[Install]
WantedBy=multi-user.target
EOF

# Перезагрузка systemd и включение сервисов
remote_exec "sudo systemctl daemon-reload"
remote_exec "sudo systemctl enable ${APP_NAME}-backend"
remote_exec "sudo systemctl enable ${APP_NAME}-frontend"

echo -e "${GREEN}✓ Systemd services created${NC}"
echo ""

# Шаг 9: Настройка Nginx
echo -e "${YELLOW}[9/9] Configuring Nginx...${NC}"
remote_exec "sudo tee /etc/nginx/sites-available/${APP_NAME}" > /dev/null << EOF
# Nginx configuration for ${APP_NAME}
# Auto-generated by deploy script

upstream ${APP_NAME}_backend {
    server 127.0.0.1:3001;
}

upstream ${APP_NAME}_frontend {
    server 127.0.0.1:3000;
}

server {
    listen 80;
    server_name ${SSH_HOST} _;

    # Увеличенный размер загружаемых файлов
    client_max_body_size 100M;

    # Увеличенные таймауты
    proxy_read_timeout 300s;
    proxy_connect_timeout 75s;
    proxy_send_timeout 300s;

    # Frontend
    location / {
        proxy_pass http://${APP_NAME}_frontend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
    }

    # Backend API
    location /api {
        proxy_pass http://${APP_NAME}_backend/api;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        
        # CORS headers
        add_header 'Access-Control-Allow-Origin' '*' always;
        add_header 'Access-Control-Allow-Methods' 'GET, POST, PUT, DELETE, OPTIONS' always;
        add_header 'Access-Control-Allow-Headers' 'Authorization, Content-Type' always;
        
        if (\$request_method = 'OPTIONS') {
            return 204;
        }
    }

    # Логирование
    access_log /var/log/nginx/${APP_NAME}-access.log;
    error_log /var/log/nginx/${APP_NAME}-error.log;
}
EOF

# Активация конфигурации Nginx
remote_exec "sudo ln -sf /etc/nginx/sites-available/${APP_NAME} /etc/nginx/sites-enabled/${APP_NAME}"
remote_exec "sudo nginx -t && sudo systemctl reload nginx || echo 'Nginx configuration test failed'"

echo -e "${GREEN}✓ Nginx configured${NC}"
echo ""

# Запуск сервисов
echo -e "${YELLOW}Starting services...${NC}"
remote_exec "sudo systemctl restart ${APP_NAME}-backend"
remote_exec "sudo systemctl restart ${APP_NAME}-frontend"

# Проверка статуса
echo ""
echo -e "${BLUE}========================================${NC}"
echo -e "${GREEN}✅ Deployment completed!${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""
echo -e "${GREEN}Application deployed to:${NC}"
echo -e "  📁 Directory: ${APP_DIR}"
echo -e "  🌐 Frontend: http://${SSH_HOST}:3000"
echo -e "  🔧 Backend: http://${SSH_HOST}:3001"
echo -e "  🌍 Nginx: http://${SSH_HOST}"
echo ""
echo -e "${YELLOW}⚠ IMPORTANT: Update API keys in ${APP_DIR}/.env${NC}"
echo ""
echo -e "${BLUE}Useful commands:${NC}"
echo -e "  # Check status"
echo -e "  ssh -i ${SSH_KEY_FILE} -p ${SSH_PORT} ${SSH_USER}@${SSH_HOST} 'sudo systemctl status ${APP_NAME}-backend'"
echo -e "  ssh -i ${SSH_KEY_FILE} -p ${SSH_PORT} ${SSH_USER}@${SSH_HOST} 'sudo systemctl status ${APP_NAME}-frontend'"
echo ""
echo -e "  # View logs"
echo -e "  ssh -i ${SSH_KEY_FILE} -p ${SSH_PORT} ${SSH_USER}@${SSH_HOST} 'sudo journalctl -u ${APP_NAME}-backend -f'"
echo -e "  ssh -i ${SSH_KEY_FILE} -p ${SSH_PORT} ${SSH_USER}@${SSH_HOST} 'sudo journalctl -u ${APP_NAME}-frontend -f'"
echo ""
echo -e "  # Restart services"
echo -e "  ssh -i ${SSH_KEY_FILE} -p ${SSH_PORT} ${SSH_USER}@${SSH_HOST} 'sudo systemctl restart ${APP_NAME}-backend'"
echo -e "  ssh -i ${SSH_KEY_FILE} -p ${SSH_PORT} ${SSH_USER}@${SSH_HOST} 'sudo systemctl restart ${APP_NAME}-frontend'"
echo ""
echo -e "  # Stop services"
echo -e "  ssh -i ${SSH_KEY_FILE} -p ${SSH_PORT} ${SSH_USER}@${SSH_HOST} 'sudo systemctl stop ${APP_NAME}-backend ${APP_NAME}-frontend'"
echo ""
echo -e "  # Start services"
echo -e "  ssh -i ${SSH_KEY_FILE} -p ${SSH_PORT} ${SSH_USER}@${SSH_HOST} 'sudo systemctl start ${APP_NAME}-backend ${APP_NAME}-frontend'"
echo ""

