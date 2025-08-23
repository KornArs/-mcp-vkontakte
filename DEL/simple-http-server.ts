import express from 'express';
import cors from 'cors';
import { VKApi } from './vk-api.js';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// CORS для браузерных клиентов
app.use(cors({
  origin: '*',
}));

app.use(express.json());

// Добавляем правильные заголовки для UTF-8
app.use((req, res, next) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Content-Encoding', 'utf-8');
  next();
});

// Создание VK API клиента
function createVKApi() {
  const accessToken = process.env.VK_ACCESS_TOKEN;
  const apiVersion = process.env.VK_API_VERSION || '5.131';

  if (!accessToken) {
    throw new Error('VK_ACCESS_TOKEN environment variable is required');
  }

  return new VKApi(accessToken, apiVersion);
}

// Тестовый endpoint для публикации поста
app.post('/test/post', async (req, res) => {
  try {
    const vkApi = createVKApi();
    const { message, group_id, user_id } = req.body;

    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    // Исправленная логика: приоритет группе
    let ownerId;
    if (group_id) {
      ownerId = `-${group_id}`; // Минус для группы
    } else if (user_id) {
      ownerId = user_id; // Прямой ID для пользователя
    } else {
      // Если ничего не указано, публикуем в группу по умолчанию
      ownerId = `-${process.env.VK_GROUP_ID}`;
    }

    console.log(`Публикация поста: owner_id = ${ownerId}, group_id = ${group_id}, user_id = ${user_id}`);
    console.log(`Текст поста (UTF-8): ${Buffer.from(message, 'utf8').toString('hex')}`);
    console.log(`Текст поста (длина): ${message.length} символов`);

    const result = await vkApi.postToWall({
      message,
      owner_id: ownerId,
    });

    res.json({
      success: true,
      message: 'Пост успешно опубликован!',
      post_id: result.post_id,
      owner_id: ownerId,
      target: group_id ? 'group' : 'user'
    });
  } catch (error) {
    console.error('Error posting to wall:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Неизвестная ошибка',
    });
  }
});

// Список MCP инструментов (для наглядной проверки соответствия)
app.get('/mcp/tools', (_req, res) => {
  res.json({
    tools: [
      'post_to_wall',
      'get_wall_posts',
      'search_posts',
      'get_group_info',
      'get_user_info',
      'get_post_stats',
      'get_wall_by_id',
      'get_comments',
      'create_comment',
      'delete_post',
      'edit_post',
      'add_like',
      'delete_like',
      'get_group_members',
      'resolve_screen_name',
      'upload_wall_photo_from_url',
      'upload_video_from_url'
    ]
  });
});

// Тестовый endpoint для получения постов
app.get('/test/posts', async (req, res) => {
  try {
    const vkApi = createVKApi();
    const { group_id, user_id, count = 5 } = req.query;

    const ownerId = group_id ? `-${group_id}` : user_id;
    const result = await vkApi.getWallPosts({
      owner_id: ownerId as string,
      count: Number(count),
      offset: 0,
    });

    res.json({
      success: true,
      count: result.count,
      posts: result.items.map(post => ({
        id: post.id,
        text: post.text.substring(0, 100) + (post.text.length > 100 ? '...' : ''),
        date: post.date,
        likes: post.likes?.count || 0,
        reposts: post.reposts?.count || 0,
        comments: post.comments?.count || 0,
      })),
    });
  } catch (error) {
    console.error('Error getting posts:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Неизвестная ошибка',
    });
  }
});

// Тестовый endpoint для получения информации о пользователе
app.get('/test/user/:user_id', async (req, res) => {
  try {
    const vkApi = createVKApi();
    const { user_id } = req.params;

    const result = await vkApi.getUserInfo(user_id);
    const user = result[0];

    res.json({
      success: true,
      user: {
        id: user.id,
        first_name: user.first_name,
        last_name: user.last_name,
        screen_name: user.screen_name,
        photo_100: user.photo_100,
      },
    });
  } catch (error) {
    console.error('Error getting user info:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Неизвестная ошибка',
    });
  }
});

// Статус сервера
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'VKontakte Test Server',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
  });
});

// Информация о сервере
app.get('/info', (req, res) => {
  res.json({
    name: 'vkontakte-test-server',
    version: '1.0.0',
    description: 'Simple test server for VKontakte API',
    endpoints: [
      'POST /test/post - Публикация поста',
      'GET /test/posts - Получение постов',
      'GET /test/user/:user_id - Информация о пользователе',
      'GET /health - Проверка состояния',
      'GET /info - Информация о сервере',
    ]
  });
});

// Запуск сервера
app.listen(PORT, () => {
  console.log(`🚀 VKontakte Test Server запущен на порту ${PORT}`);
  console.log(`🏥 Health check: http://localhost:${PORT}/health`);
  console.log(`ℹ️  Info: http://localhost:${PORT}/info`);
  console.log(`📝 Test post: POST http://localhost:${PORT}/test/post`);
  console.log(`📖 Test posts: GET http://localhost:${PORT}/test/posts`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('Получен SIGTERM, завершение работы...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('Получен SIGINT, завершение работы...');
  process.exit(0);
});
