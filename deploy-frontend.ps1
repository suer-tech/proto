# Скрипт для отправки фронтенда на сервер
$server = "protocolmaker@83.166.246.90"
$remotePath = "/opt/protocol-maker-frontend/client/dist"

# Переходим в корень проекта
$rootDir = Split-Path -Parent $PSScriptRoot
Set-Location $rootDir

Write-Host "Current directory: $(Get-Location)" -ForegroundColor Cyan
Write-Host "Checking dist/public..." -ForegroundColor Yellow

if (-not (Test-Path "dist\public")) {
    Write-Host "ERROR: dist\public not found!" -ForegroundColor Red
    Write-Host "Please run 'cd client; npm run build' first" -ForegroundColor Yellow
    exit 1
}

# Получаем все файлы
$files = Get-ChildItem -Path "dist\public" -Recurse -File
Write-Host "Found $($files.Count) files to upload" -ForegroundColor Green

# Отправляем каждый файл
foreach ($file in $files) {
    $relativePath = $file.FullName.Replace((Resolve-Path "dist\public").Path, "").TrimStart('\')
    $remoteFilePath = "$remotePath/$($relativePath.Replace('\', '/'))"
    
    # Создаем директорию на сервере если нужно
    $remoteDir = Split-Path $remoteFilePath
    ssh $server "mkdir -p $remoteDir" 2>$null
    
    Write-Host "Uploading: $relativePath" -ForegroundColor Cyan
    scp $file.FullName "${server}:${remoteFilePath}"
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "  OK" -ForegroundColor Green
    } else {
        Write-Host "  FAILED" -ForegroundColor Red
    }
}

Write-Host "`nDone! Restart frontend service:" -ForegroundColor Green
Write-Host "ssh $server 'sudo systemctl restart protocol-maker-frontend'" -ForegroundColor Yellow

