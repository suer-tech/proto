# Деплой Protocol Maker на сервер с изоляцией окружений

Этот документ описывает процесс деплоя приложения Protocol Maker на сервер с изоляцией от других приложений.

## Преимущества изолированного деплоя

- ✅ Каждое приложение работает в отдельной директории
- ✅ Независимое управление сервисами через systemd
- ✅ Отдельные порты и конфигурации Nginx
- ✅ Легко запускать/останавливать приложения независимо
- ✅ Не мешают друг другу при работе

## Предварительные требования

1. SSH доступ к серверу
2. SSH ключ в файле `user` в корне проекта
3. Права sudo на сервере (для установки systemd сервисов и nginx)

## Быстрый старт

### 1. Первоначальный деплой

```bash
./deploy-to-server.sh
```

Скрипт автоматически:
- ✅ Проверит подключение к серверу
- ✅ Установит недостающие зависимости
- ✅ Создаст директорию `/opt/apps/protocol-maker`
- ✅ Скопирует проект на сервер
- ✅ Настроит Python виртуальное окружение
- ✅ Соберет фронтенд
- ✅ Создаст systemd сервисы
- ✅ Настроит Nginx

### 2. Настройка API ключей

После деплоя необходимо обновить API ключи:

```bash
ssh -i user -p 11122 user@user176.98.234.178 "nano /opt/apps/protocol-maker/.env"
```

Или используйте скрипт управления:

```bash
./manage-app.sh ssh
# Затем на сервере:
nano /opt/apps/protocol-maker/.env
```

Обновите:
- `OPENAI_API_KEY` - ваш OpenAI API ключ
- `HUGGINGFACE_HUB_TOKEN` - ваш Hugging Face токен

### 3. Перезапуск сервисов

```bash
./manage-app.sh restart
```

## Управление приложением

Используйте скрипт `manage-app.sh` для управления приложением:

```bash
# Показать статус сервисов
./manage-app.sh status

# Запустить сервисы
./manage-app.sh start

# Остановить сервисы
./manage-app.sh stop

# Перезапустить сервисы
./manage-app.sh restart

# Показать логи (все сервисы)
./manage-app.sh logs

# Показать логи только бэкенда
./manage-app.sh logs-backend

# Показать логи только фронтенда
./manage-app.sh logs-frontend

# Открыть SSH соединение
./manage-app.sh ssh

# Обновить приложение (pull + rebuild + restart)
./manage-app.sh update
```

## Структура на сервере

```
/opt/apps/protocol-maker/          # Корневая директория приложения
├── backend/                        # Python бэкенд
│   ├── venv/                      # Виртуальное окружение Python
│   ├── uploads/                   # Загруженные файлы
│   └── data/                      # Данные приложения
├── client/                        # Исходники фронтенда
├── dist/                          # Собранный фронтенд
├── .env                           # Переменные окружения
└── ...
```

## Systemd сервисы

Приложение создает два systemd сервиса:

- `protocol-maker-backend.service` - Python FastAPI бэкенд (порт 3001)
- `protocol-maker-frontend.service` - Node.js фронтенд (порт 3000)

### Управление через systemd напрямую

```bash
# На сервере
sudo systemctl status protocol-maker-backend
sudo systemctl status protocol-maker-frontend

sudo systemctl start protocol-maker-backend
sudo systemctl start protocol-maker-frontend

sudo systemctl stop protocol-maker-backend
sudo systemctl stop protocol-maker-frontend

sudo systemctl restart protocol-maker-backend
sudo systemctl restart protocol-maker-frontend

# Просмотр логов
sudo journalctl -u protocol-maker-backend -f
sudo journalctl -u protocol-maker-frontend -f
```

## Nginx конфигурация

Конфигурация Nginx создается в:
- `/etc/nginx/sites-available/protocol-maker`
- `/etc/nginx/sites-enabled/protocol-maker` (символическая ссылка)

Приложение доступно по адресу:
- `http://user176.98.234.178` (через Nginx)
- `http://user176.98.234.178:3000` (фронтенд напрямую)
- `http://user176.98.234.178:3001` (бэкенд API напрямую)

## Изоляция от других приложений

Каждое приложение:
- Работает в своей директории `/opt/apps/<app-name>`
- Имеет свои systemd сервисы с уникальными именами
- Использует свои порты (можно настроить в `.env`)
- Имеет свою конфигурацию Nginx

Для добавления другого приложения:
1. Создайте новую директорию `/opt/apps/another-app`
2. Используйте другие порты (например, 3002, 3003)
3. Создайте systemd сервисы с другими именами
4. Настройте отдельную конфигурацию Nginx

## Ограничения ресурсов

Для сервера с 1GB RAM в systemd сервисах установлены ограничения:

- Backend: максимум 512MB RAM, 50% CPU
- Frontend: максимум 256MB RAM, 30% CPU

Это позволяет нескольким приложениям работать одновременно без конфликтов.

## Обновление приложения

### Автоматическое обновление (если проект в git)

```bash
./manage-app.sh update
```

### Ручное обновление

1. Скопируйте новые файлы на сервер
2. Пересоберите фронтенд:
   ```bash
   ssh -i user -p 11122 user@user176.98.234.178
   cd /opt/apps/protocol-maker
   pnpm install
   pnpm build
   ```
3. Перезапустите сервисы:
   ```bash
   ./manage-app.sh restart
   ```

## Устранение неполадок

### Сервисы не запускаются

```bash
# Проверьте статус
./manage-app.sh status

# Проверьте логи
./manage-app.sh logs-backend
./manage-app.sh logs-frontend

# Проверьте .env файл
ssh -i user -p 11122 user@user176.98.234.178 "cat /opt/apps/protocol-maker/.env"
```

### Проблемы с портами

Если порты 3000 или 3001 заняты, измените их в `.env`:

```env
PORT=3002  # Для бэкенда
```

И обновите systemd сервисы и Nginx конфигурацию.

### Проблемы с Nginx

```bash
# Проверьте конфигурацию
ssh -i user -p 11122 user@user176.98.234.178 "sudo nginx -t"

# Перезагрузите Nginx
ssh -i user -p 11122 user@user176.98.234.178 "sudo systemctl reload nginx"

# Проверьте логи Nginx
ssh -i user -p 11122 user@user176.98.234.178 "sudo tail -f /var/log/nginx/protocol-maker-error.log"
```

## Безопасность

⚠️ **Важно:**
- Файл `user` содержит приватный SSH ключ - не коммитьте его в git
- Обязательно обновите API ключи в `.env` после деплоя
- Настройте firewall для ограничения доступа к портам
- Рассмотрите возможность настройки SSL/TLS через Let's Encrypt

## Дополнительная информация

- [DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md) - Подробное руководство по развертыванию
- [QUICK_DEPLOY.md](./QUICK_DEPLOY.md) - Быстрое развертывание
- [README.md](./README.md) - Общая информация о проекте

