# Развертывание MCP VKontakte Server на Railway

## Шаг 1: Подготовка репозитория

1. **Fork репозитория** на GitHub
2. **Убедитесь, что все файлы на месте:**
   - `package.json` с зависимостями
   - `railway.json` для конфигурации Railway
   - `Dockerfile` для контейнеризации
   - `src/http-server.ts` для HTTP транспорта

## Шаг 2: Настройка Railway

1. **Перейдите на [Railway](https://railway.app)**
2. **Войдите через GitHub**
3. **Нажмите "New Project"**
4. **Выберите "Deploy from GitHub repo"**
5. **Выберите ваш fork репозитория**

## Шаг 3: Настройка переменных окружения

В настройках проекта Railway добавьте:

```bash
VK_ACCESS_TOKEN=ваш_vk_access_token_здесь
VK_API_VERSION=5.131
VK_GROUP_ID=id_вашей_группы_вк
```

### Как получить VK Access Token:

1. Перейдите на [VK Developer](https://vk.com/dev)
2. Создайте приложение
3. Получите Access Token через OAuth
4. Скопируйте токен в переменную `VK_ACCESS_TOKEN`

## Шаг 4: Развертывание

1. **Railway автоматически определит конфигурацию** из `railway.json`
2. **Нажмите "Deploy"**
3. **Дождитесь завершения сборки** (обычно 2-5 минут)

## Шаг 5: Получение URL

После успешного развертывания Railway предоставит URL вида:
```
https://your-app-name.railway.app
```

## Шаг 6: Проверка работоспособности

### Health Check
```
https://your-app-name.railway.app/health
```

Ожидаемый ответ:
```json
{
  "status": "ok",
  "service": "VKontakte MCP Server",
  "version": "1.0.0",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

### MCP Info
```
https://your-app-name.railway.app/mcp-info
```

Ожидаемый ответ:
```json
{
  "name": "vkontakte-mcp-server",
  "version": "1.0.0",
  "description": "MCP server for VKontakte (VK.com) integration",
  "transports": ["Streamable HTTP"],
  "capabilities": ["tools"],
  "tools": [
    "post_to_wall",
    "get_wall_posts",
    "search_posts",
    "get_group_info",
    "get_user_info"
  ]
}
```

## Шаг 7: Настройка MCP клиента

### Для Cursor/Claude Desktop:

```json
{
  "mcpServers": {
    "vkontakte": {
      "command": "curl",
      "args": [
        "-X", "POST",
        "https://your-app-name.railway.app/mcp"
      ],
      "description": "MCP server for VKontakte (VK.com) integration",
      "disabled": false
    }
  }
}
```

### Для других MCP клиентов:

Используйте URL:
```
https://your-app-name.railway.app/mcp
```

## Мониторинг и логи

### В Railway Dashboard:
- **Logs** - логи в реальном времени
- **Metrics** - метрики производительности
- **Deployments** - история развертываний

### Автоматические функции:
- ✅ Health checks каждые 30 секунд
- ✅ Автоматические перезапуски при сбоях
- ✅ SSL сертификаты включены
- ✅ Автоматическое масштабирование

## Возможные проблемы

### 1. Ошибка сборки
- Проверьте, что все зависимости указаны в `package.json`
- Убедитесь, что `tsconfig.json` корректно настроен

### 2. Ошибка запуска
- Проверьте переменные окружения
- Убедитесь, что `VK_ACCESS_TOKEN` установлен

### 3. Ошибка подключения к VK API
- Проверьте валидность токена
- Убедитесь, что у приложения есть необходимые права

### 4. CORS ошибки
- Сервер настроен для работы с любыми origin
- Если проблемы, проверьте настройки CORS в `src/http-server.ts`

## Обновление приложения

1. **Внесите изменения** в ваш fork
2. **Push в GitHub**
3. **Railway автоматически пересоберет и развернет** приложение

## Стоимость

Railway предлагает:
- **Free tier**: $5 кредитов в месяц
- **Pro plan**: $20/месяц за неограниченные кредиты
- **Pay-as-you-go**: оплата только за использованные ресурсы

Для MCP сервера обычно достаточно Free tier.

## Альтернативные платформы

Если Railway не подходит, можно использовать:

- **Vercel** - serverless функции
- **Netlify** - serverless функции  
- **Heroku** - традиционные dynos
- **DigitalOcean App Platform** - контейнеры

## Поддержка

При возникновении проблем:
1. Проверьте логи в Railway Dashboard
2. Убедитесь, что все переменные окружения установлены
3. Проверьте работоспособность VK API токена
4. Создайте Issue в репозитории проекта
