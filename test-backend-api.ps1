# Скрипт для тестирования бэкенда API
$baseUrl = "http://83.166.246.90:3001"

Write-Host "=== Тестирование Protocol Maker API ===" -ForegroundColor Cyan

# 1. Тест корневого эндпоинта
Write-Host "`n1. Тест GET /" -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "$baseUrl/" -Method Get
    Write-Host "   ✓ Успешно: $($response.message)" -ForegroundColor Green
} catch {
    Write-Host "   ✗ Ошибка: $_" -ForegroundColor Red
}

# 2. Тест получения типов протоколов
Write-Host "`n2. Тест GET /api/protocol-types" -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "$baseUrl/api/protocol-types" -Method Get
    Write-Host "   ✓ Найдено типов протоколов: $($response.Count)" -ForegroundColor Green
    $response | ForEach-Object { Write-Host "     - $($_.name)" }
} catch {
    Write-Host "   ✗ Ошибка: $_" -ForegroundColor Red
}

# 3. Тест загрузки файла (требует аудио файл)
Write-Host "`n3. Тест POST /api/protocols/submit" -ForegroundColor Yellow
Write-Host "   Для тестирования загрузки файла:" -ForegroundColor Gray
Write-Host "   curl -X POST `"$baseUrl/api/protocols/submit`" \" -ForegroundColor Gray
Write-Host "        -F `"protocolType=standard-meeting`" \" -ForegroundColor Gray
Write-Host "        -F `"participants=[{\\\"name\\\":\\\"Test User\\\",\\\"role\\\":\\\"Participant\\\"}]`" \" -ForegroundColor Gray
Write-Host "        -F `"audioFile=@path/to/audio.mp3`" \" -ForegroundColor Gray
Write-Host "        -F `"saveTranscript=true`"" -ForegroundColor Gray

Write-Host "`nИли используйте Swagger UI: $baseUrl/docs" -ForegroundColor Cyan

