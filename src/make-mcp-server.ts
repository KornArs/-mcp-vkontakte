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

// Полный список инструментов (17)
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
        },
        required: ['message'],
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
      },
    },
  ];

// Обработчик вызова инструментов
async function handleToolCall(vkApi: VKApi, name: string, args: any): Promise<any> {
      switch (name) {
        case 'post_to_wall': {
          const ownerId = args.group_id ? `-${args.group_id}` : args.user_id;
      const result = await vkApi.postToWall({
            owner_id: ownerId,
        message: args.message,
      });
      return {
        postId: result.post_id,
        message: 'Post created successfully',
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