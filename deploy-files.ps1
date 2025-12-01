# Скрипт для копирования обновленных файлов на сервер
# Работает БЕЗ пароля после настройки SSH ключа

$server = "protocolmaker@83.166.246.90"
$remotePath = "/opt/protocol-maker-frontend"

Write-Host "Копирую файлы на сервер $server..." -ForegroundColor Green

# Копируем обновленные файлы фронтенда
Write-Host "`n1. Копирую protocolFormatter.tsx..."
scp client\src\lib\protocolFormatter.tsx "${server}:${remotePath}/client/src/lib/"

Write-Host "`n2. Копирую ProtocolViewer.tsx..."
scp client\src\components\ProtocolViewer.tsx "${server}:${remotePath}/client/src/components/"

Write-Host "`n3. Сборка фронтенда на сервере..." -ForegroundColor Cyan
ssh $server "cd $remotePath/client && pnpm install && pnpm build"

Write-Host "`n4. Перезапуск фронтенда на сервере..." -ForegroundColor Cyan
ssh $server "sudo systemctl restart protocol-maker-frontend"

Write-Host "`nВсе обновления задеплоены успешно!" -ForegroundColor Green
Write-Host "`nОткройте http://83.166.246.90:3000 для проверки" -ForegroundColor Cyan
