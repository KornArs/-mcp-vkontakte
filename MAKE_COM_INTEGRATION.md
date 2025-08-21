# Интеграция VKontakte MCP сервера с Make.com

## 🎯 Обзор

Этот документ описывает, как интегрировать наш VKontakte MCP сервер с Make.com через MCP Client.

## 📋 Требования Make.com

Согласно [официальной документации Make.com](https://apps.make.com/mcp-client), для интеграции требуется:

### **Основные требования:**
- **SSE (Server-Sent Events)** транспорт
- **HTTPS** доступность
- **CORS** настройки для `https://www.make.com`
- **Аутентификация** через API ключ/токен
- **OAuth поддержка** (опционально)

### **Поддерживаемые транспорты:**
- **SSE (Server-Sent Events)** - основной
- **HTTP/HTTPS** - для API вызовов

## 🚀 Запуск Make.com MCP сервера

### **1. Сборка проекта:**
```bash
npm run build
```

### **2. Запуск сервера:**
```bash
npm run start:make
```

### **3. Проверка endpoints:**
- **SSE**: `http://localhost:3000/mcp/sse`
- **API**: `http://localhost:3000/mcp/api`
- **Health**: `http://localhost:3000/health`
- **Info**: `http://localhost:3000/mcp/info`

## 🔗 Настройка в Make.com

### **Шаг 1: Добавление MCP Client модуля**

1. В Make.com сценарии добавьте **MCP Client** модуль
2. Нажмите **"Create a connection"**

### **Шаг 2: Настройка соединения**

#### **Для локального тестирования:**
```
Connection Name: VKontakte MCP Server
MCP Server: + New MCP Server
URL: http://localhost:3000/mcp/sse
```

#### **Для production (Railway):**
```
Connection Name: VKontakte MCP Server
MCP Server: + New MCP Server
URL: https://your-app-name.railway.app/mcp/sse
```

### **Шаг 3: Аутентификация**

Если требуется API ключ:
```
API Key / Access Token: ваш_vk_access_token
```

## 🛠️ Доступные инструменты

После подключения в Make.com будут доступны:

### **1. post_to_wall**
**Описание:** Публикует пост на стену пользователя или группы ВКонтакте

**Параметры:**
- `message` (обязательный) - Текст поста
- `group_id` (опциональный) - ID группы
- `user_id` (опциональный) - ID пользователя
- `attachments` (опциональный) - Массив вложений
- `publish_date` (опциональный) - Время публикации

### **2. get_wall_posts**
**Описание:** Получает посты со стены

**Параметры:**
- `group_id` (опциональный) - ID группы
- `user_id` (опциональный) - ID пользователя
- `count` (опциональный) - Количество постов (по умолчанию 20)
- `offset` (опциональный) - Смещение от начала (по умолчанию 0)

### **3. search_posts**
**Описание:** Ищет посты по ключевому слову

**Параметры:**
- `query` (обязательный) - Поисковый запрос
- `group_id` (опциональный) - ID группы для поиска
- `count` (опциональный) - Количество результатов
- `offset` (опциональный) - Смещение от начала

### **4. get_group_info**
**Описание:** Получает информацию о группе

**Параметры:**
- `group_id` (обязательный) - ID группы

### **5. get_user_info**
**Описание:** Получает информацию о пользователе

**Параметры:**
- `user_id` (обязательный) - ID пользователя

## 🔧 Примеры использования в Make.com

### **Пример 1: Автопостинг в группу**

1. **Триггер:** Новый email в Gmail
2. **MCP Client - post_to_wall:**
   - `message`: `{{email.subject}}\n\n{{email.body}}`
   - `group_id`: `229014983`

### **Пример 2: Мониторинг постов**

1. **Триггер:** Каждый час
2. **MCP Client - get_wall_posts:**
   - `group_id`: `229014983`
   - `count`: `5`
3. **Действие:** Отправка уведомления в Slack

### **Пример 3: Поиск и анализ**

1. **Триггер:** Новый запрос в форме
2. **MCP Client - search_posts:**
   - `query`: `{{form.query}}`
   - `group_id`: `229014983`
3. **Действие:** Сохранение результатов в Google Sheets

## 🌐 Production развертывание

### **Railway (рекомендуется):**

1. **Fork репозитория** на GitHub
2. **Подключите Railway** к GitHub
3. **Создайте новый проект** в Railway
4. **Укажите переменные окружения:**
   ```bash
   VK_ACCESS_TOKEN=ваш_vk_access_token
   VK_API_VERSION=5.131
   VK_GROUP_ID=id_вашей_группы
   ```
5. **Получите URL:** `https://your-app-name.railway.app`
6. **Используйте в Make.com:** `https://your-app-name.railway.app/mcp/sse`

### **Vercel/Netlify:**
- Поддерживается статическое развертывание
- Требуется настройка serverless функций

## 🔒 Безопасность

### **Переменные окружения:**
- `VK_ACCESS_TOKEN` - храните в секретах
- `VK_API_VERSION` - версия VK API
- `VK_GROUP_ID` - ID группы по умолчанию

### **CORS настройки:**
- Разрешены только `https://www.make.com` и `https://*.make.com`
- Включены credentials для аутентификации

### **Rate Limiting:**
- VK API: максимум 3 запроса в секунду
- Рекомендуется добавить задержки между запросами

## 📊 Мониторинг

### **Health Check:**
```bash
curl https://your-app-name.railway.app/health
```

### **MCP Info:**
```bash
curl https://your-app-name.railway.app/mcp/info
```

### **Логи:**
- Railway автоматически предоставляет логи
- Добавлено логирование всех MCP вызовов

## 🆘 Решение проблем

### **Ошибка "Connection failed":**
1. Проверьте доступность сервера
2. Убедитесь, что SSE endpoint работает
3. Проверьте CORS настройки

### **Ошибка "Tool not found":**
1. Проверьте, что сервер запущен
2. Убедитесь, что инструмент зарегистрирован
3. Проверьте логи сервера

### **Ошибка "Authentication failed":**
1. Проверьте `VK_ACCESS_TOKEN`
2. Убедитесь, что токен не истек
3. Проверьте права приложения

## 📚 Дополнительные ресурсы

- [Make.com MCP Client документация](https://apps.make.com/mcp-client)
- [VK API документация](https://vk.com/dev)
- [MCP протокол спецификация](https://modelcontextprotocol.io/)
- [Railway документация](https://docs.railway.app/)

## ✅ Чек-лист готовности

- [ ] MCP сервер собран и запущен
- [ ] SSE endpoint доступен
- [ ] API endpoint работает
- [ ] CORS настроен для Make.com
- [ ] Переменные окружения установлены
- [ ] Сервер протестирован локально
- [ ] Production развертывание готово
- [ ] Make.com соединение настроено
- [ ] Инструменты доступны в Make.com
- [ ] Первый сценарий протестирован

## 🎉 Результат

После выполнения всех шагов у вас будет:
- **Полнофункциональный MCP сервер** для ВКонтакте
- **Интеграция с Make.com** через MCP Client
- **Автоматизация** постов и мониторинга
- **Масштабируемое решение** на Railway
- **Готовность к production** использованию
