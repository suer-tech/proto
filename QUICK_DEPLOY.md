# Быстрое развертывание на VPS

## 🚀 Быстрый старт (5 минут)

### 1. Скопируйте проект на сервер

```bash
# На вашем локальном компьютере
scp -r protocol-maker-frontend root@83.166.246.90
```

### 2. Подключитесь к серверу

```bash
ssh user@your-server-ip
cd /opt/protocol-maker-frontend
```

### 3. Выполните скрипт развертывания

```bash
chmod +x deploy.sh
./deploy.sh
```

Скрипт автоматически:
- ✅ Установит все зависимости
- ✅ Создаст .env файл (сгенерирует шаблон)
- ✅ Соберёт фронтенд
- ✅ Создаст systemd сервисы
- ✅ Запустит бэкенд и фронтенд

### 4. Настройте API ключи

```bash
nano .env
```

Добавьте ваши API ключи:
```env
OPENAI_API_KEY=sk-...
HUGGINGFACE_HUB_TOKEN=hf_...
```

### 5. Перезапустите сервисы

```bash
sudo systemctl restart protocol-maker-backend
sudo systemctl restart protocol-maker-frontend
```

### 6. Настройте Nginx (опционально)

См. секцию "Настройка Nginx" в DEPLOYMENT_GUIDE.md

---

## 📝 Основные команды

```bash
# Просмотр логов
sudo journalctl -u protocol-maker-backend -f
sudo journalctl -u protocol-maker-frontend -f

# Остановить/запустить
sudo systemctl stop protocol-maker-backend
sudo systemctl start protocol-maker-backend

# Проверка статуса
sudo systemctl status protocol-maker-backend
sudo systemctl status protocol-maker-frontend

# Перезапуск
sudo systemctl restart protocol-maker-backend
sudo systemctl restart protocol-maker-frontend
```

---

## 🌐 Порты

- Backend API: `3001`
- Frontend: `3000`
- После настройки Nginx: `80` (HTTP), `443` (HTTPS)

---

## 🔧 Обновление приложения

```bash
cd /opt/protocol-maker-frontend
git pull origin main
cd backend && source venv/bin/activate && pip install -r requirements.txt
cd .. && pnpm install && pnpm build
sudo systemctl restart protocol-maker-backend protocol-maker-frontend
```

---

## ❌ Устранение неполадок

### Backend не запускается

```bash
# Проверьте логи
sudo journalctl -u protocol-maker-backend -n 50

# Проверьте порт
sudo netstat -tlnp | grep 3001
```

### Frontend не запускается

```bash
# Проверьте логи
sudo journalctl -u protocol-maker-frontend -n 50

# Убедитесь что сборка прошла успешно
ls -la dist/public/
```

### Проверка .env файла

```bash
# Убедитесь что все ключи установлены
cat .env
```

---

## 📦 Требования

- Ubuntu/Debian VPS
- Python 3.10+
- Node.js 18+
- pnpm
- Nginx (опционально)
- Минимум 4GB RAM (рекомендуется 8GB)

---

## 🔐 Безопасность

1. Настройте файрвол:
```bash
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

2. Используйте SSL сертификат:
```bash
sudo certbot --nginx -d your-domain.com
```

3. Регулярно обновляйте систему:
```bash
sudo apt update && sudo apt upgrade
```

