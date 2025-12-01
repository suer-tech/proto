# Руководство по развертыванию на VPS Linux

## Предварительные требования

1. Ubuntu/Debian VPS (рекомендуется Ubuntu 22.04+)
2. Python 3.10+ 
3. Node.js 18+ и pnpm
4. Nginx
5. Доменное имя (опционально)

---

## Шаг 1: Подготовка сервера

### 1.1 Обновление системы

```bash
sudo apt update
sudo apt upgrade -y
```

### 1.2 Установка зависимостей

```bash
# Python и pip
sudo apt install -y python3 python3-pip python3-venv

# Node.js и pnpm
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
npm install -g pnpm

# Nginx
sudo apt install -y nginx

# FFmpeg (для обработки аудио)
sudo apt install -y ffmpeg

# System dependencies для PyTorch
sudo apt install -y build-essential git
```

---

## Шаг 2: Клонирование и подготовка проекта

### 2.1 Загрузка проекта

```bash
cd /opt
sudo git clone <your-repo-url> protocol-maker
sudo chown -R $USER:$USER protocol-maker
cd protocol-maker
```

### 2.2 Настройка переменных окружения

Создайте файл `.env` в корне проекта:

```bash
nano .env
```

Добавьте следующие переменные:

```env
# Backend API
PORT=3001
NODE_ENV=production

# OpenAI API Key (required)
OPENAI_API_KEY=your_openai_api_key

# Hugging Face Token (required для diarization)
HUGGINGFACE_HUB_TOKEN=your_huggingface_token

# Frontend API URL (update with your server IP/domain)
VITE_API_URL=http://your-server-ip:3001/api

# CORS Origins (comma-separated, update with your domain)
CORS_ORIGINS=http://localhost:3000,https://your-domain.com
```

---

## Шаг 3: Установка и запуск бэкенда

### 3.1 Установка Python зависимостей

```bash
cd /opt/protocol-maker/backend
python3 -m venv venv
source venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt
```

### 3.2 Создание systemd сервиса для бэкенда

```bash
sudo nano /etc/systemd/system/protocol-maker-backend.service
```

Вставьте следующий контент:

```ini
[Unit]
Description=Protocol Maker Backend API
After=network.target

[Service]
Type=simple
User=your-username
WorkingDirectory=/opt/protocol-maker/backend
Environment="PATH=/opt/protocol-maker/backend/venv/bin"
EnvironmentFile=/opt/protocol-maker/.env
ExecStart=/opt/protocol-maker/backend/venv/bin/uvicorn main:app --host 0.0.0.0 --port 3001
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

Замените `your-username` на имя вашего пользователя.

### 3.3 Запуск бэкенда

```bash
sudo systemctl daemon-reload
sudo systemctl enable protocol-maker-backend
sudo systemctl start protocol-maker-backend
sudo systemctl status protocol-maker-backend
```

---

## Шаг 4: Установка и запуск фронтенда

### 4.1 Сборка фронтенда

```bash
cd /opt/protocol-maker
pnpm install
pnpm build
```

### 4.2 Создание systemd сервиса для фронтенда

```bash
sudo nano /etc/systemd/system/protocol-maker-frontend.service
```

Вставьте следующий контент:

```ini
[Unit]
Description=Protocol Maker Frontend
After=network.target

[Service]
Type=simple
User=your-username
WorkingDirectory=/opt/protocol-maker
Environment="NODE_ENV=production"
Environment="PORT=3000"
EnvironmentFile=/opt/protocol-maker/.env
ExecStart=/usr/bin/node /opt/protocol-maker/dist/index.js
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

### 4.3 Запуск фронтенда

```bash
sudo systemctl daemon-reload
sudo systemctl enable protocol-maker-frontend
sudo systemctl start protocol-maker-frontend
sudo systemctl status protocol-maker-frontend
```

---

## Шаг 5: Настройка Nginx (Reverse Proxy)

### 5.1 Создание конфигурации Nginx

```bash
sudo nano /etc/nginx/sites-available/protocol-maker
```

Вставьте следующий контент:

```nginx
upstream backend {
    server 127.0.0.1:3001;
}

upstream frontend {
    server 127.0.0.1:3000;
}

server {
    listen 80;
    server_name your-domain.com;  # Замените на ваш домен или IP

    # Увеличенный размер загружаемых файлов (для аудио)
    client_max_body_size 100M;

    # Frontend
    location / {
        proxy_pass http://frontend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Backend API
    location /api {
        proxy_pass http://backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### 5.2 Активация конфигурации

```bash
sudo ln -s /etc/nginx/sites-available/protocol-maker /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

---

## Шаг 6: Настройка SSL (Let's Encrypt)

Если у вас есть домен:

```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```

Certbot автоматически обновит конфигурацию Nginx и настроит автоматическое обновление сертификата.

---

## Шаг 7: Настройка файрвола

```bash
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

---

## Полезные команды для управления

### Просмотр логов

```bash
# Backend логи
sudo journalctl -u protocol-maker-backend -f

# Frontend логи
sudo journalctl -u protocol-maker-frontend -f

# Nginx логи
sudo tail -f /var/log/nginx/error.log
```

### Перезапуск сервисов

```bash
sudo systemctl restart protocol-maker-backend
sudo systemctl restart protocol-maker-frontend
sudo systemctl restart nginx
```

### Проверка статуса

```bash
sudo systemctl status protocol-maker-backend
sudo systemctl status protocol-maker-frontend
```

---

## Решение проблем

### Бэкенд не запускается

1. Проверьте логи: `sudo journalctl -u protocol-maker-backend -n 50`
2. Убедитесь, что порт 3001 свободен: `sudo netstat -tlnp | grep 3001`
3. Проверьте права доступа к директории uploads

### Фронтенд не запускается

1. Проверьте логи: `sudo journalctl -u protocol-maker-frontend -n 50`
2. Убедитесь, что собрали проект: `pnpm build`
3. Проверьте, что порт 3000 свободен: `sudo netstat -tlnp | grep 3000`

### Nginx возвращает 502 Bad Gateway

1. Проверьте, что бэкенд и фронтенд запущены
2. Проверьте конфигурацию Nginx: `sudo nginx -t`
3. Посмотрите логи Nginx: `sudo tail -f /var/log/nginx/error.log`

---

## Обновление приложения

```bash
cd /opt/protocol-maker
git pull origin main
cd backend
source venv/bin/activate
pip install -r requirements.txt
cd ..
pnpm install
pnpm build
sudo systemctl restart protocol-maker-backend
sudo systemctl restart protocol-maker-frontend
```

---

## Производительность

Для оптимизации производительности на VPS:

1. **Увеличьте swap** (если мало RAM):
```bash
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

2. **Ограничьте размер uploads директории** (добавьте в cron):
```bash
# Очистка файлов старше 7 дней
0 2 * * * find /opt/protocol-maker/backend/uploads -type f -mtime +7 -delete
```

---

## Дополнительная информация

- Backend API работает на порту 3001
- Frontend работает на порту 3000
- Nginx проксирует оба сервиса на порт 80/443
- Загруженные файлы хранятся в `/opt/protocol-maker/backend/uploads`

