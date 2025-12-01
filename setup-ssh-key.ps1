# Скрипт для настройки SSH ключа на сервере
# Запустите этот скрипт ОДИН раз, введите пароль, и дальше пароль не потребуется

$server = "protocolmaker@83.166.246.90"
$pubkeyPath = "$env:USERPROFILE\.ssh\id_rsa.pub"

if (-not (Test-Path $pubkeyPath)) {
    Write-Host "SSH ключ не найден. Создаю новый ключ..."
    ssh-keygen -t rsa -b 4096 -f "$env:USERPROFILE\.ssh\id_rsa" -N '""' -C "protocol-maker-deployment"
}

Write-Host "Читаю публичный ключ..."
$pubkey = Get-Content $pubkeyPath

Write-Host "Копирую ключ на сервер $server..."
Write-Host "Введите пароль ОДИН РАЗ:"

$cmd = "mkdir -p ~/.ssh; chmod 700 ~/.ssh; echo '$pubkey' >> ~/.ssh/authorized_keys; chmod 600 ~/.ssh/authorized_keys; echo 'SSH ключ успешно добавлен!'"
ssh $server $cmd

Write-Host "`nГотово! Теперь вы можете подключаться без пароля."
Write-Host "Проверяю подключение..."

ssh $server "echo 'SSH ключ работает!'"

