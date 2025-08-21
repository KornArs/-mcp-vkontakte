# MCP VKontakte Server

MCP сервер для интеграции с ВКонтакте (VK.com), позволяющий публиковать посты, управлять группами и работать с VK API через Make MCP Client.

## Возможности

- 📝 Публикация постов в личном профиле и группах
- 👥 Управление группами ВКонтакте  
- 📊 Получение статистики постов
- 🔍 Поиск по контенту
- 📱 Работа с медиафайлами
- ⚙️ Интеграция через MCP протокол
- 🌐 HTTP/SSE транспорт для Make MCP Client
- 🚀 Готов к развертыванию на Railway

## 🔑 Получение VK Access Token

### Быстрый способ (рекомендуется):

1. **Перейдите на [vkhost.github.io](https://vkhost.github.io/)**
2. **Выберите приложение "VK Admin"** и нажмите "разрешить"
3. **Скопируйте часть адресной строки** от `access_token=` до `&expires_in` - это и есть ваш API ключ
4. **Используйте токен** в Make MCP Client

### Альтернативный способ:

1. **Создайте приложение** на [VK Developer](https://vk.com/dev)
2. **Включите Open API** в настройках
3. **Получите токен** через OAuth:
   ```
   https://oauth.vk.com/authorize?client_id=YOUR_APP_ID&display=page&redirect_uri=http://localhost&scope=wall,offline&response_type=token&v=5.131
   ```

## 🚀 Быстрый старт на Railway

### 1. Развертывание на Railway

1. **Fork репозитория** на GitHub
2. **Подключите Railway** к вашему GitHub аккаунту
3. **Создайте новый проект** в Railway
4. **Выберите "Deploy from GitHub repo"**
5. **Укажите переменные окружения** (см. ниже)

### 2. Переменные окружения для Railway

```bash
VK_ACCESS_TOKEN=ваш_vk_access_token_здесь
VK_API_VERSION=5.199
VK_GROUP_ID=id_вашей_группы
```

### 3. Получение URL для Make MCP Client

После развертывания Railway автоматически предоставит URL вида:
```
https://your-app-name.railway.app
```

**MCP endpoint для Make MCP Client:**
```
https://your-app-name.railway.app/mcp/sse
```

## 🔌 Подключение к Make MCP Client

1. **Откройте Make MCP Client** в вашем сценарии
2. **Создайте новое подключение**
3. **В поле MCP Server** выберите "+ New MCP server"
4. **Введите URL:** `https://your-app-name.railway.app/mcp/sse`
5. **В поле API key / Access token** вставьте ваш VK Access Token
6. **Сохраните подключение**

Теперь все инструменты VK доступны в Make без повторного ввода токена!

## 📋 Доступные инструменты

- **`post_to_wall`** - Публикация постов на стену
- **`get_wall_posts`** - Получение постов со стены
- **`search_posts`** - Поиск постов по ключевому слову
- **`get_group_info`** - Информация о группе
- **`get_user_info`** - Информация о пользователе

## 🏗️ Локальная установка

1. **Клонируйте репозиторий:**
   ```bash
   git clone <repository-url>
   cd mcp-vkontakte
   ```

2. **Установите зависимости:**
   ```bash
   npm install
   ```

3. **Настройте переменные окружения:**
   ```bash
   cp env.example .env
   # Отредактируйте .env файл с вашими данными
   ```

4. **Соберите проект:**
   ```bash
   npm run build
   ```

## 🚀 Запуск

### HTTP/SSE сервер (для Railway и Make MCP Client)
```bash
npm run start:make
```

### Stdio сервер (для локального MCP)
```bash
npm run start:cursor
```

### Режим разработки
```bash
npm run dev
```

## 📡 API Endpoints

После развертывания доступны следующие endpoints:

- **`/mcp/sse`** - SSE endpoint для Make MCP Client
- **`/mcp/api`** - API endpoint для вызова инструментов
- **`/health`** - Проверка состояния сервера
- **`/mcp/info`** - Информация о MCP сервере

## 🐳 Docker

```bash
docker build -t mcp-vkontakte .
docker run -p 3000:3000 -e VK_ACCESS_TOKEN=your_token mcp-vkontakte
```

## 📚 Документация

- [Интеграция с Make](./MAKE_COM_INTEGRATION.md) - подробная инструкция по Make MCP Client
- [Развертывание на Railway](./RAILWAY_DEPLOYMENT.md) - пошаговое руководство по Railway
- [Настройка VK API](./VK_API_SETUP.md) - базовая настройка VK API

## 🔧 Разработка

- `npm run dev` - режим разработки с автоперезагрузкой
- `npm run build` - сборка проекта
- `npm run start:cursor` - запуск stdio сервера для Cursor
- `npm run start:make` - запуск HTTP/SSE сервера для Make

## 📊 Мониторинг

Railway автоматически предоставляет:
- Логи в реальном времени
- Метрики производительности
- Автоматические перезапуски при сбоях
- Health checks

## 📄 Лицензия

MIT
