#!/bin/bash
# Скрипт для деплоя обновлений на сервер

SERVER="protocolmaker@83.166.246.90"
REMOTE_PATH="/opt/protocol-maker-frontend"

echo "Распаковка фронтенда..."
ssh $SERVER "cd $REMOTE_PATH/client/dist && tar -xzf /tmp/frontend-update.tar.gz && rm /tmp/frontend-update.tar.gz"

echo "Очистка Python кеша..."
ssh $SERVER "cd $REMOTE_PATH/backend && find . -type d -name __pycache__ -exec rm -r {} + 2>/dev/null || true && find . -type f -name '*.pyc' -delete 2>/dev/null || true"

echo "Перезапуск сервисов..."
ssh $SERVER "sudo systemctl restart protocol-maker-backend && sudo systemctl restart protocol-maker-frontend"

echo "Проверка статуса..."
ssh $SERVER "sudo systemctl status protocol-maker-backend --no-pager -l | head -20"
echo ""
ssh $SERVER "sudo systemctl status protocol-maker-frontend --no-pager -l | head -20"

echo "✅ Деплой завершен!"

