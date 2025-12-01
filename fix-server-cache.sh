#!/bin/bash
# Полная очистка кеша и удаление дубликатов на сервере

SERVER="protocolmaker@83.166.246.90"
REMOTE_PATH="/opt/protocol-maker-frontend"

echo "=== Полная очистка кеша и удаление дубликатов ==="
echo ""

# 1. Остановка сервисов
echo "1. Остановка сервисов..."
ssh $SERVER "sudo systemctl stop protocol-maker-backend protocol-maker-frontend"

# 2. Проверка дубликата main.py
echo "2. Проверка дубликата main.py..."
ssh $SERVER "echo '=== Дубликат в корне ===' && ls -lh $REMOTE_PATH/main.py 2>/dev/null || echo 'Файл не найден'"
ssh $SERVER "echo '=== Правильный файл ===' && ls -lh $REMOTE_PATH/backend/main.py"

# 3. Удаление дубликата (если он старый)
echo "3. Удаление дубликата main.py из корня..."
ssh $SERVER "if [ -f $REMOTE_PATH/main.py ]; then echo 'Удаляем дубликат...'; rm -f $REMOTE_PATH/main.py; echo 'Удален'; else echo 'Дубликат не найден'; fi"

# 4. Очистка Python кеша в проекте (НЕ в venv)
echo "4. Очистка Python кеша в проекте..."
ssh $SERVER "cd $REMOTE_PATH/backend && \
  find . -path './venv' -prune -o -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null || true && \
  find . -path './venv' -prune -o -type f -name '*.pyc' -delete 2>/dev/null || true && \
  find . -path './venv' -prune -o -type f -name '*.pyo' -delete 2>/dev/null || true"

# 5. Удаление скомпилированных файлов main.py
echo "5. Удаление скомпилированных версий main.py..."
ssh $SERVER "rm -f $REMOTE_PATH/backend/__pycache__/main.cpython-*.pyc 2>/dev/null || true"
ssh $SERVER "rm -f $REMOTE_PATH/backend/__pycache__/models.cpython-*.pyc 2>/dev/null || true"
ssh $SERVER "rm -rf $REMOTE_PATH/backend/__pycache__ 2>/dev/null || true"
ssh $SERVER "rm -rf $REMOTE_PATH/backend/services/__pycache__ 2>/dev/null || true"

# 6. Проверка содержимого правильного main.py
echo "6. Проверка содержимого правильного main.py (строки 216-222)..."
ssh $SERVER "sed -n '216,222p' $REMOTE_PATH/backend/main.py"

# 7. Проверка что автоматический маппинг отключен
echo "7. Проверка отключения автоматического маппинга..."
ssh $SERVER "grep -A 3 'REMOVED: Automatic mapping' $REMOTE_PATH/backend/main.py | head -5"

# 8. Перезагрузка systemd и перезапуск
echo "8. Перезагрузка systemd и перезапуск..."
ssh $SERVER "sudo systemctl daemon-reload && \
  sudo systemctl restart protocol-maker-backend && \
  sudo systemctl restart protocol-maker-frontend"

# 9. Проверка статуса
echo "9. Проверка статуса..."
echo "--- Backend ---"
ssh $SERVER "sudo systemctl status protocol-maker-backend --no-pager -l | head -25"
echo ""
echo "--- Frontend ---"
ssh $SERVER "sudo systemctl status protocol-maker-frontend --no-pager -l | head -20"

echo ""
echo "=== Готово! ==="

