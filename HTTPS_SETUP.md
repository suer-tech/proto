# Настройка HTTPS для Protocol-Maker

Это руководство поможет настроить HTTPS для Protocol-Maker используя nginx как reverse-proxy и Let's Encrypt для SSL-сертификатов.

## Требования

1. **Домен**, который указывает на IP-адрес вашего сервера (A-запись в DNS)
2. **Доступ с правами sudo** на сервере
3. **Порты 80 и 443** должны быть открыты в firewall

## Шаги настройки

### 1. Подготовка домена

Убедитесь, что ваш домен (например, `protocol-maker.example.com`) указывает на IP-адрес сервера:

```bash
# Проверьте DNS запись
dig protocol-maker.example.com
# или
nslookup protocol-maker.example.com
```

### 2. Автоматическая настройка (рекомендуется)

Используйте предоставленный скрипт:

```bash
# На сервере
cd ~/apps/protocol-maker
sudo ./setup-https.sh protocol-maker.example.com admin@example.com
```

Скрипт автоматически:
- Установит certbot (если не установлен)
- Создаст конфигурацию nginx
- Получит SSL-сертификат от Let's Encrypt
- Настроит автоматическое обновление сертификата

### 3. Ручная настройка

Если предпочитаете настроить вручную:

#### 3.1. Установите certbot

```bash
sudo apt-get update
sudo apt-get install -y certbot python3-certbot-nginx
```

#### 3.2. Создайте конфигурацию nginx

```bash
# Скопируйте конфигурацию
sudo cp ~/apps/protocol-maker/nginx-protocol-maker.conf /etc/nginx/sites-available/protocol-maker

# Отредактируйте домен в конфигурации
sudo nano /etc/nginx/sites-available/protocol-maker
# Замените your-domain.com на ваш домен

# Включите сайт
sudo ln -s /etc/nginx/sites-available/protocol-maker /etc/nginx/sites-enabled/

# Проверьте конфигурацию
sudo nginx -t

# Перезагрузите nginx
sudo systemctl reload nginx
```

#### 3.3. Получите SSL-сертификат

```bash
sudo certbot --nginx -d protocol-maker.example.com -d www.protocol-maker.example.com
```

Certbot автоматически:
- Получит сертификат от Let's Encrypt
- Обновит конфигурацию nginx с SSL настройками
- Настроит автоматическое обновление

### 4. Обновите CORS в бэкенде

После настройки HTTPS, обновите CORS origins в бэкенде:

```bash
# На сервере, отредактируйте ~/apps/protocol-maker/backend/main.py
# Или установите переменную окружения:
export CORS_ORIGINS="https://protocol-maker.example.com,https://www.protocol-maker.example.com"
```

Или добавьте в `.env` файл:
```
CORS_ORIGINS=https://protocol-maker.example.com,https://www.protocol-maker.example.com
```

### 5. Перезапустите бэкенд

```bash
cd ~/apps/protocol-maker/backend
# Остановите старый процесс
if [ -f backend.pid ]; then
    kill $(cat backend.pid)
    rm backend.pid
fi

# Запустите заново
source venv/bin/activate
nohup python main.py > backend.log 2>&1 & echo $! > backend.pid
```

## Проверка

1. Откройте в браузере: `https://protocol-maker.example.com`
2. Проверьте, что сертификат валиден (замочек в адресной строке)
3. Проверьте, что API работает: `https://protocol-maker.example.com/api/protocol-types`

## Автоматическое обновление сертификата

Let's Encrypt сертификаты действительны 90 дней. Certbot автоматически настроит обновление.

Проверьте статус:
```bash
sudo systemctl status certbot.timer
```

Тест обновления:
```bash
sudo certbot renew --dry-run
```

## Troubleshooting

### Проблема: certbot не может получить сертификат

- Убедитесь, что домен указывает на IP сервера
- Проверьте, что порты 80 и 443 открыты
- Проверьте firewall: `sudo ufw status`

### Проблема: nginx не запускается

- Проверьте конфигурацию: `sudo nginx -t`
- Проверьте логи: `sudo tail -f /var/log/nginx/error.log`

### Проблема: 502 Bad Gateway

- Убедитесь, что бэкенд запущен: `ps aux | grep python`
- Проверьте, что бэкенд слушает на `localhost:3001`: `netstat -tlnp | grep 3001`

## Альтернатива: Traefik

Если предпочитаете использовать Traefik вместо nginx, можно настроить его через Docker. Traefik автоматически управляет сертификатами через Let's Encrypt.

## Безопасность

После настройки HTTPS:
- Все HTTP-запросы автоматически перенаправляются на HTTPS
- Включены security headers (HSTS, X-Frame-Options, etc.)
- Используются современные SSL/TLS протоколы (TLS 1.2, 1.3)

