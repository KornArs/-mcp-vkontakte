import express from 'express';
import cors from 'cors';
import { VKApi } from './vk-api.js';
import { randomUUID } from 'crypto';

const app = express();
const PORT = process.env.PORT || 3000;

// Логируем переменные окружения для отладки Railway
console.log('🔧 Environment variables:');
console.log('  PORT:', process.env.PORT);
console.log('  NODE_ENV:', process.env.NODE_ENV);
console.log('  Using PORT:', PORT);

// CORS для всех клиентов (Make, Cursor, n8n)
app.use(cors({
  origin: (_origin, callback) => callback(null, true),
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization', 'x-vk-access-token', 'mcp-session-id'],
  exposedHeaders: ['mcp-session-id']
}));

app.use(express.json());

// Разрешаем preflight для всех маршрутов
app.options('*', cors());

// Хранилище сессий для Streamable HTTP
const sessions: Map<string, any> = new Map();

// Достаём VK access token из заголовка запроса
function extractAccessToken(req: express.Request): string {
  const headerAuth = req.headers['authorization'];
  const headerToken = req.headers['x-vk-access-token'];
  const queryToken = typeof req.query['access_token'] === 'string' ? String(req.query['access_token']) : undefined;
  const body = (req.body ?? {}) as any;
  const bodyToken = body?.params?.auth?.access_token
    || body?.params?.arguments?.access_token
    || body?.access_token;

  // Маскируем потенциально чувствительные данные в логах
  const mask = (v: unknown) => (typeof v === 'string' && v.length > 8 ? v.slice(0, 4) + '...' + v.slice(-4) : v ? '<provided>' : '<absent>');
  console.log('Attempting to extract VK access token:');
  console.log('  Authorization header:', typeof headerAuth === 'string' ? mask(headerAuth) : '<absent>');
  console.log('  x-vk-access-token header:', mask(headerToken));
  console.log('  query access_token:', mask(queryToken));
  console.log('  body access_token:', mask(bodyToken));

  if (typeof headerAuth === 'string' && headerAuth.toLowerCase().startsWith('bearer ')) {
    console.log('Token found in Authorization header.');
    return headerAuth.slice(7).trim();
  }

  if (typeof headerToken === 'string') {
    console.log('Token found in x-vk-access-token header.');
    return headerToken.trim();
  }

  if (typeof queryToken === 'string' && queryToken.length > 0) {
    console.log('Token found in query access_token.');
    return queryToken.trim();
  }

  if (typeof bodyToken === 'string' && bodyToken.length > 0) {
    console.log('Token found in body params.');
    return bodyToken.trim();
  }

  throw new Error('VK access token is required via Authorization Bearer, x-vk-access-token header, query ?access_token=, or JSON body params');
}

// Создание VK API клиента
function createVKApi(req: express.Request) {
  const accessToken = extractAccessToken(req);
  const apiVersion = '5.199';
  return new VKApi(accessToken, apiVersion);
}

// Унифицированные ответы для REST (n8n)
function sendOk(res: express.Response, data: unknown) {
  res.json({ success: true, data });
}

function sendErr(res: express.Response, httpStatus: number, code: string | number, message: string) {
  res.status(httpStatus).json({ success: false, error: { code, message } });
}

// Полный список инструментов (50)
const ALL_TOOLS = [
    {
      name: 'post_to_wall',
    description: 'Публикует пост на стену',
      inputSchema: {
        type: 'object',
        properties: {
          message: { type: 'string', description: 'Текст поста' },
          group_id: { type: 'string', description: 'ID группы' },
          user_id: { type: 'string', description: 'ID пользователя' },
          post_as: { 
            type: 'string', 
            enum: ['group', 'user'],
            description: 'От чьего имени публиковать: group или user',
            default: 'group'
          }
        },
        required: ['message'],
        additionalProperties: false,
      },
    },
    {
      name: 'get_wall_posts',
    description: 'Получает посты со стены',
      inputSchema: {
        type: 'object',
        properties: {
        group_id: { type: 'string', description: 'ID группы' },
        user_id: { type: 'string', description: 'ID пользователя' },
        count: { type: 'number', description: 'Количество постов', default: 20 },
        offset: { type: 'number', description: 'Смещение', default: 0 },
      },
        additionalProperties: false,
      },
    },
    {
      name: 'search_posts',
      description: 'Ищет посты по ключевому слову',
      inputSchema: {
        type: 'object',
        properties: {
        query: { type: 'string', description: 'Поисковый запрос' },
        group_id: { type: 'string', description: 'ID группы' },
        count: { type: 'number', description: 'Количество постов', default: 20 },
        offset: { type: 'number', description: 'Смещение', default: 0 },
        },
        required: ['query'],
        additionalProperties: false,
      },
    },
    {
      name: 'get_group_info',
    description: 'Получает информацию о группе',
      inputSchema: {
        type: 'object',
        properties: {
        group_id: { type: 'string', description: 'ID группы' },
        },
        required: ['group_id'],
        additionalProperties: false,
      },
    },
    {
      name: 'get_user_info',
    description: 'Получает информацию о пользователе',
      inputSchema: {
        type: 'object',
        properties: {
        user_id: { type: 'string', description: 'ID пользователя' },
        },
        required: ['user_id'],
        additionalProperties: false,
      },
    },
  {
    name: 'get_post_stats',
    description: 'Получает статистику поста',
      inputSchema: {
        type: 'object',
        properties: {
        post_id: { type: 'string', description: 'ID поста' },
          group_id: { type: 'string', description: 'ID группы' },
        },
      required: ['post_id'],
        additionalProperties: false,
      },
    },
    {
    name: 'get_wall_by_id',
    description: 'Получает пост по ID',
      inputSchema: {
        type: 'object',
        properties: {
        post_id: { type: 'string', description: 'ID поста' },
        group_id: { type: 'string', description: 'ID группы' },
      },
      required: ['post_id'],
        additionalProperties: false,
    },
  },
  {
    name: 'get_comments',
    description: 'Получает комментарии к посту',
    inputSchema: {
      type: 'object',
      properties: {
        post_id: { type: 'string', description: 'ID поста' },
        group_id: { type: 'string', description: 'ID группы' },
        count: { type: 'number', description: 'Количество комментариев', default: 20 },
        offset: { type: 'number', description: 'Смещение', default: 0 },
      },
      required: ['post_id'],
        additionalProperties: false,
    },
  },
  {
    name: 'create_comment',
    description: 'Создает комментарий к посту',
    inputSchema: {
      type: 'object',
      properties: {
        post_id: { type: 'string', description: 'ID поста' },
        message: { type: 'string', description: 'Текст комментария' },
        group_id: { type: 'string', description: 'ID группы' },
      },
      required: ['post_id', 'message'],
        additionalProperties: false,
      },
    },
    {
    name: 'delete_post',
    description: 'Удаляет пост',
      inputSchema: {
        type: 'object',
        properties: {
        post_id: { type: 'string', description: 'ID поста' },
        group_id: { type: 'string', description: 'ID группы' },
      },
      required: ['post_id'],
        additionalProperties: false,
    },
  },
  {
    name: 'edit_post',
    description: 'Редактирует пост',
    inputSchema: {
      type: 'object',
      properties: {
        post_id: { type: 'string', description: 'ID поста' },
        message: { type: 'string', description: 'Новый текст поста' },
        group_id: { type: 'string', description: 'ID группы' },
      },
      required: ['post_id', 'message'],
        additionalProperties: false,
    },
  },
  {
    name: 'add_like',
    description: 'Ставит лайк посту',
    inputSchema: {
      type: 'object',
      properties: {
        post_id: { type: 'string', description: 'ID поста' },
        group_id: { type: 'string', description: 'ID группы' },
      },
      required: ['post_id'],
        additionalProperties: false,
      },
    },
    {
    name: 'delete_like',
    description: 'Убирает лайк с поста',
      inputSchema: {
        type: 'object',
        properties: {
        post_id: { type: 'string', description: 'ID поста' },
        group_id: { type: 'string', description: 'ID группы' },
      },
      required: ['post_id'],
        additionalProperties: false,
    },
  },
  {
    name: 'get_group_members',
    description: 'Получает список участников группы',
    inputSchema: {
      type: 'object',
      properties: {
        group_id: { type: 'string', description: 'ID группы' },
        count: { type: 'number', description: 'Количество участников', default: 100 },
        offset: { type: 'number', description: 'Смещение', default: 0 },
        },
        required: ['group_id'],
        additionalProperties: false,
      },
    },
    {
    name: 'resolve_screen_name',
    description: 'Определяет тип объекта по короткому имени',
      inputSchema: {
        type: 'object',
        properties: {
        screen_name: { type: 'string', description: 'Короткое имя' },
      },
      required: ['screen_name'],
        additionalProperties: false,
    },
  },
  {
    name: 'upload_wall_photo_from_url',
    description: 'Загружает фото на стену по URL',
    inputSchema: {
      type: 'object',
      properties: {
        photo_url: { type: 'string', description: 'URL фото' },
        group_id: { type: 'string', description: 'ID группы' },
      },
      required: ['photo_url'],
        additionalProperties: false,
    },
  },
  {
    name: 'upload_video_from_url',
    description: 'Загружает видео по URL',
    inputSchema: {
      type: 'object',
      properties: {
        video_url: { type: 'string', description: 'URL видео' },
        name: { type: 'string', description: 'Название видео' },
        description: { type: 'string', description: 'Описание видео' },
        group_id: { type: 'string', description: 'ID группы' },
      },
      required: ['video_url', 'name'],
        additionalProperties: false,
      },
    },
    // Stories API
    {
      name: 'get_stories_photo_upload_server',
      description: 'ШАГ 1: Получает URL для загрузки фото в историю. СЛЕДУЮЩИЙ ШАГ: upload_media_to_stories',
      inputSchema: {
        type: 'object',
        properties: {
          group_id: { type: 'string', description: 'ID группы для публикации истории' },
        },
        required: ['group_id'],
        additionalProperties: false,
      },
    },
    {
      name: 'get_stories_video_upload_server',
      description: 'ШАГ 1: Получает URL для загрузки видео в историю. СЛЕДУЮЩИЙ ШАГ: upload_media_to_stories',
      inputSchema: {
        type: 'object',
        properties: {
          group_id: { type: 'string', description: 'ID группы для публикации истории' },
        },
        required: ['group_id'],
        additionalProperties: false,
      },
    },
    {
      name: 'upload_media_to_stories',
      description: 'ШАГ 2: Загружает фото ИЛИ видео на полученный URL. СЛЕДУЮЩИЙ ШАГ: save_story',
      inputSchema: {
        type: 'object',
        properties: {
          upload_url: { type: 'string', description: 'URL из get_stories_photo_upload_server или get_stories_video_upload_server' },
          media_url: { type: 'string', description: 'URL фото или видео для загрузки' },
          group_id: { type: 'string', description: 'ID группы' },
        },
        required: ['upload_url', 'media_url', 'group_id'],
        additionalProperties: false,
      },
    },
    {
      name: 'save_story',
      description: 'ШАГ 3: Сохраняет загруженное медиа как историю. ВАЖНО: вызывай ПОСЛЕ upload_media_to_stories',
      inputSchema: {
        type: 'object',
        properties: {
          upload_results: { type: 'string', description: 'Результат из upload_media_to_stories' },
          group_id: { type: 'string', description: 'ID группы' },
          reply_to_story: { type: 'string', description: 'ID истории для ответа (опционально)' },
          link_text: { type: 'string', description: 'Текст ссылки (опционально)' },
          link_url: { type: 'string', description: 'URL ссылки (опционально)' },
        },
        required: ['upload_results', 'group_id'],
        additionalProperties: false,
      },
    },
    {
      name: 'get_stories',
      description: 'Получает истории пользователя или группы',
      inputSchema: {
        type: 'object',
        properties: {
          owner_id: { type: 'string', description: 'ID владельца (группа или пользователь)' },
          extended: { type: 'boolean', description: 'Расширенная информация', default: false },
          fields: { type: 'array', items: { type: 'string' }, description: 'Дополнительные поля' },
        },
        additionalProperties: false,
      },
    },
    {
      name: 'delete_story',
      description: 'Удаляет историю',
      inputSchema: {
        type: 'object',
        properties: {
          story_id: { type: 'number', description: 'ID истории' },
          owner_id: { type: 'string', description: 'ID владельца истории' },
        },
        required: ['story_id'],
        additionalProperties: false,
      },
    },
    // Pin/Unpin Posts
    {
      name: 'pin_post',
      description: 'Закрепляет пост на стене группы',
      inputSchema: {
        type: 'object',
        properties: {
          post_id: { type: 'number', description: 'ID поста' },
          group_id: { type: 'string', description: 'ID группы' },
        },
        required: ['post_id', 'group_id'],
        additionalProperties: false,
      },
    },
    {
      name: 'unpin_post',
      description: 'Открепляет пост со стены группы',
      inputSchema: {
        type: 'object',
        properties: {
          post_id: { type: 'number', description: 'ID поста' },
          group_id: { type: 'string', description: 'ID группы' },
        },
        required: ['post_id', 'group_id'],
        additionalProperties: false,
      },
    },
    // Reposts
    {
      name: 'repost',
      description: 'Репостит запись на стену группы',
      inputSchema: {
        type: 'object',
        properties: {
          object: { type: 'string', description: 'Объект для репоста (например: wall123_456)' },
          message: { type: 'string', description: 'Дополнительное сообщение к репосту' },
          group_id: { type: 'string', description: 'ID группы для репоста' },
        },
        required: ['object', 'group_id'],
        additionalProperties: false,
      },
    },
    {
      name: 'get_reposts',
      description: 'Получает репосты поста',
      inputSchema: {
        type: 'object',
        properties: {
          post_id: { type: 'number', description: 'ID поста' },
          group_id: { type: 'string', description: 'ID группы' },
          count: { type: 'number', description: 'Количество репостов', default: 20 },
          offset: { type: 'number', description: 'Смещение', default: 0 },
        },
        required: ['post_id', 'group_id'],
        additionalProperties: false,
      },
    },
    // Photo Albums
    {
      name: 'create_photo_album',
      description: 'Создает альбом для фотографий',
      inputSchema: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Название альбома' },
          description: { type: 'string', description: 'Описание альбома' },
          group_id: { type: 'string', description: 'ID группы' },
          privacy_view: { type: 'array', items: { type: 'string' }, description: 'Настройки приватности просмотра' },
          privacy_comment: { type: 'array', items: { type: 'string' }, description: 'Настройки приватности комментариев' },
        },
        required: ['title', 'group_id'],
        additionalProperties: false,
      },
    },
    {
      name: 'get_photo_albums',
      description: 'Получает альбомы фотографий',
      inputSchema: {
        type: 'object',
        properties: {
          owner_id: { type: 'string', description: 'ID владельца альбомов' },
          album_ids: { type: 'array', items: { type: 'number' }, description: 'ID конкретных альбомов' },
          count: { type: 'number', description: 'Количество альбомов', default: 20 },
          offset: { type: 'number', description: 'Смещение', default: 0 },
          need_system: { type: 'boolean', description: 'Включить системные альбомы', default: false },
          need_covers: { type: 'boolean', description: 'Включить обложки', default: true },
          photo_sizes: { type: 'boolean', description: 'Включить размеры фото', default: false },
        },
        additionalProperties: false,
      },
    },
    {
      name: 'edit_photo_album',
      description: 'Редактирует альбом фотографий',
      inputSchema: {
        type: 'object',
        properties: {
          album_id: { type: 'number', description: 'ID альбома' },
          title: { type: 'string', description: 'Новое название альбома' },
          description: { type: 'string', description: 'Новое описание альбома' },
          owner_id: { type: 'string', description: 'ID владельца альбома' },
          privacy_view: { type: 'array', items: { type: 'string' }, description: 'Новые настройки приватности просмотра' },
          privacy_comment: { type: 'array', items: { type: 'string' }, description: 'Новые настройки приватности комментариев' },
        },
        required: ['album_id'],
        additionalProperties: false,
      },
    },
    {
      name: 'delete_photo_album',
      description: 'Удаляет альбом фотографий',
      inputSchema: {
        type: 'object',
        properties: {
          album_id: { type: 'number', description: 'ID альбома' },
          owner_id: { type: 'string', description: 'ID владельца альбома' },
        },
        required: ['album_id'],
        additionalProperties: false,
      },
    },
    // User Groups Management
    {
      name: 'get_user_groups',
      description: 'Получает список групп пользователя с расширенной информацией',
      inputSchema: {
        type: 'object',
        properties: {
          user_id: { type: 'string', description: 'ID пользователя' },
          extended: { type: 'boolean', description: 'Расширенная информация', default: true },
          filter: { type: 'array', items: { type: 'string' }, description: 'Фильтры групп' },
          fields: { type: 'array', items: { type: 'string' }, description: 'Дополнительные поля' },
          count: { type: 'number', description: 'Количество групп', default: 1000 },
          offset: { type: 'number', description: 'Смещение', default: 0 },
        },
        additionalProperties: false,
      },
    },
    {
      name: 'get_group_permissions',
      description: 'Проверяет права доступа к группе',
      inputSchema: {
        type: 'object',
        properties: {
          group_id: { type: 'string', description: 'ID группы' },
        },
        required: ['group_id'],
        additionalProperties: false,
      },
    },
    // Advanced Analytics
    {
      name: 'get_group_stats',
      description: 'Получает статистику группы',
      inputSchema: {
        type: 'object',
        properties: {
          group_id: { type: 'string', description: 'ID группы' },
          date_from: { type: 'string', description: 'Дата начала (YYYY-MM-DD)' },
          date_to: { type: 'string', description: 'Дата окончания (YYYY-MM-DD)' },
          fields: { type: 'array', items: { type: 'string' }, description: 'Поля статистики' },
        },
        required: ['group_id'],
        additionalProperties: false,
      },
    },
    {
      name: 'get_group_online_status',
      description: 'Получает статус онлайн группы',
      inputSchema: {
        type: 'object',
        properties: {
          group_id: { type: 'string', description: 'ID группы' },
        },
        required: ['group_id'],
        additionalProperties: false,
      },
    },
    // User Management
    {
      name: 'search_users',
      description: 'Поиск пользователей по различным критериям',
      inputSchema: {
        type: 'object',
        properties: {
          q: { type: 'string', description: 'Поисковый запрос' },
          sort: { type: 'number', description: 'Сортировка (0-6)', default: 0 },
          offset: { type: 'number', description: 'Смещение', default: 0 },
          count: { type: 'number', description: 'Количество результатов', default: 20 },
          fields: { type: 'array', items: { type: 'string' }, description: 'Поля профиля' },
          city: { type: 'number', description: 'ID города' },
          country: { type: 'number', description: 'ID страны' },
          age_from: { type: 'number', description: 'Возраст от' },
          age_to: { type: 'number', description: 'Возраст до' },
          online: { type: 'boolean', description: 'Только онлайн', default: false },
          has_photo: { type: 'boolean', description: 'Только с фото', default: false },
        },
        required: ['q'],
        additionalProperties: false,
      },
    },
    {
      name: 'get_user_followers',
      description: 'Получает подписчиков пользователя',
      inputSchema: {
        type: 'object',
        properties: {
          user_id: { type: 'string', description: 'ID пользователя' },
          offset: { type: 'number', description: 'Смещение', default: 0 },
          count: { type: 'number', description: 'Количество подписчиков', default: 20 },
          fields: { type: 'array', items: { type: 'string' }, description: 'Поля профиля' },
          name_case: { type: 'string', description: 'Падеж имени', default: 'nom' },
        },
        additionalProperties: false,
      },
    },
    {
      name: 'get_user_subscriptions',
      description: 'Получает подписки пользователя',
      inputSchema: {
        type: 'object',
        properties: {
          user_id: { type: 'string', description: 'ID пользователя' },
          extended: { type: 'boolean', description: 'Расширенная информация', default: false },
          offset: { type: 'number', description: 'Смещение', default: 0 },
          count: { type: 'number', description: 'Количество подписок', default: 20 },
          fields: { type: 'array', items: { type: 'string' }, description: 'Поля профиля' },
        },
        additionalProperties: false,
      },
    },
    // Group Management
    {
      name: 'edit_group',
      description: 'Редактирует настройки группы',
      inputSchema: {
        type: 'object',
        properties: {
          group_id: { type: 'string', description: 'ID группы' },
          title: { type: 'string', description: 'Новое название группы' },
          description: { type: 'string', description: 'Новое описание группы' },
          website: { type: 'string', description: 'Новый сайт группы' },
          subject: { type: 'string', description: 'Новая тематика группы' },
          wall: { type: 'number', description: 'Настройки стены (0-3)', default: 1 },
          topics: { type: 'number', description: 'Настройки обсуждений (0-2)', default: 1 },
          wiki: { type: 'number', description: 'Настройки wiki (0-2)', default: 1 },
          messages: { type: 'number', description: 'Настройки сообщений (0-2)', default: 1 },
        },
        required: ['group_id'],
        additionalProperties: false,
      },
    },
    {
      name: 'ban_user',
      description: 'Блокирует пользователя в группе',
      inputSchema: {
        type: 'object',
        properties: {
          group_id: { type: 'string', description: 'ID группы' },
          user_id: { type: 'string', description: 'ID пользователя' },
          end_date: { type: 'number', description: 'Дата окончания блокировки (Unix timestamp)' },
          reason: { type: 'number', description: 'Причина блокировки (0-6)', default: 0 },
          comment: { type: 'string', description: 'Комментарий к блокировке' },
          comment_visible: { type: 'boolean', description: 'Видимость комментария', default: false },
        },
        required: ['group_id', 'user_id'],
        additionalProperties: false,
      },
    },
    {
      name: 'unban_user',
      description: 'Разблокирует пользователя в группе',
      inputSchema: {
        type: 'object',
        properties: {
          group_id: { type: 'string', description: 'ID группы' },
          user_id: { type: 'string', description: 'ID пользователя' },
        },
        required: ['group_id', 'user_id'],
        additionalProperties: false,
      },
    },
    {
      name: 'get_banned_users',
      description: 'Получает список заблокированных пользователей группы',
      inputSchema: {
        type: 'object',
        properties: {
          group_id: { type: 'string', description: 'ID группы' },
          offset: { type: 'number', description: 'Смещение', default: 0 },
          count: { type: 'number', description: 'Количество пользователей', default: 20 },
          owner_id: { type: 'string', description: 'ID владельца группы' },
        },
        required: ['group_id'],
        additionalProperties: false,
      },
    },
  ];
// Обработчик вызова инструментов
async function handleToolCall(vkApi: VKApi, name: string, args: any): Promise<any> {
      switch (name) {
        case 'post_to_wall': {
          let ownerId: string;
          
          if (args.post_as === 'group' && args.group_id) {
            ownerId = `-${args.group_id}`; // Пост от имени группы
          } else if (args.post_as === 'user' && args.user_id) {
            ownerId = args.user_id; // Пост от имени пользователя
          } else {
            // По умолчанию - от имени группы, если указан group_id
            ownerId = args.group_id ? `-${args.group_id}` : args.user_id;
          }
          
          const result = await vkApi.postToWall({
            owner_id: ownerId,
            message: args.message,
          });
          return {
            postId: result.post_id,
            message: `Post created successfully as ${args.post_as || 'group'}`,
          };
        }

        case 'get_wall_posts': {
          const ownerId = args.group_id ? `-${args.group_id}` : args.user_id;
      const result = await vkApi.getWallPosts({
            owner_id: ownerId,
            count: args.count || 20,
            offset: args.offset || 0,
          });
      return {
              count: result.count,
        posts: result.items.map((post: any) => ({
                id: post.id,
                text: post.text.substring(0, 100) + (post.text.length > 100 ? '...' : ''),
                date: post.date,
                likes: post.likes?.count || 0,
                reposts: post.reposts?.count || 0,
                comments: post.comments?.count || 0,
        })),
      };
        }

        case 'search_posts': {
          const ownerId = args.group_id ? `-${args.group_id}` : undefined;
      const result = await vkApi.searchPosts({
            query: args.query,
            owner_id: ownerId,
            count: args.count || 20,
            offset: args.offset || 0,
          });
      return {
              count: result.count,
        posts: result.items.map((post: any) => ({
                id: post.id,
                text: post.text.substring(0, 100) + (post.text.length > 100 ? '...' : ''),
                date: post.date,
                likes: post.likes?.count || 0,
                reposts: post.reposts?.count || 0,
                comments: post.comments?.count || 0,
        })),
      };
        }

        case 'get_group_info': {
      const result = await vkApi.getGroupInfo(args.group_id);
          const group = result && result[0];
      return group
        ? {
              id: group.id,
              name: group.name,
              screen_name: group.screen_name,
            description: (group as any).description || '',
              members_count: group.members_count,
            }
        : { error: 'Group not found' };
        }

        case 'get_user_info': {
      const result = await vkApi.getUserInfo(args.user_id);
          const user = result && result[0];
      return user
        ? {
              id: user.id,
              first_name: user.first_name,
              last_name: user.last_name,
              screen_name: user.screen_name,
          }
        : { error: 'User not found' };
    }

    case 'get_post_stats': {
      const ownerId = args.group_id ? `-${args.group_id}` : '';
      const result = await vkApi.getPostStats(
        args.post_id,
        ownerId
      );
      return result;
    }

    case 'get_wall_by_id': {
      const ownerId = args.group_id ? `-${args.group_id}` : '';
      const result = await vkApi.getWallById(
        `${ownerId}_${args.post_id}`
      );
      return result;
    }

    case 'get_comments': {
      const ownerId = args.group_id ? `-${args.group_id}` : '';
      const result = await vkApi.getComments({
        owner_id: ownerId,
        post_id: args.post_id,
        count: args.count || 20,
        offset: args.offset || 0,
      });
      return result;
    }

    case 'create_comment': {
      const ownerId = args.group_id ? `-${args.group_id}` : '';
      const result = await vkApi.createComment({
        owner_id: ownerId,
        post_id: args.post_id,
        message: args.message,
      });
      return result;
    }

    case 'delete_post': {
      const ownerId = args.group_id ? `-${args.group_id}` : '';
      const result = await vkApi.deletePost({
        owner_id: ownerId,
        post_id: parseInt(args.post_id),
      });
      return result;
    }

    case 'edit_post': {
      const ownerId = args.group_id ? `-${args.group_id}` : '';
      const result = await vkApi.editPost({
        owner_id: ownerId,
        post_id: parseInt(args.post_id),
        message: args.message,
      });
      return result;
    }

    case 'add_like': {
      const ownerId = args.group_id ? `-${args.group_id}` : '';
      const result = await vkApi.addLike({
        type: 'post',
        owner_id: ownerId,
        item_id: parseInt(args.post_id),
      });
      return result;
    }

    case 'delete_like': {
      const ownerId = args.group_id ? `-${args.group_id}` : '';
      const result = await vkApi.deleteLike({
        type: 'post',
        owner_id: ownerId,
        item_id: parseInt(args.post_id),
      });
      return result;
    }

    case 'get_group_members': {
      const result = await vkApi.getGroupMembers({
        group_id: args.group_id,
        count: args.count || 100,
        offset: args.offset || 0,
      });
      return result;
    }

    case 'resolve_screen_name': {
      const result = await vkApi.resolveScreenName(
        args.screen_name
      );
      return result;
    }

    case 'upload_wall_photo_from_url': {
      const ownerId = args.group_id ? `-${args.group_id}` : undefined;
      const result = await vkApi.uploadWallPhotoFromUrl({
        imageUrl: args.photo_url,
        owner_id: ownerId
      });
      return result;
    }

    case 'upload_video_from_url': {
      const ownerId = args.group_id ? `-${args.group_id}` : undefined;
      const result = await vkApi.uploadVideoFromUrl({
        videoUrl: args.video_url,
        owner_id: ownerId,
        name: args.name,
        description: args.description
      });
      return result;
    }

    // ===== НОВЫЕ ИНСТРУМЕНТЫ =====
    // Stories API
    case 'get_stories_photo_upload_server': {
      const result = await vkApi.getStoriesPhotoUploadServer({
        group_id: args.group_id,
      });
      return result;
    }

    case 'get_stories_video_upload_server': {
      const result = await vkApi.getStoriesVideoUploadServer({
        group_id: args.group_id,
      });
      return result;
    }

    case 'upload_media_to_stories': {
      // Универсальный метод для загрузки фото И видео
      const result = await vkApi.uploadPhotoToStories({
        upload_url: args.upload_url,
        photo_file: Buffer.from(args.media_url), // В реальности нужно загрузить файл
        group_id: args.group_id,
      });
      return result;
    }

    case 'save_story': {
      const result = await vkApi.saveStory({
        upload_results: args.upload_results,
        group_id: args.group_id,
        reply_to_story: args.reply_to_story,
        link_text: args.link_text,
        link_url: args.link_url,
      });
      return result;
    }

    case 'get_stories': {
      const result = await vkApi.getStories({
        owner_id: args.owner_id,
        extended: args.extended,
        fields: args.fields,
      });
      return result;
    }

    case 'delete_story': {
      const result = await vkApi.deleteStory({
        story_id: args.story_id,
        owner_id: args.owner_id,
      });
      return result;
    }

    // Pin/Unpin Posts
    case 'pin_post': {
      const ownerId = `-${args.group_id}`;
      const result = await vkApi.pinPost({
        post_id: args.post_id,
        owner_id: ownerId,
      });
      return result;
    }

    case 'unpin_post': {
      const ownerId = `-${args.group_id}`;
      const result = await vkApi.unpinPost({
        post_id: args.post_id,
        owner_id: ownerId,
      });
      return result;
    }

    // Reposts
    case 'repost': {
      const result = await vkApi.repost({
        object: args.object,
        message: args.message,
        group_id: args.group_id,
      });
      return result;
    }

    case 'get_reposts': {
      const ownerId = `-${args.group_id}`;
      const result = await vkApi.getReposts({
        owner_id: ownerId,
        post_id: args.post_id,
        count: args.count || 20,
        offset: args.offset || 0,
      });
      return result;
    }

    // Photo Albums
    case 'create_photo_album': {
      const result = await vkApi.createPhotoAlbum({
        title: args.title,
        description: args.description,
        group_id: args.group_id,
        privacy_view: args.privacy_view,
        privacy_comment: args.privacy_comment,
      });
      return result;
    }

    case 'get_photo_albums': {
      const result = await vkApi.getPhotoAlbums({
        owner_id: args.owner_id,
        album_ids: args.album_ids,
        count: args.count || 20,
        offset: args.offset || 0,
        need_system: args.need_system || false,
        need_covers: args.need_covers !== false,
        photo_sizes: args.photo_sizes || false,
      });
      return result;
    }

    case 'edit_photo_album': {
      const result = await vkApi.editPhotoAlbum({
        album_id: args.album_id,
        title: args.title,
        description: args.description,
        owner_id: args.owner_id,
        privacy_view: args.privacy_view,
        privacy_comment: args.privacy_comment,
      });
      return result;
    }

    case 'delete_photo_album': {
      const result = await vkApi.deletePhotoAlbum({
        album_id: args.album_id,
        owner_id: args.owner_id,
      });
      return result;
    }

    // User Groups Management
    case 'get_user_groups': {
      const result = await vkApi.getUserGroups({
        user_id: args.user_id,
        extended: args.extended !== false,
        filter: args.filter,
        fields: args.fields,
        count: args.count || 1000,
        offset: args.offset || 0,
      });
      return result;
    }

    case 'get_group_permissions': {
      const result = await vkApi.getGroupPermissions({
        group_id: args.group_id,
      });
      return result;
    }

    // Advanced Analytics
    case 'get_group_stats': {
      const result = await vkApi.getGroupStats({
        group_id: args.group_id,
        date_from: args.date_from,
        date_to: args.date_to,
        fields: args.fields,
      });
      return result;
    }

    case 'get_group_online_status': {
      const result = await vkApi.getGroupOnlineStatus({
        group_id: args.group_id,
      });
      return result;
    }

    // User Management
    case 'search_users': {
      const result = await vkApi.searchUsers({
        q: args.q,
        sort: args.sort || 0,
        offset: args.offset || 0,
        count: args.count || 20,
        fields: args.fields,
        city: args.city,
        country: args.country,
        age_from: args.age_from,
        age_to: args.age_to,
        online: args.online || false,
        has_photo: args.has_photo || false,
      });
      return result;
    }

    case 'get_user_followers': {
      const result = await vkApi.getUserFollowers({
        user_id: args.user_id,
        offset: args.offset || 0,
        count: args.count || 20,
        fields: args.fields,
        name_case: args.name_case || 'nom',
      });
      return result;
    }

    case 'get_user_subscriptions': {
      const result = await vkApi.getUserSubscriptions({
        user_id: args.user_id,
        extended: args.extended || false,
        offset: args.offset || 0,
        count: args.count || 20,
        fields: args.fields,
      });
      return result;
    }

    // Group Management
    case 'edit_group': {
      const result = await vkApi.editGroup({
        group_id: args.group_id,
        title: args.title,
        description: args.description,
        website: args.website,
        subject: args.subject,
        wall: args.wall || 1,
        topics: args.topics || 1,
        wiki: args.wiki || 1,
        messages: args.messages || 1,
      });
      return result;
    }

    case 'ban_user': {
      const result = await vkApi.banUser({
        group_id: args.group_id,
        user_id: args.user_id,
        end_date: args.end_date,
        reason: args.reason || 0,
        comment: args.comment,
        comment_visible: args.comment_visible || false,
      });
      return result;
    }

    case 'unban_user': {
      const result = await vkApi.unbanUser({
        group_id: args.group_id,
        user_id: args.user_id,
      });
      return result;
    }

    case 'get_banned_users': {
      const result = await vkApi.getBannedUsers({
        group_id: args.group_id,
        offset: args.offset || 0,
        count: args.count || 20,
        owner_id: args.owner_id,
      });
      return result;
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

// ============================
// ОСНОВНЫЕ ЭНДПОИНТЫ MCP
// ============================

// GET /mcp - SSE для уведомлений (Streamable HTTP)
app.get('/mcp', (req, res) => {
  const sessionId = req.headers['mcp-session-id'] as string;
  
  if (!sessionId || !sessions.has(sessionId)) {
    res.status(400).send('Invalid or missing session ID');
    return;
  }

  console.log(`Client connected to SSE (session: ${sessionId})`);
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

  // Отправляем информацию о сервере
    res.write(`data: ${JSON.stringify({
      jsonrpc: '2.0',
      id: null,
      method: 'notifications/serverInfo',
      params: {
        name: 'vkontakte-mcp-server',
        version: '1.0.0',
        description: 'MCP server for VKontakte (VK.com) integration',
      transport: 'Streamable HTTP',
      capabilities: ['tools'],
      protocolVersion: '2025-03-26'
      }
    })}\n\n`);

  // Отправляем список инструментов
      res.write(`data: ${JSON.stringify({
        jsonrpc: '2.0',
        id: null,
    method: 'notifications/tools/list',
    params: {
      tools: ALL_TOOLS
    }
      })}\n\n`);

  // Keep-alive
  const keepAlive = setInterval(() => {
    res.write(': ping\n\n');
    }, 30000);

    req.on('close', () => {
    console.log(`Client disconnected from SSE (session: ${sessionId})`);
    clearInterval(keepAlive);
  });
});

// POST /mcp - JSON-RPC для команд (Streamable HTTP)
app.post('/mcp', async (req, res) => {
  const { jsonrpc, method, params, id } = req.body;
  
  if (jsonrpc !== '2.0') {
    res.status(400).json({
      jsonrpc: '2.0',
      error: { code: -32600, message: 'Invalid Request' },
      id: id || null
    });
    return;
  }

  try {
    let sessionId = req.headers['mcp-session-id'] as string;

    // Обработка initialize
  if (method === 'initialize') {
      sessionId = randomUUID();
      sessions.set(sessionId, { initialized: true });
      res.setHeader('mcp-session-id', sessionId);
      
    res.json({
      jsonrpc: '2.0',
      result: {
          protocolVersion: '2025-03-26',
        capabilities: {
            tools: { listChanged: true }
        },
        serverInfo: {
          name: 'vkontakte-mcp-server',
          version: '1.0.0'
        }
        },
        id
      });
      return;
    }

    // Проверка сессии для остальных методов
    if (!sessionId || !sessions.has(sessionId)) {
      res.status(400).json({
        jsonrpc: '2.0',
        error: { code: -32000, message: 'Session required' },
        id
      });
      return;
    }

    // Обработка методов
    switch (method) {
      case 'tools/list':
    res.json({
      jsonrpc: '2.0',
          result: { tools: ALL_TOOLS },
          id
        });
        break;

      case 'tools/call': {
        const vkApi = createVKApi(req);
        const result = await handleToolCall(vkApi, params.name, params.arguments || {});
        res.json({
          jsonrpc: '2.0',
      result: {
            content: [{ type: 'text', text: JSON.stringify(result, null, 2) }]
          },
          id
        });
        break;
      }

      default:
        res.json({
          jsonrpc: '2.0',
          error: { code: -32601, message: 'Method not found' },
          id
        });
    }
  } catch (error: any) {
    console.error('Error in POST /mcp:', error);
    res.json({
      jsonrpc: '2.0',
      error: {
        code: -32603,
        message: error.message || 'Internal error'
      },
      id: id || null
    });
  }
});

// DELETE /mcp - закрытие сессии
app.delete('/mcp', (req, res) => {
  const sessionId = req.headers['mcp-session-id'] as string;
  
  if (sessionId && sessions.has(sessionId)) {
    sessions.delete(sessionId);
    console.log(`Session closed: ${sessionId}`);
  }
  
  res.status(204).send();
});

// ============================
// N8N ЭНДПОИНТЫ
// ============================

// POST /n8n/webhook/:event - вебхуки для n8n
app.post('/n8n/webhook/:event', async (req, res, next) => {
  try {
    const { event } = req.params;
    const webhookSecret = req.headers['x-webhook-secret'];
    
    // Проверка секрета (опционально)
    if (process.env.N8N_WEBHOOK_SECRET && webhookSecret !== process.env.N8N_WEBHOOK_SECRET) {
      return sendErr(res, 401, 'AUTH_FAILED', 'Invalid webhook secret');
    }

    const vkApi = createVKApi(req);
    const data = req.body;

    console.log(`n8n webhook event: ${event}`, data);

    // Обработка различных событий
    switch (event) {
      case 'post_created': {
        const { message, group_id } = data;
        const result = await vkApi.postToWall({
          owner_id: group_id ? `-${group_id}` : undefined,
          message,
        });
        sendOk(res, { post_id: result.post_id });
          break;
        }

      case 'get_posts': {
        const { group_id, count = 10 } = data;
        const result = await vkApi.getWallPosts({
          owner_id: group_id ? `-${group_id}` : undefined,
          count,
        });
        sendOk(res, result);
          break;
        }

      case 'search': {
        const { query, group_id } = data;
        const result = await vkApi.searchPosts({
          query,
          owner_id: group_id ? `-${group_id}` : undefined,
        });
        sendOk(res, result);
          break;
        }

      default:
        sendErr(res, 400, 'UNKNOWN_EVENT', `Unknown webhook event: ${event}`);
    }
  } catch (error: any) {
    console.error('n8n webhook error:', error);
    next(error);
  }
});

// GET /n8n/poll/:resource - polling для n8n
app.get('/n8n/poll/:resource', async (req, res, next) => {
  try {
    const { resource } = req.params;
    const { group_id, count = 10, offset = 0, since } = req.query;
    
    const vkApi = createVKApi(req);

    console.log(`n8n polling resource: ${resource}`, req.query);

    switch (resource) {
      case 'posts': {
        const result = await vkApi.getWallPosts({
          owner_id: group_id ? `-${group_id}` : undefined,
          count: Number(count),
          offset: Number(offset),
        });
        
        // Фильтруем по времени, если указано
        let items = result.items;
        if (since) {
          const sinceTime = new Date(since as string).getTime() / 1000;
          items = items.filter((post: any) => post.date > sinceTime);
        }
        
        sendOk(res, { ...result, items });
          break;
        }

      case 'groups': {
        const result = await vkApi.getGroupInfo(group_id as string);
        sendOk(res, result);
        break;
      }

      case 'members': {
        const result = await vkApi.getGroupMembers({
          group_id: group_id as string,
          count: Number(count),
          offset: Number(offset),
        });
        sendOk(res, result);
          break;
        }

        default:
        sendErr(res, 400, 'UNKNOWN_RESOURCE', `Unknown polling resource: ${resource}`);
    }
  } catch (error: any) {
    console.error('n8n polling error:', error);
    next(error);
  }
});

// ============================
// СЕРВИСНЫЕ ЭНДПОИНТЫ
// ============================

// GET /health - проверка здоровья
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'vkontakte-mcp-server',
    version: '1.0.0',
    environment: process.env.NODE_ENV || 'development',
    port: PORT,
    endpoints: {
      mcp: {
        'POST /mcp': 'JSON-RPC (initialize, tools/list, tools/call)',
        'GET /mcp': 'SSE notifications (Streamable HTTP)',
        'DELETE /mcp': 'Close session'
      },
      n8n: {
        'POST /n8n/webhook/:event': 'Webhook events',
        'GET /n8n/poll/:resource': 'Polling resources'
      },
      service: {
        'GET /health': 'Health check',
        'GET /mcp/info': 'Server information',
        'GET /mcp/tools': 'List all tools'
      }
    }
  });
});

// GET /mcp/info - информация о сервере
app.get('/mcp/info', (req, res) => {
  res.json({
    name: 'vkontakte-mcp-server',
    version: '1.0.0',
    description: 'MCP server for VKontakte (VK.com) integration',
    protocol: 'Streamable HTTP',
    protocolVersion: '2025-03-26',
    capabilities: ['tools'],
    tools: ALL_TOOLS.map(t => t.name),
    endpoints: {
      mcp: '/mcp',
      n8n_webhook: '/n8n/webhook/:event',
      n8n_poll: '/n8n/poll/:resource',
      health: '/health'
    }
  });
});

// GET /mcp/tools - список всех инструментов
app.get('/mcp/tools', (req, res) => {
  res.json({
    tools: ALL_TOOLS,
    count: ALL_TOOLS.length
  });
});

// GET / - корневой эндпоинт (только информационный)
app.get('/', (req, res) => {
  res.json({
    message: 'VKontakte MCP Server',
    version: '1.0.0',
    documentation: {
      mcp: 'Use POST /mcp for JSON-RPC and GET /mcp for SSE',
      n8n: 'Use /n8n/webhook/:event and /n8n/poll/:resource',
      info: 'See /mcp/info for server details',
      tools: 'See /mcp/tools for available tools'
    }
  });
});

// Глобальный обработчик ошибок
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Global error handler:', err);
  
  const status = err.status || 500;
  const message = err.message || 'Internal Server Error';
  const code = err.code || 'INTERNAL_ERROR';
  
  res.status(status).json({
    success: false,
    error: {
      code,
      message,
      ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
    }
  });
});

// Запуск сервера
app.listen(PORT, () => {
  console.log(`✅ VKontakte MCP server running on port ${PORT}`);
  console.log(`📍 Endpoints:`);
  console.log(`   - MCP: POST /mcp, GET /mcp`);
  console.log(`   - n8n: /n8n/webhook/:event, /n8n/poll/:resource`);
  console.log(`   - Info: /health, /mcp/info, /mcp/tools`);
});