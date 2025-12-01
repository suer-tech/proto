#!/bin/bash
# Полная перезагрузка проекта Protocol Maker на сервере

SERVER="protocolmaker@83.166.246.90"
SERVER_PATH="/opt/protocol-maker-frontend"
BACKUP_PATH="/opt/protocol-maker-frontend-backup-$(date +%Y%m%d-%H%M%S)"

echo "=== Полная перезагрузка проекта Protocol Maker ==="
echo ""

# 1. Остановить сервисы
echo "1. Останавливаем сервисы..."
ssh $SERVER "echo '123' | sudo -S systemctl stop protocol-maker-frontend.service"
ssh $SERVER "echo '123' | sudo -S systemctl stop protocol-maker-backend.service"
echo "✓ Сервисы остановлены"
echo ""

# 2. Создать резервную копию (на всякий случай)
echo "2. Создаем резервную копию..."
ssh $SERVER "if [ -d $SERVER_PATH ]; then sudo cp -r $SERVER_PATH $BACKUP_PATH && echo 'Backup created at $BACKUP_PATH'; fi"
echo "✓ Резервная копия создана"
echo ""

# 3. Удалить старый проект (кроме systemd конфигов и venv, если нужно)
echo "3. Удаляем старый проект..."
ssh $SERVER "if [ -d $SERVER_PATH ]; then sudo rm -rf $SERVER_PATH/* $SERVER_PATH/.* 2>/dev/null; echo 'Old files removed'; fi"
echo "✓ Старые файлы удалены"
echo ""

# 4. Создать директорию заново
echo "4. Создаем директорию заново..."
ssh $SERVER "sudo mkdir -p $SERVER_PATH && sudo chown -R protocolmaker:protocolmaker $SERVER_PATH"
echo "✓ Директория создана"
echo ""

# 5. Отправить все файлы проекта
echo "5. Отправляем файлы проекта..."
rsync -avz --progress \
  --exclude 'node_modules' \
  --exclude '.git' \
  --exclude 'dist' \
  --exclude '__pycache__' \
  --exclude '*.pyc' \
  --exclude '.env' \
  --exclude 'uploads' \
  --exclude '*.log' \
  ./ $SERVER:$SERVER_PATH/
echo "✓ Файлы отправлены"
echo ""

# 6. Восстановить .env если нужно (или создать новый)
echo "6. Проверяем .env файл..."
ssh $SERVER "if [ ! -f $SERVER_PATH/.env ]; then echo 'Creating .env file...'; touch $SERVER_PATH/.env; fi"
echo "✓ .env файл проверен"
echo ""

# 7. Установить зависимости и пересобрать фронтенд
echo "7. Устанавливаем зависимости..."
ssh $SERVER "cd $SERVER_PATH && npm install"
echo "✓ Зависимости установлены"
echo ""

echo "8. Пересобираем фронтенд..."
ssh $SERVER "cd $SERVER_PATH && npm run build"
echo "✓ Фронтенд пересобран"
echo ""

# 8. Перезапустить сервисы
echo "9. Перезапускаем сервисы..."
ssh $SERVER "echo '123' | sudo -S systemctl start protocol-maker-backend.service"
sleep 2
ssh $SERVER "echo '123' | sudo -S systemctl start protocol-maker-frontend.service"
echo "✓ Сервисы перезапущены"
echo ""

# 9. Проверить статус
echo "10. Проверяем статус сервисов..."
ssh $SERVER "echo '123' | sudo -S systemctl status protocol-maker-backend.service --no-pager | head -8"
echo ""
ssh $SERVER "echo '123' | sudo -S systemctl status protocol-maker-frontend.service --no-pager | head -8"
echo ""

echo "=== Перезагрузка завершена ==="
echo "Проверьте приложение по адресу: http://83.166.246.90:3000"
echo ""
echo "ВАЖНО: Очистите кеш браузера (Ctrl+Shift+R) после перезагрузки!"
echo ""
echo "Резервная копия сохранена в: $BACKUP_PATH"

