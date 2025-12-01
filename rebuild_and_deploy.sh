#!/bin/bash
# Скрипт для пересборки и отправки фронтенда на сервер

echo "=== Пересборка фронтенда ==="
cd client
npm run build

if [ $? -eq 0 ]; then
    echo "✓ Фронтенд успешно собран"
    echo ""
    echo "=== Отправка на сервер ==="
    scp -r dist/* protocolmaker@83.166.246.90:/opt/protocol-maker-frontend/client/dist/
    
    if [ $? -eq 0 ]; then
        echo "✓ Фронтенд успешно отправлен на сервер"
        echo ""
        echo "=== Перезапуск фронтенд сервиса ==="
        ssh protocolmaker@83.166.246.90 "sudo systemctl restart protocol-maker-frontend"
        echo ""
        echo "✓ Готово! Теперь очистите кеш браузера (Ctrl+Shift+Delete или Ctrl+F5)"
    else
        echo "✗ Ошибка при отправке на сервер"
        exit 1
    fi
else
    echo "✗ Ошибка при сборке фронтенда"
    exit 1
fi

