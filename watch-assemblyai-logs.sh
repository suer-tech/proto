#!/bin/bash
# Скрипт для просмотра логов AssemblyAI в реальном времени

echo "=== Просмотр логов AssemblyAI ==="
echo "Нажмите Ctrl+C для выхода"
echo ""

# Фильтруем только логи AssemblyAI
sudo journalctl -u protocol-maker-backend -f | grep -i -E "(assemblyai|transcription|transcript|upload|polling)" --color=always

