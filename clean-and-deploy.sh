#!/bin/bash
# Полная очистка кеша и обновление всех файлов на сервере

SERVER="protocolmaker@83.166.246.90"
REMOTE_PATH="/opt/protocol-maker-frontend"

echo "=== Полная очистка и обновление на сервере ==="
echo ""

# 1. Остановка сервисов
echo "1. Остановка сервисов..."
ssh $SERVER "sudo systemctl stop protocol-maker-backend protocol-maker-frontend"

# 2. Очистка Python кеша
echo "2. Очистка Python кеша..."
ssh $SERVER "cd $REMOTE_PATH/backend && \
  find . -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null || true && \
  find . -type f -name '*.pyc' -delete 2>/dev/null || true && \
  find . -type f -name '*.pyo' -delete 2>/dev/null || true && \
  find . -type d -name '*.egg-info' -exec rm -rf {} + 2>/dev/null || true"

# 3. Очистка Node.js кеша
echo "3. Очистка Node.js кеша..."
ssh $SERVER "cd $REMOTE_PATH && \
  rm -rf node_modules/.cache 2>/dev/null || true && \
  rm -rf client/node_modules/.cache 2>/dev/null || true && \
  rm -rf dist/.vite 2>/dev/null || true"

# 4. Проверка структуры директорий
echo "4. Проверка структуры директорий..."
ssh $SERVER "ls -la $REMOTE_PATH/backend/main.py"
ssh $SERVER "ls -la $REMOTE_PATH/client/dist/public/ | head -10"

# 5. Распаковка фронтенда
echo "5. Распаковка фронтенда..."
ssh $SERVER "cd $REMOTE_PATH/client/dist && \
  rm -rf * 2>/dev/null || true && \
  tar -xzf /tmp/frontend-all.tar.gz && \
  rm -f /tmp/frontend-all.tar.gz && \
  ls -la | head -10"

# 6. Проверка версии main.py (первые строки)
echo "6. Проверка версии main.py..."
ssh $SERVER "head -n 5 $REMOTE_PATH/backend/main.py"
ssh $SERVER "grep -n 'def get_llm_client' $REMOTE_PATH/backend/main.py | head -1"
ssh $SERVER "sed -n '219,221p' $REMOTE_PATH/backend/main.py"

# 7. Проверка что автоматический маппинг отключен
echo "7. Проверка отключения автоматического маппинга..."
ssh $SERVER "grep -A 5 'REMOVED: Automatic mapping' $REMOTE_PATH/backend/main.py | head -10"

# 8. Перезапуск сервисов
echo "8. Перезапуск сервисов..."
ssh $SERVER "sudo systemctl daemon-reload && \
  sudo systemctl restart protocol-maker-backend && \
  sudo systemctl restart protocol-maker-frontend"

# 9. Проверка статуса
echo "9. Проверка статуса..."
echo "--- Backend ---"
ssh $SERVER "sudo systemctl status protocol-maker-backend --no-pager -l | head -20"
echo ""
echo "--- Frontend ---"
ssh $SERVER "sudo systemctl status protocol-maker-frontend --no-pager -l | head -20"

echo ""
echo "=== Готово! ==="

