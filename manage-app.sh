#!/bin/bash

# Скрипт управления приложением Protocol Maker на удаленном сервере
# Использование: ./manage-app.sh [start|stop|restart|status|logs|logs-backend|logs-frontend]

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

# Функция для выполнения команд на удаленном сервере
remote_exec() {
    ssh -i "$SSH_KEY_FILE" -p "$SSH_PORT" -o StrictHostKeyChecking=no "${SSH_USER}@${SSH_HOST}" "$@"
}

# Проверка SSH ключа
if [ ! -f "$SSH_KEY_FILE" ]; then
    echo -e "${RED}✗ SSH key file not found: $SSH_KEY_FILE${NC}"
    exit 1
fi

chmod 600 "$SSH_KEY_FILE" 2>/dev/null || true

# Функция показа помощи
show_help() {
    echo -e "${BLUE}Protocol Maker Management Script${NC}"
    echo ""
    echo "Usage: $0 [command]"
    echo ""
    echo "Commands:"
    echo "  start          - Start both backend and frontend services"
    echo "  stop           - Stop both backend and frontend services"
    echo "  restart        - Restart both backend and frontend services"
    echo "  status         - Show status of both services"
    echo "  logs           - Show logs from both services (follow mode)"
    echo "  logs-backend   - Show backend logs (follow mode)"
    echo "  logs-frontend  - Show frontend logs (follow mode)"
    echo "  update         - Pull latest code and restart services"
    echo "  ssh            - Open SSH connection to server"
    echo ""
}

# Обработка команд
case "${1:-help}" in
    start)
        echo -e "${YELLOW}Starting services...${NC}"
        remote_exec "sudo systemctl start ${APP_NAME}-backend ${APP_NAME}-frontend"
        echo -e "${GREEN}✓ Services started${NC}"
        ;;
    
    stop)
        echo -e "${YELLOW}Stopping services...${NC}"
        remote_exec "sudo systemctl stop ${APP_NAME}-backend ${APP_NAME}-frontend"
        echo -e "${GREEN}✓ Services stopped${NC}"
        ;;
    
    restart)
        echo -e "${YELLOW}Restarting services...${NC}"
        remote_exec "sudo systemctl restart ${APP_NAME}-backend ${APP_NAME}-frontend"
        echo -e "${GREEN}✓ Services restarted${NC}"
        sleep 2
        echo ""
        echo -e "${YELLOW}Service status:${NC}"
        remote_exec "sudo systemctl status ${APP_NAME}-backend --no-pager -l | head -15"
        echo ""
        remote_exec "sudo systemctl status ${APP_NAME}-frontend --no-pager -l | head -15"
        ;;
    
    status)
        echo -e "${BLUE}Backend status:${NC}"
        remote_exec "sudo systemctl status ${APP_NAME}-backend --no-pager -l"
        echo ""
        echo -e "${BLUE}Frontend status:${NC}"
        remote_exec "sudo systemctl status ${APP_NAME}-frontend --no-pager -l"
        ;;
    
    logs)
        echo -e "${YELLOW}Showing logs from both services (Ctrl+C to exit)...${NC}"
        remote_exec "sudo journalctl -u ${APP_NAME}-backend -u ${APP_NAME}-frontend -f"
        ;;
    
    logs-backend)
        echo -e "${YELLOW}Showing backend logs (Ctrl+C to exit)...${NC}"
        remote_exec "sudo journalctl -u ${APP_NAME}-backend -f"
        ;;
    
    logs-frontend)
        echo -e "${YELLOW}Showing frontend logs (Ctrl+C to exit)...${NC}"
        remote_exec "sudo journalctl -u ${APP_NAME}-frontend -f"
        ;;
    
    update)
        echo -e "${YELLOW}Updating application...${NC}"
        echo "This will pull latest code and restart services."
        read -p "Continue? (y/n) " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            echo -e "${YELLOW}Pulling latest code...${NC}"
            remote_exec "cd /opt/apps/${APP_NAME} && git pull || echo 'Not a git repository, skipping pull'"
            echo -e "${YELLOW}Rebuilding frontend...${NC}"
            remote_exec "cd /opt/apps/${APP_NAME} && pnpm install --frozen-lockfile && pnpm build"
            echo -e "${YELLOW}Restarting services...${NC}"
            remote_exec "sudo systemctl restart ${APP_NAME}-backend ${APP_NAME}-frontend"
            echo -e "${GREEN}✓ Update complete${NC}"
        else
            echo "Update cancelled"
        fi
        ;;
    
    ssh)
        echo -e "${YELLOW}Connecting to server...${NC}"
        ssh -i "$SSH_KEY_FILE" -p "$SSH_PORT" "${SSH_USER}@${SSH_HOST}"
        ;;
    
    help|--help|-h)
        show_help
        ;;
    
    *)
        echo -e "${RED}Unknown command: $1${NC}"
        echo ""
        show_help
        exit 1
        ;;
esac

