#!/bin/bash

# Скрипт быстрого развертывания Protocol Maker на VPS

set -e

echo "🚀 Protocol Maker Deployment Script"
echo "===================================="

# Цвета для вывода
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Проверка, что скрипт запущен с правами пользователя
if [ "$EUID" -eq 0 ]; then 
   echo -e "${RED}Error: Please run as normal user, not as root${NC}"
   exit 1
fi

# Получаем путь к проекту
PROJECT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
USER_NAME=$(whoami)

echo -e "${GREEN}✓ Project directory: $PROJECT_DIR${NC}"
echo -e "${GREEN}✓ Running as user: $USER_NAME${NC}"
echo ""

# Шаг 1: Проверка зависимостей
echo -e "${YELLOW}[1/7] Checking dependencies...${NC}"

if ! command -v python3 &> /dev/null; then
    echo -e "${RED}✗ Python 3 not installed${NC}"
    exit 1
fi

if ! command -v node &> /dev/null; then
    echo -e "${RED}✗ Node.js not installed${NC}"
    exit 1
fi

if ! command -v pnpm &> /dev/null; then
    echo -e "${RED}✗ pnpm not installed${NC}"
    exit 1
fi

if ! command -v nginx &> /dev/null; then
    echo -e "${YELLOW}⚠ Nginx not installed. You'll need to install it manually.${NC}"
fi

echo -e "${GREEN}✓ All dependencies found${NC}"
echo ""

# Шаг 2: Установка бэкенда
echo -e "${YELLOW}[2/7] Setting up backend...${NC}"

cd "$PROJECT_DIR/backend"

if [ ! -d "venv" ]; then
    echo "Creating Python virtual environment..."
    python3 -m venv venv
fi

source venv/bin/activate

echo "Installing Python dependencies..."
pip install --upgrade pip
pip install -r requirements.txt

echo -e "${GREEN}✓ Backend dependencies installed${NC}"
echo ""

# Шаг 3: Проверка .env файла
echo -e "${YELLOW}[3/7] Checking environment configuration...${NC}"

if [ ! -f "$PROJECT_DIR/.env" ]; then
    echo -e "${YELLOW}⚠ .env file not found. Creating template...${NC}"
    cat > "$PROJECT_DIR/.env" << EOF
# Backend API
PORT=3001
NODE_ENV=production

# OpenAI API Key
OPENAI_API_KEY=your_openai_api_key_here

# Hugging Face Token
HUGGINGFACE_HUB_TOKEN=your_huggingface_token_here

# Frontend API URL (replace with your server IP or domain)
VITE_API_URL=http://localhost:3001/api
EOF
    echo -e "${YELLOW}⚠ Please edit .env file and add your API keys${NC}"
    read -p "Press enter to continue..."
fi

echo -e "${GREEN}✓ Environment file found${NC}"
echo ""

# Шаг 4: Создание директорий
echo -e "${YELLOW}[4/7] Creating required directories...${NC}"

mkdir -p "$PROJECT_DIR/backend/uploads"
mkdir -p "$PROJECT_DIR/dist/public"

echo -e "${GREEN}✓ Directories created${NC}"
echo ""

# Шаг 5: Установка фронтенда
echo -e "${YELLOW}[5/7] Installing and building frontend...${NC}"

cd "$PROJECT_DIR"
pnpm install
pnpm build

echo -e "${GREEN}✓ Frontend built${NC}"
echo ""

# Шаг 6: Создание systemd сервисов
echo -e "${YELLOW}[6/7] Creating systemd services...${NC}"

# Backend service
sudo tee /etc/systemd/system/protocol-maker-backend.service > /dev/null << EOF
[Unit]
Description=Protocol Maker Backend API
After=network.target

[Service]
Type=simple
User=$USER_NAME
WorkingDirectory=$PROJECT_DIR/backend
Environment="PATH=$PROJECT_DIR/backend/venv/bin"
EnvironmentFile=$PROJECT_DIR/.env
ExecStart=$PROJECT_DIR/backend/venv/bin/uvicorn main:app --host 0.0.0.0 --port 3001
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

# Frontend service
sudo tee /etc/systemd/system/protocol-maker-frontend.service > /dev/null << EOF
[Unit]
Description=Protocol Maker Frontend
After=network.target

[Service]
Type=simple
User=$USER_NAME
WorkingDirectory=$PROJECT_DIR
Environment="NODE_ENV=production"
Environment="PORT=3000"
EnvironmentFile=$PROJECT_DIR/.env
ExecStart=/usr/bin/node $PROJECT_DIR/dist/index.js
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

echo -e "${GREEN}✓ Systemd services created${NC}"
echo ""

# Шаг 7: Запуск сервисов
echo -e "${YELLOW}[7/7] Starting services...${NC}"

sudo systemctl daemon-reload

sudo systemctl enable protocol-maker-backend
sudo systemctl enable protocol-maker-frontend

sudo systemctl restart protocol-maker-backend
sudo systemctl restart protocol-maker-frontend

echo ""
echo -e "${GREEN}✓ Services started${NC}"
echo ""

# Проверка статуса
echo -e "${YELLOW}Checking service status...${NC}"
echo ""
echo "Backend status:"
sudo systemctl status protocol-maker-backend --no-pager || true
echo ""
echo "Frontend status:"
sudo systemctl status protocol-maker-frontend --no-pager || true
echo ""

echo -e "${GREEN}=============================================${NC}"
echo -e "${GREEN}✅ Deployment completed!${NC}"
echo -e "${GREEN}=============================================${NC}"
echo ""
echo "Your application is running:"
echo "  - Backend: http://localhost:3001"
echo "  - Frontend: http://localhost:3000"
echo ""
echo "Useful commands:"
echo "  sudo systemctl status protocol-maker-backend"
echo "  sudo systemctl status protocol-maker-frontend"
echo "  sudo journalctl -u protocol-maker-backend -f"
echo "  sudo journalctl -u protocol-maker-frontend -f"
echo ""
echo "Next steps:"
echo "1. Configure Nginx (see DEPLOYMENT_GUIDE.md)"
echo "2. Set up SSL certificate with Let's Encrypt"
echo "3. Configure firewall (ufw allow 80,443)"
echo ""

