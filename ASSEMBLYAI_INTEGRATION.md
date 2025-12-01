# Интеграция AssemblyAI - Полный пайплайн

Реализован полный рабочий пайплайн с использованием AssemblyAI для транскрипции и существующего LLM сервиса для генерации протоколов.

## Архитектура пайплайна

```
Фронтенд → Бэкенд (FastAPI)
    ↓
Загрузка аудиофайла
    ↓
AssemblyAI Service (транскрипция)
    ↓
LLM Client (генерация протокола)
    ↓
Ответ фронтенду
```

## Что изменилось

### 1. Новый сервис: `services/assemblyai_service.py`
- Обертка над AssemblyAI SDK
- Транскрипция аудиофайлов (локальных или по URL)
- Форматирование транскрипта с метаданными
- Сохранение транскрипта в файл

### 2. Обновлен `main.py`
- Заменен `AudioProcessor` на `AssemblyAIService`
- Упрощенная логика обработки
- Интеграция с существующим `LLMClient`

### 3. Обновлен `requirements.txt`
- Добавлен `assemblyai>=1.0.0`
- Закомментированы тяжелые зависимости (torch, faster-whisper)
- Добавлен `python-dotenv`

## Установка

### 1. Обновите зависимости

```bash
cd backend
source venv/bin/activate  # или создайте новый venv
pip install -r requirements.txt
```

### 2. Настройте API ключ

Добавьте в `.env` файл:

```env
ASSEMBLYAI_API_KEY=24527f87c104468492a57baa67fecc50
```

Или используйте переменную окружения:

```bash
export ASSEMBLYAI_API_KEY=24527f87c104468492a57baa67fecc50
```

### 3. Запустите бэкенд

```bash
python -m uvicorn main:app --host 0.0.0.0 --port 3001
```

## Использование

### Endpoint: `/api/protocols/submit`

**Запрос:**
```
POST /api/protocols/submit
Content-Type: multipart/form-data

protocolType: string
participants: JSON string
audioFile: File
useCommandLine: bool (не используется, оставлен для совместимости)
saveTranscript: bool
```

**Ответ:**
```json
{
  "id": "uuid",
  "status": "completed",
  "protocol": {
    "content": "Сгенерированный протокол",
    "summary": "Краткое резюме",
    "decisions": ["Решение 1", "Решение 2"],
    "transcript": "Форматированная транскрипция",
    "transcript_file": "путь/к/файлу.txt",
    "participants": [...],
    "protocol_type": "название типа",
    "created_at": "ISO timestamp"
  },
  "error": null
}
```

## Преимущества

✅ **Легковесный**: Не требует установки PyTorch и других ML библиотек  
✅ **Быстрый**: AssemblyAI обрабатывает транскрипцию в облаке  
✅ **Качественный**: Использует передовые модели для транскрипции  
✅ **Простой**: Минимальная конфигурация  

## Сохранение старой версии

Текущая mock версия сохранена как:
- `backend/main_simple.py` - упрощенная версия без реальной обработки
- `backend/requirements_simple.txt` - минимальные зависимости

Для возврата к mock версии:

```bash
cp backend/main_simple.py backend/main.py
cp backend/requirements_simple.txt backend/requirements.txt
pip install -r requirements.txt
```

## Развертывание на сервере

### 1. Обновите код на сервере

```bash
# На вашем локальном компьютере
scp backend/main.py protocolmaker@your-server:/opt/protocol-maker-frontend/backend/
scp backend/services/assemblyai_service.py protocolmaker@your-server:/opt/protocol-maker-frontend/backend/services/
scp backend/requirements.txt protocolmaker@your-server:/opt/protocol-maker-frontend/backend/
```

### 2. На сервере

```bash
cd /opt/protocol-maker-frontend/backend
source venv/bin/activate

# Обновите зависимости
pip install -r requirements.txt

# Добавьте API ключ в .env
echo "ASSEMBLYAI_API_KEY=24527f87c104468492a57baa67fecc50" >> /opt/protocol-maker-frontend/.env

# Перезапустите сервис
sudo systemctl restart protocol-maker-backend
sudo systemctl status protocol-maker-backend
```

## Отладка

### Проверка транскрипции

```python
from services.assemblyai_service import AssemblyAIService

service = AssemblyAIService()
result = service.transcribe_file("path/to/audio.mp3")
print(result)
```

### Проверка логов

```bash
sudo journalctl -u protocol-maker-backend -f
```

## Обработка ошибок

- **Transcription failed**: Проверьте API ключ и доступность файла
- **No transcript generated**: Убедитесь что файл поддерживаемого формата (MP3, WAV, M4A)
- **LLM API error**: Проверьте настройки LLM клиента

## Производительность

- Транскрипция: зависит от длины аудио (обычно 1-5 минут для файла длительностью 10 минут)
- Генерация протокола: зависит от длины транскрипта (обычно 10-30 секунд)
- Общее время обработки: ~2-6 минут для стандартного совещания

