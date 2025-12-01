#!/bin/bash
# Скрипт для полной перезагрузки проекта на сервере

SERVER="protocolmaker@83.166.246.90"
SERVER_PATH="/opt/protocol-maker-frontend"

echo "=== Полная перезагрузка проекта Protocol Maker ==="
echo ""

# 1. Остановить сервисы
echo "1. Останавливаем сервисы..."
ssh $SERVER "echo '123' | sudo -S systemctl stop protocol-maker-frontend.service"
ssh $SERVER "echo '123' | sudo -S systemctl stop protocol-maker-backend.service"
echo "✓ Сервисы остановлены"
echo ""

# 2. Очистить старые файлы (опционально, закомментировано для безопасности)
# echo "2. Очищаем старые файлы..."
# ssh $SERVER "rm -rf $SERVER_PATH/dist"
# ssh $SERVER "rm -rf $SERVER_PATH/node_modules"
# echo "✓ Старые файлы очищены"
# echo ""

# 3. Отправить все файлы проекта
echo "2. Отправляем файлы проекта..."
rsync -avz --exclude 'node_modules' --exclude '.git' --exclude 'dist' --exclude '__pycache__' \
  ./ $SERVER:$SERVER_PATH/
echo "✓ Файлы отправлены"
echo ""

# 4. Пересобрать фронтенд
echo "3. Пересобираем фронтенд..."
ssh $SERVER "cd $SERVER_PATH && npm run build"
echo "✓ Фронтенд пересобран"
echo ""

# 5. Перезапустить сервисы
echo "4. Перезапускаем сервисы..."
ssh $SERVER "echo '123' | sudo -S systemctl start protocol-maker-backend.service"
ssh $SERVER "echo '123' | sudo -S systemctl start protocol-maker-frontend.service"
echo "✓ Сервисы перезапущены"
echo ""

# 6. Проверить статус
echo "5. Проверяем статус сервисов..."
ssh $SERVER "echo '123' | sudo -S systemctl status protocol-maker-backend.service --no-pager | head -5"
ssh $SERVER "echo '123' | sudo -S systemctl status protocol-maker-frontend.service --no-pager | head -5"
echo ""

echo "=== Перезагрузка завершена ==="
echo "Проверьте приложение по адресу: http://83.166.246.90:3000"
echo ""
echo "ВАЖНО: Очистите кеш браузера (Ctrl+Shift+R) после перезагрузки!"

