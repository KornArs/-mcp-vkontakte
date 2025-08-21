# Получение VK_ACCESS_TOKEN для MCP сервера

## 🔑 Обзор аутентификации VK API

VK API поддерживает несколько способов аутентификации:
1. **OAuth 2.0** - для веб-приложений (рекомендуется для MCP сервера)
2. **Direct Authorization** - для официальных приложений
3. **Service Token** - для сервисных приложений

## 🚀 Способ 1: OAuth 2.0 (Рекомендуется)

### Шаг 1: Создание приложения ВКонтакте

1. **Перейдите на [VK Developer](https://vk.com/dev)**
2. **Войдите в свой аккаунт ВКонтакте**
3. **Нажмите "Создать приложение"**
4. **Заполните форму:**
   - **Название**: `MCP VKontakte Server`
   - **Платформа**: `Веб-сайт`
   - **Адрес сайта**: `http://localhost` (для разработки)
   - **Базовый домен**: `localhost`
5. **Нажмите "Подтвердить"**

### Шаг 2: Настройка приложения

1. **В настройках приложения перейдите в "Настройки"**
2. **Включите "Open API"**
3. **Скопируйте:**
   - **ID приложения** (например: `12345678`)
   - **Защищенный ключ** (если есть)

### Шаг 3: Получение Access Token

#### Для работы с личным профилем:

1. **Сформируйте OAuth URL:**
   ```
   https://oauth.vk.com/authorize?client_id=YOUR_APP_ID&display=page&redirect_uri=http://localhost&scope=wall,offline&response_type=token&v=5.131
   ```

2. **Замените `YOUR_APP_ID` на ваш ID приложения**

3. **Откройте URL в браузере**

4. **Разрешите доступ приложению**

5. **Скопируйте токен из адресной строки:**
   ```
   http://localhost#access_token=YOUR_TOKEN_HERE&expires_in=0&user_id=12345
   ```

#### Для работы с группами:

1. **Добавьте права на управление группами:**
   ```
   https://oauth.vk.com/authorize?client_id=YOUR_APP_ID&display=page&redirect_uri=http://localhost&scope=groups,wall,offline&response_type=token&v=5.131
   ```

2. **Скопируйте токен аналогично**

## 🔧 Способ 2: Direct Authorization (Только для официальных приложений)

Если у вас есть официальное приложение ВКонтакте:

```javascript
import { CallbackService } from 'vk-io';
import { DirectAuthorization, officialAppCredentials } from '@vk-io/authorization';

const callbackService = new CallbackService();

const direct = new DirectAuthorization({
    callbackService,
    scope: 'all',
    ...officialAppCredentials.android, // Используйте официальные креды
    login: process.env.LOGIN,
    password: process.env.PASSWORD,
    apiVersion: '5.199'
});

async function run() {
    const response = await direct.run();
    console.log('Token:', response.token);
    console.log('Expires:', response.expires);
}

run().catch(console.error);
```

## 📋 Необходимые права доступа (scope)

### Для MCP сервера ВКонтакте:

```bash
# Основные права
wall          # Публикация и чтение постов
offline       # Токен не истекает

# Дополнительные права (опционально)
groups        # Управление группами
photos        # Работа с фотографиями
video         # Работа с видео
audio         # Работа с аудио
docs          # Работа с документами
```

### Полный scope для всех функций:
```
wall,offline,groups,photos,video,audio,docs
```

## ⚠️ Важные замечания

### Безопасность токена:
- **Никогда не публикуйте токен** в открытом доступе
- **Храните токен** только в переменных окружения
- **Регулярно обновляйте** токен при необходимости

### Ограничения VK API:
- **Rate limiting**: максимум 3 запроса в секунду
- **Токен истекает**: если не указан `offline` scope
- **Права доступа**: зависят от настроек приложения

## 🧪 Тестирование токена

### Проверка работоспособности:

```bash
# Используя curl
curl "https://api.vk.com/method/users.get?user_ids=1&access_token=YOUR_TOKEN&v=5.131"

# Ожидаемый ответ:
{
  "response": [
    {
      "id": 1,
      "first_name": "Павел",
      "last_name": "Дуров"
    }
  ]
}
```

### Проверка прав доступа:

```bash
# Проверка прав на публикацию
curl "https://api.vk.com/method/wall.get?owner_id=YOUR_USER_ID&count=1&access_token=YOUR_TOKEN&v=5.131"
```

## 🔄 Обновление токена

### Если токен истек:

1. **Повторите процесс OAuth**
2. **Получите новый токен**
3. **Обновите переменную окружения**
4. **Перезапустите MCP сервер**

### Автоматическое обновление:

Для production использования рекомендуется:
- Использовать `offline` scope
- Реализовать механизм обновления токенов
- Логировать ошибки аутентификации

## 📝 Примеры использования в MCP сервере

### Переменные окружения:

```bash
# .env файл
VK_ACCESS_TOKEN=vk1.aBcDeFgHiJkLmNoPqRsTuVwXyZ1234567890abcdefghijklmnopqrstuvwxyz
VK_API_VERSION=5.131
VK_GROUP_ID=12345
```

### Проверка в коде:

```typescript
// src/http-server.ts
function createMCPServer() {
  const accessToken = process.env.VK_ACCESS_TOKEN;
  const apiVersion = process.env.VK_API_VERSION || '5.131';

  if (!accessToken) {
    throw new Error('VK_ACCESS_TOKEN environment variable is required');
  }

  // Проверка валидности токена
  if (!accessToken.startsWith('vk1.')) {
    throw new Error('Invalid VK access token format');
  }

  const vkApi = new VKApi(accessToken, apiVersion);
  // ... остальной код
}
```

## 🆘 Решение проблем

### Ошибка "Invalid access_token":
- Проверьте правильность токена
- Убедитесь, что токен не истек
- Проверьте права приложения

### Ошибка "Access denied":
- Проверьте scope в OAuth URL
- Убедитесь, что приложение включено
- Проверьте настройки приватности

### Ошибка "User authorization failed":
- Токен истек или недействителен
- Пользователь отозвал доступ
- Неправильный формат токена

## 📚 Дополнительные ресурсы

- [VK Developer](https://vk.com/dev) - официальная документация
- [VK API Schema](https://github.com/vkcom/vk-api-schema) - JSON схемы API
- [VK-IO](https://github.com/negezor/vk-io) - Node.js библиотека
- [Node VK Call](https://github.com/vkcom/node-vk-call) - простая обертка API

## ✅ Чек-лист готовности

- [ ] Создано приложение на VK Developer
- [ ] Включен Open API
- [ ] Получен Access Token через OAuth
- [ ] Проверена работоспособность токена
- [ ] Настроены переменные окружения
- [ ] Протестирован MCP сервер
- [ ] Настроен Railway deployment
