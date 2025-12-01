#!/bin/bash
cd /home/user/apps/protocol-maker/backend

# Активировать виртуальное окружение если оно есть
if [ -d "venv" ]; then
    source venv/bin/activate
elif [ -d ".venv" ]; then
    source .venv/bin/activate
fi

# Найти и остановить текущий процесс
PID=$(pgrep -f 'python.*main.py')
if [ ! -z "$PID" ]; then
    echo "Stopping backend (PID: $PID)..."
    kill $PID
    sleep 2
fi

# Запустить бэкенд в фоне
echo "Starting backend..."
nohup python3 main.py > backend.log 2>&1 &

# Подождать и проверить
sleep 2
NEW_PID=$(pgrep -f 'python.*main.py')
if [ ! -z "$NEW_PID" ]; then
    echo "Backend started successfully (PID: $NEW_PID)"
else
    echo "Failed to start backend. Check backend.log for errors."
    exit 1
fi

