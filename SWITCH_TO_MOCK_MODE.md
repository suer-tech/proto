# Переключение на Mock режим (упрощенный бэкенд)

Этот режим работает БЕЗ ML/AI библиотек и возвращает тестовые данные.

## Быстрое переключение на Mock режим:

### 1. Скопируйте файлы на сервер:

```bash
scp backend/main_simple.py protocolmaker@83.166.246.90:/opt/protocol-maker-frontend/backend/main.py
scp backend/requirements_simple.txt protocolmaker@83.166.246.90:/opt/protocol-maker-frontend/backend/requirements.txt
```

### 2. На сервере установите упрощенные зависимости:

```bash
cd /opt/protocol-maker-frontend/backend
source venv/bin/activate
pip install -r requirements_simple.txt
```

### 3. Обновите systemd сервис:

```bash
sudo nano /etc/systemd/system/protocol-maker-backend.service
```

Измените `ExecStart` на:
```ini
ExecStart=/opt/protocol-maker-frontend/backend/venv/bin/python -m uvicorn main:app --host 0.0.0.0 --port 3001
```

### 4. Перезапустите бэкенд:

```bash
sudo systemctl restart protocol-maker-backend
sudo systemctl status protocol-maker-backend
```

---

## Возврат к полной версии:

Когда будет мощный сервер:

### 1. Скопируйте полные requirements:

```bash
scp backend/requirements.txt protocolmaker@YOUR_SERVER:/opt/protocol-maker-frontend/backend/
scp backend/main.py protocolmaker@YOUR_SERVER:/opt/protocol-maker-frontend/backend/
```

### 2. Установите полные зависимости (с torch):

```bash
cd /opt/protocol-maker-frontend/backend
source venv/bin/activate
pip install -r requirements.txt
```

### 3. Добавьте переменные окружения в .env:

```env
OPENAI_API_KEY=your_key
HUGGINGFACE_HUB_TOKEN=your_token
```

### 4. Перезапустите:

```bash
sudo systemctl restart protocol-maker-backend
```

---

## Что делает Mock версия:

✅ Принимает загруженные аудиофайлы  
✅ Возвращает тестовые данные протокола  
✅ Работает без ML/AI библиотек  
✅ Не требует много места на диске  
✅ Быстро запускается  

❌ НЕ обрабатывает аудио по-настоящему  
❌ НЕ генерирует реальные протоколы  
❌ Использует предзаданные шаблоны  

---

## Размер установки:

- Mock версия: ~50 MB
- Полная версия: ~3+ GB (с PyTorch, Whisper, и т.д.)



