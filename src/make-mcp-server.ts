import express from 'express';
import cors from 'cors';
import { VKApi } from './vk-api.js';

const app = express();
const PORT = process.env.PORT || 3000;

// Логируем переменные окружения для отладки Railway
console.log('🔧 Environment variables:');
console.log('  PORT:', process.env.PORT);
console.log('  NODE_ENV:', process.env.NODE_ENV);
console.log('  Using PORT:', PORT);

// CORS для всех клиентов (Make, Cursor, LLM)
app.use(cors({
  origin: (_origin, callback) => callback(null, true),
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization', 'x-vk-access-token', 'mcp-session-id'],
}));

app.use(express.json());

// Разрешаем preflight для всех маршрутов (см. Express CORS docs)
app.options('*', cors());

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
  const apiVersion = '5.199'; // Захардкоженная версия API

  return new VKApi(accessToken, apiVersion);
}

// Унифицированные ответы для REST (n8n)
function sendOk(res: express.Response, data: unknown) {
  res.json({ success: true, data });
}

function sendErr(res: express.Response, httpStatus: number, code: string | number, message: string) {
  res.status(httpStatus).json({ success: false, error: { code, message } });
}

// MCP SSE endpoint для Make.com
app.get('/mcp/sse', (req, res) => {
  console.log('Client connected to SSE');
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  // Отправляем информацию о сервере в JSON-RPC формате
  res.write(`data: ${JSON.stringify({
    jsonrpc: '2.0',
    id: null, // Для уведомлений id может быть null
    method: 'notifications/serverInfo',
    params: {
      name: 'vkontakte-mcp-server',
      version: '1.0.0',
      description: 'MCP server for VKontakte (VK.com) integration',
      transport: 'SSE + HTTP',
      capabilities: ['tools']
    }
  })}\n\n`);

  // Отправляем информацию об инструментах в JSON-RPC формате
  const tools = [
    {
      name: 'post_to_wall',
      description: 'Публикует пост на стену пользователя или группы ВКонтакте',
      inputSchema: {
        type: 'object',
        properties: {
          message: { type: 'string', description: 'Текст поста' },
          group_id: { type: 'string', description: 'ID группы' },
          user_id: { type: 'string', description: 'ID пользователя' },
          attachments: { type: 'array', items: { type: 'string' }, description: 'Массив вложений (ссылки на медиа)' },
          publish_date: { type: 'number', description: 'Время публикации (Unix timestamp)' }
        },
        required: ['message'],
      },
    },
    {
      name: 'get_wall_posts',
      description: 'Получает посты со стены пользователя или группы',
      inputSchema: {
        type: 'object',
        properties: {
          group_id: {
            type: 'string',
            description: 'ID группы',
          },
          user_id: {
            type: 'string',
            description: 'ID пользователя',
          },
          count: {
            type: 'number',
            description: 'Количество постов для получения (по умолчанию 20)',
            default: 20,
          },
          offset: {
            type: 'number',
            description: 'Смещение от начала (по умолчанию 0)',
            default: 0,
          },
        },
      },
    },
    {
      name: 'search_posts',
      description: 'Ищет посты по ключевому слову',
      inputSchema: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Поисковый запрос',
            required: true,
          },
          group_id: {
            type: 'string',
            description: 'ID группы для поиска',
          },
          count: {
            type: 'number',
            description: 'Количество результатов',
            default: 20,
          },
          offset: {
            type: 'number',
            description: 'Смещение от начала',
            default: 0,
          },
        },
        required: ['query'],
      },
    },
    {
      name: 'get_group_info',
      description: 'Получает информацию о группе ВКонтакте',
      inputSchema: {
        type: 'object',
        properties: {
          group_id: {
            type: 'string',
            description: 'ID группы',
            required: true,
          },
        },
        required: ['group_id'],
      },
    },
    {
      name: 'get_user_info',
      description: 'Получает информацию о пользователе ВКонтакте',
      inputSchema: {
        type: 'object',
        properties: {
          user_id: {
            type: 'string',
            description: 'ID пользователя',
            required: true,
          },
        },
        required: ['user_id'],
      },
    },
  ];

  tools.forEach(tool => {
    res.write(`data: ${JSON.stringify({
      jsonrpc: '2.0',
      id: null, // Для уведомлений id может быть null
      method: 'notifications/toolInfo',
      params: {
        tool: tool
      }
    })}\n\n`);
  });

  // Keepalive пинги каждые 30 секунд
  const keepalive = setInterval(() => {
    res.write(':keepalive\n\n');
  }, 30000);

  req.on('close', () => {
    clearInterval(keepalive);
    console.log('Client disconnected from SSE');
  });
});

// POST обработчик для /mcp/sse (Make.com сначала делает POST)
app.post('/mcp/sse', async (req, res) => {
  const { id, method } = req.body || {};
  console.log(`POST /mcp/sse - method: ${method}`);
  
  if (method === 'initialize') {
    res.json({
      jsonrpc: '2.0',
      id,
      result: {
        protocolVersion: '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: { name: 'vkontakte-mcp-server', version: '1.0.0' }
      }
    });
  } else {
    res.json({ jsonrpc: '2.0', id, result: {} });
  }
});

// SSE алиас для совместимости с HTTP MCP клиентами (Cursor ожидает /sse)
app.get('/sse', (req, res) => {
  console.log('Client connected to SSE (alias /sse)');
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  res.write(`data: ${JSON.stringify({
    jsonrpc: '2.0',
    id: null,
    method: 'notifications/serverInfo',
    params: {
      name: 'vkontakte-mcp-server',
      version: '1.0.0',
      description: 'MCP server for VKontakte (VK.com) integration',
      transport: 'SSE + HTTP',
      capabilities: ['tools']
    }
  })}\n\n`);

  const tools = [
    {
      name: 'post_to_wall',
      description: 'Публикует пост на стену пользователя или группы ВКонтакте',
      inputSchema: {
        type: 'object',
        properties: {
          message: { type: 'string', description: 'Текст поста' },
          group_id: { type: 'string', description: 'ID группы' },
          user_id: { type: 'string', description: 'ID пользователя' },
          attachments: { type: 'array', items: { type: 'string' }, description: 'Массив вложений (ссылки на медиа)' },
          publish_date: { type: 'number', description: 'Время публикации (Unix timestamp)' }
        },
        required: ['message'],
      },
    },
    {
      name: 'get_wall_posts',
      description: 'Получает посты со стены пользователя или группы',
      inputSchema: {
        type: 'object',
        properties: {
          group_id: {
            type: 'string',
            description: 'ID группы',
          },
          user_id: {
            type: 'string',
            description: 'ID пользователя',
          },
          count: {
            type: 'number',
            description: 'Количество постов для получения (по умолчанию 20)',
            default: 20,
          },
          offset: {
            type: 'number',
            description: 'Смещение от начала (по умолчанию 0)',
            default: 0,
          },
        },
      },
    },
    {
      name: 'search_posts',
      description: 'Ищет посты по ключевому слову',
      inputSchema: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Поисковый запрос',
            required: true,
          },
          group_id: {
            type: 'string',
            description: 'ID группы для поиска',
          },
          count: {
            type: 'number',
            description: 'Количество результатов',
            default: 20,
          },
          offset: {
            type: 'number',
            description: 'Смещение от начала',
            default: 0,
          },
        },
        required: ['query'],
      },
    },
    {
      name: 'get_group_info',
      description: 'Получает информацию о группе ВКонтакте',
      inputSchema: {
        type: 'object',
        properties: {
          group_id: {
            type: 'string',
            description: 'ID группы',
            required: true,
          },
        },
        required: ['group_id'],
      },
    },
    {
      name: 'get_user_info',
      description: 'Получает информацию о пользователе ВКонтакте',
      inputSchema: {
        type: 'object',
        properties: {
          user_id: {
            type: 'string',
            description: 'ID пользователя',
            required: true,
          },
        },
        required: ['user_id'],
      },
    },
  ];

  tools.forEach(tool => {
    res.write(`data: ${JSON.stringify({
      jsonrpc: '2.0',
      id: null,
      method: 'notifications/toolInfo',
      params: {
        tool: tool
      }
    })}\n\n`);
  });

  // Keepalive пинги каждые 30 секунд
  const keepalive = setInterval(() => {
    res.write(':keepalive\n\n');
  }, 30000);

  req.on('close', () => {
    clearInterval(keepalive);
    console.log('Client disconnected from SSE (alias /sse)');
  });
});

// POST обработчик для /sse (Make.com)
app.post('/sse', async (req, res) => {
  const { id, method } = req.body || {};
  console.log(`POST /sse - method: ${method}`);
  
  if (method === 'initialize') {
    res.json({
      jsonrpc: '2.0',
      id,
      result: {
        protocolVersion: '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: { name: 'vkontakte-mcp-server', version: '1.0.0' }
      }
    });
  } else {
    res.json({ jsonrpc: '2.0', id, result: {} });
  }
});

// ========== n8n INTEGRATION ==========
// Webhook endpoint для n8n триггеров/действий
app.post('/n8n/webhook/:event', async (req, res, next) => {
  try {
    const secret = process.env.N8N_WEBHOOK_SECRET;
    const provided = (req.headers['x-n8n-token'] as string) || (req.query['token'] as string) || '';
    if (secret && provided !== secret) {
      return sendErr(res, 401, 'unauthorized', 'Invalid n8n webhook token');
    }

    const event = String(req.params.event || '').trim();

    let vkApi: VKApi;
    try {
      vkApi = createVKApi(req);
    } catch (err) {
      return sendErr(res, 401, 'auth_failed', err instanceof Error ? err.message : 'Authentication failed');
    }

    const body: any = req.body || {};

    switch (event) {
      case 'post_to_wall': {
        const ownerId = body.group_id ? `-${body.group_id}` : body.user_id;

        // Поддержка media_urls как в JSON-RPC
        let attachments: string[] | undefined = body.attachments;
        const mediaUrls: string[] = [];
        if (typeof body.media_urls === 'string') mediaUrls.push(body.media_urls);
        else if (Array.isArray(body.media_urls)) mediaUrls.push(...body.media_urls);

        if (mediaUrls.length > 0) {
          const uploaded: string[] = [];
          for (const url of mediaUrls) {
            const lower = String(url).toLowerCase();
            if (lower.includes('.mp4') || lower.includes('video')) {
              const a = await vkApi.uploadVideoFromUrl({ videoUrl: url, owner_id: ownerId });
              uploaded.push(a);
            } else {
              const a = await vkApi.uploadWallPhotoFromUrl({ imageUrl: url, owner_id: ownerId });
              uploaded.push(a);
            }
          }
          attachments = [...(attachments || []), ...uploaded];
        }

        const result = await vkApi.postToWall({
          message: body.message,
          owner_id: ownerId,
          attachments,
          publish_date: body.publish_date,
        });
        return sendOk(res, { post_id: result.post_id, owner_id: ownerId });
      }

      case 'get_wall_posts': {
        const ownerId = body.group_id ? `-${body.group_id}` : body.user_id;
        const result = await vkApi.getWallPosts({ owner_id: ownerId, count: body.count || 20, offset: body.offset || 0 });
        return sendOk(res, {
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
      }

      case 'search_posts': {
        const ownerId = body.group_id ? `-${body.group_id}` : undefined;
        const result = await vkApi.searchPosts({ query: body.query, owner_id: ownerId, count: body.count || 20, offset: body.offset || 0 });
        return sendOk(res, {
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
      }

      case 'get_group_info': {
        const result = await vkApi.getGroupInfo(body.group_id);
        const group = result && result[0];
        if (!group) return sendErr(res, 404, 'not_found', 'Group not found');
        return sendOk(res, {
          id: group.id,
          name: group.name,
          screen_name: group.screen_name,
          type: group.type,
          members_count: group.members_count,
        });
      }

      case 'get_user_info': {
        const result = await vkApi.getUserInfo(body.user_id);
        const user = result && result[0];
        if (!user) return sendErr(res, 404, 'not_found', 'User not found');
        return sendOk(res, {
          id: user.id,
          first_name: user.first_name,
          last_name: user.last_name,
          screen_name: user.screen_name,
          photo_100: user.photo_100,
        });
      }

      default:
        return sendErr(res, 400, 'unknown_event', `Unknown event: ${event}`);
    }
  } catch (err) {
    next(err);
  }
});

// Polling endpoint для n8n
app.get('/n8n/poll/:resource', async (req, res, next) => {
  try {
    let vkApi: VKApi;
    try {
      vkApi = createVKApi(req);
    } catch (err) {
      return sendErr(res, 401, 'auth_failed', err instanceof Error ? err.message : 'Authentication failed');
    }

    const resource = String(req.params.resource || '').trim();
    const q = req.query as any;

    switch (resource) {
      case 'wall_posts': {
        const ownerId = q.group_id ? `-${q.group_id}` : q.user_id;
        const result = await vkApi.getWallPosts({ owner_id: ownerId, count: Number(q.count ?? 20), offset: Number(q.offset ?? 0) });
        return sendOk(res, {
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
      }
      case 'search_posts': {
        const ownerId = q.group_id ? `-${q.group_id}` : undefined;
        const result = await vkApi.searchPosts({ query: String(q.query || ''), owner_id: ownerId, count: Number(q.count ?? 20), offset: Number(q.offset ?? 0) });
        return sendOk(res, {
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
      }
      default:
        return sendErr(res, 400, 'unknown_resource', `Unknown resource: ${resource}`);
    }
  } catch (err) {
    next(err);
  }
});

// MCP API endpoint для Make.com - JSON-RPC 2.0
app.post('/mcp/api', async (req, res) => {
  try {
    const { method, params, id } = req.body;
    
    console.log('Incoming POST /mcp/api request.');
    console.log('  Method:', method);
    console.log('  Request ID:', id);
    // Не логируем все заголовки целиком во избежание утечек токенов

    if (method === 'tools/call') {
      const { name, arguments: args } = params;
      let vkApi;
      try {
        vkApi = createVKApi(req);
        console.log('VK API client created successfully.');
      } catch (tokenError) {
        console.error('Error creating VK API client:', tokenError); // Логируем ошибку создания клиента
        res.status(401).json({
          jsonrpc: '2.0',
          id: id,
          error: {
            code: -32000, // Invalid Request
            message: `Authentication failed: ${tokenError instanceof Error ? tokenError.message : 'Unknown error'}`,
          }
        });
        return;
      }

      let result;
      switch (name) {
        case 'post_to_wall': {
          const ownerId = args.group_id ? `-${args.group_id}` : args.user_id;

          // Обрабатываем media_urls: string | string[]
          let attachments: string[] | undefined = args.attachments;
          const mediaUrls: string[] = [];
          if (typeof args.media_urls === 'string') mediaUrls.push(args.media_urls);
          else if (Array.isArray(args.media_urls)) mediaUrls.push(...args.media_urls);

          if (mediaUrls.length > 0) {
            const uploaded: string[] = [];
            for (const url of mediaUrls) {
              const lower = String(url).toLowerCase();
              if (lower.includes('.mp4') || lower.includes('video')) {
                const a = await vkApi.uploadVideoFromUrl({ videoUrl: url, owner_id: ownerId });
                uploaded.push(a);
              } else {
                const a = await vkApi.uploadWallPhotoFromUrl({ imageUrl: url, owner_id: ownerId });
                uploaded.push(a);
              }
            }
            attachments = [...(attachments || []), ...uploaded];
          }

          result = await vkApi.postToWall({
            message: args.message,
            owner_id: ownerId,
            attachments,
            publish_date: args.publish_date,
          });
          
          res.json({
            jsonrpc: '2.0',
            id: id,
            result: {
              post_id: result.post_id,
              message: 'Пост успешно опубликован!',
              owner_id: ownerId,
              target: args.group_id ? 'group' : 'user'
            }
          });
          break;
        }

        case 'get_wall_posts': {
          const ownerId = args.group_id ? `-${args.group_id}` : args.user_id;
          result = await vkApi.getWallPosts({
            owner_id: ownerId,
            count: args.count || 20,
            offset: args.offset || 0,
          });
          
          res.json({
            jsonrpc: '2.0',
            id: id,
            result: {
              count: result.count,
              posts: result.items.map(post => ({
                id: post.id,
                text: post.text.substring(0, 100) + (post.text.length > 100 ? '...' : ''),
                date: post.date,
                likes: post.likes?.count || 0,
                reposts: post.reposts?.count || 0,
                comments: post.comments?.count || 0,
              }))
            }
          });
          break;
        }

        case 'search_posts': {
          const ownerId = args.group_id ? `-${args.group_id}` : undefined;
          result = await vkApi.searchPosts({
            query: args.query,
            owner_id: ownerId,
            count: args.count || 20,
            offset: args.offset || 0,
          });
          
          res.json({
            jsonrpc: '2.0',
            id: id,
            result: {
              count: result.count,
              posts: result.items.map(post => ({
                id: post.id,
                text: post.text.substring(0, 100) + (post.text.length > 100 ? '...' : ''),
                date: post.date,
                likes: post.likes?.count || 0,
                reposts: post.reposts?.count || 0,
                comments: post.comments?.count || 0,
              }))
            }
          });
          break;
        }

        case 'get_group_info': {
          result = await vkApi.getGroupInfo(args.group_id);
          const group = result && result[0];
          
          if (!group) {
            res.status(404).json({
              jsonrpc: '2.0',
              id: id,
              error: {
                code: -32602,
                message: 'Group not found'
              }
            });
            return;
          }
          
          res.json({
            jsonrpc: '2.0',
            id: id,
            result: {
              id: group.id,
              name: group.name,
              screen_name: group.screen_name,
              type: group.type,
              members_count: group.members_count,
            }
          });
          break;
        }

        case 'get_user_info': {
          result = await vkApi.getUserInfo(args.user_id);
          const user = result && result[0];
          
          if (!user) {
            res.status(404).json({
              jsonrpc: '2.0',
              id: id,
              error: {
                code: -32602,
                message: 'User not found'
              }
            });
            return;
          }
          
          res.json({
            jsonrpc: '2.0',
            id: id,
            result: {
              id: user.id,
              first_name: user.first_name,
              last_name: user.last_name,
              screen_name: user.screen_name,
              photo_100: user.photo_100,
            }
          });
          break;
        }

        default:
          res.status(400).json({
            jsonrpc: '2.0',
            id: id,
            error: {
              code: -32601,
              message: `Unknown tool: ${name}`
            }
          });
          return;
      }
    } else {
      res.status(400).json({
        jsonrpc: '2.0',
        id: id,
        error: {
          code: -32601,
          message: `Unknown method: ${method}`
        }
      });
    }
  } catch (error) {
    console.error('Error in MCP API:', error);
    res.status(500).json({
      jsonrpc: '2.0',
      id: req.body.id,
      error: {
        code: -32603,
        message: error instanceof Error ? error.message : 'Неизвестная ошибка'
      }
    });
  }
});

// Health check для Make.com
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'VKontakte MCP Server for Make.com',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    mcp_endpoints: {
      sse: '/mcp/sse',
      api: '/mcp/api',
    },
    n8n_endpoints: {
      webhook: '/n8n/webhook/:event',
      poll: '/n8n/poll/:resource'
    },
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    port: PORT
  });
});

// Startup probe для Railway
app.get('/', (req, res) => {
  const accept = String(req.headers['accept'] || '');
  if (accept.includes('text/event-stream')) {
    console.log('Client connected to SSE (root /)');
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    res.write(`data: ${JSON.stringify({
      jsonrpc: '2.0',
      id: null,
      method: 'notifications/serverInfo',
      params: {
        name: 'vkontakte-mcp-server',
        version: '1.0.0',
        description: 'MCP server for VKontakte (VK.com) integration',
        transport: 'SSE + HTTP',
        capabilities: ['tools']
      }
    })}\n\n`);

    const tools = [
      { name: 'post_to_wall' },
      { name: 'get_wall_posts' },
      { name: 'search_posts' },
      { name: 'get_group_info' },
      { name: 'get_user_info' },
    ];
    tools.forEach(tool => {
      res.write(`data: ${JSON.stringify({
        jsonrpc: '2.0',
        id: null,
        method: 'notifications/toolInfo',
        params: { tool }
      })}\n\n`);
    });

    // Keepalive пинги каждые 30 секунд
    const keepalive = setInterval(() => {
      res.write(':keepalive\n\n');
    }, 30000);

    req.on('close', () => {
      clearInterval(keepalive);
      console.log('Client disconnected from SSE (root /)');
    });
    return;
  }

  res.json({
    status: 'ready',
    message: 'VKontakte MCP Server is running',
    timestamp: new Date().toISOString(),
    port: PORT
  });
});

// MCP Discovery endpoint для Make.com (корневой путь) - JSON-RPC 2.0
app.post('/', async (req, res) => {
  const { id, method, params } = req.body;

  console.log(`Incoming POST / request. Method: ${method}`); // Добавлено логирование

  if (method === 'initialize') {
    res.json({
      jsonrpc: '2.0',
      id: id,
      result: {
        protocolVersion: '2024-11-05',
        capabilities: {
          tools: {}
        },
        serverInfo: {
          name: 'vkontakte-mcp-server',
          version: '1.0.0'
        }
      }
    });
  } else if (method === 'tools/list') {
    res.json({
      jsonrpc: '2.0',
      id: id,
      result: {
        tools: [
          {
            name: 'post_to_wall',
            description: 'Публикует пост на стену пользователя или группы ВКонтакте',
            inputSchema: {
              type: 'object',
              properties: {
                message: { type: 'string', description: 'Текст поста' },
                group_id: { type: 'string', description: 'ID группы' },
                user_id: { type: 'string', description: 'ID пользователя' }
              },
              required: ['message']
            }
          },
          {
            name: 'get_wall_posts',
            description: 'Получает посты со стены',
            inputSchema: {
              type: 'object',
              properties: {
                group_id: { type: 'string' },
                user_id: { type: 'string' },
                count: { type: 'number', default: 20 },
                offset: { type: 'number', default: 0 }
              }
            }
          },
          {
            name: 'search_posts',
            description: 'Ищет посты по ключевому слову',
            inputSchema: {
              type: 'object',
              properties: {
                query: { type: 'string', description: 'Поисковый запрос' },
                group_id: { type: 'string' },
                count: { type: 'number', default: 20 },
                offset: { type: 'number', default: 0 }
              },
              required: ['query']
            }
          },
          {
            name: 'get_group_info',
            description: 'Получает информацию о группе',
            inputSchema: {
              type: 'object',
              properties: {
                group_id: { type: 'string', description: 'ID группы' }
              },
              required: ['group_id']
            }
          },
          {
            name: 'get_user_info',
            description: 'Получает информацию о пользователе',
            inputSchema: {
              type: 'object',
              properties: {
                user_id: { type: 'string', description: 'ID пользователя' }
              },
              required: ['user_id']
            }
          }
        ]
      }
    });
  } else if (method === 'notifications/initialized') {
    // Make.com отправляет это как уведомление, ответ не требуется, но отправим успешный
    res.json({
      jsonrpc: '2.0',
      id: id,
      result: {}
    });
  } else if (method === 'tools/call') {
    try {
      const { name, arguments: args } = params || {};
      let vkApi;
      try {
        vkApi = createVKApi(req);
        console.log('VK API client created successfully (root /).');
      } catch (tokenError) {
        console.error('Error creating VK API client:', tokenError);
        res.status(401).json({
          jsonrpc: '2.0',
          id,
          error: { code: -32000, message: `Authentication failed: ${tokenError instanceof Error ? tokenError.message : 'Unknown error'}` }
        });
        return;
      }

      let result;
      switch (name) {
        case 'post_to_wall': {
          const ownerId = args.group_id ? `-${args.group_id}` : args.user_id;
          result = await vkApi.postToWall({
            message: args.message,
            owner_id: ownerId,
            attachments: args.attachments,
            publish_date: args.publish_date,
          });
          res.json({ jsonrpc: '2.0', id, result: { post_id: result.post_id, message: 'Пост успешно опубликован!', owner_id: ownerId, target: args.group_id ? 'group' : 'user' } });
          break;
        }
        case 'get_wall_posts': {
          const ownerId = args.group_id ? `-${args.group_id}` : args.user_id;
          result = await vkApi.getWallPosts({ owner_id: ownerId, count: args.count || 20, offset: args.offset || 0 });
          res.json({ jsonrpc: '2.0', id, result: { count: result.count, posts: result.items.map(post => ({ id: post.id, text: post.text.substring(0, 100) + (post.text.length > 100 ? '...' : ''), date: post.date, likes: post.likes?.count || 0, reposts: post.reposts?.count || 0, comments: post.comments?.count || 0 })) } });
          break;
        }
        case 'search_posts': {
          const ownerId = args.group_id ? `-${args.group_id}` : undefined;
          result = await vkApi.searchPosts({ query: args.query, owner_id: ownerId, count: args.count || 20, offset: args.offset || 0 });
          res.json({ jsonrpc: '2.0', id, result: { count: result.count, posts: result.items.map(post => ({ id: post.id, text: post.text.substring(0, 100) + (post.text.length > 100 ? '...' : ''), date: post.date, likes: post.likes?.count || 0, reposts: post.reposts?.count || 0, comments: post.comments?.count || 0 })) } });
          break;
        }
        case 'get_group_info': {
          result = await vkApi.getGroupInfo(args.group_id);
          const group = result && result[0];
          if (!group) {
            res.status(404).json({ jsonrpc: '2.0', id, error: { code: -32602, message: 'Group not found' } });
            return;
          }
          res.json({ jsonrpc: '2.0', id, result: { id: group.id, name: group.name, screen_name: group.screen_name, type: group.type, members_count: group.members_count } });
          break;
        }
        case 'get_user_info': {
          result = await vkApi.getUserInfo(args.user_id);
          const user = result && result[0];
          if (!user) {
            res.status(404).json({ jsonrpc: '2.0', id, error: { code: -32602, message: 'User not found' } });
            return;
          }
          res.json({ jsonrpc: '2.0', id, result: { id: user.id, first_name: user.first_name, last_name: user.last_name, screen_name: user.screen_name, photo_100: user.photo_100 } });
          break;
        }
        default:
          res.status(400).json({ jsonrpc: '2.0', id, error: { code: -32601, message: `Unknown tool: ${name}` } });
          return;
      }
    } catch (error) {
      console.error('Error in root tools/call:', error);
      res.status(500).json({ jsonrpc: '2.0', id, error: { code: -32603, message: error instanceof Error ? error.message : 'Неизвестная ошибка' } });
    }
  } else {
    res.status(400).json({
      jsonrpc: '2.0',
      id: id,
      error: {
        code: -32601,
        message: 'Method not found'
      }
    });
  }
});

// Информация о MCP сервере
app.get('/mcp/info', (req, res) => {
  res.json({
    name: 'vkontakte-mcp-server',
    version: '1.0.0',
    description: 'MCP server for VKontakte (VK.com) integration',
    transport: 'SSE + HTTP',
    capabilities: ['tools'],
    tools: [
      'post_to_wall',
      'get_wall_posts',
      'search_posts',
      'get_group_info',
      'get_user_info'
    ],
    make_com_integration: {
      sse_endpoint: '/mcp/sse',
      api_endpoint: '/mcp/api',
      oauth_redirect: 'https://www.make.com/oauth/cb/mcp'
    },
    n8n_integration: {
      webhook_endpoint: '/n8n/webhook/:event',
      poll_endpoint: '/n8n/poll/:resource'
    }
  });
});

// Глобальный обработчик ошибок (последним, см. Express error-handling docs)
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Unhandled error:', err);
  // Для n8n REST маршрутов возвращаем унифицированный формат, иначе обычный JSON
  if (res.headersSent) return;
  const wantsRest = _req.path.startsWith('/n8n/');
  if (wantsRest) {
    return sendErr(res, Number(err?.status || 500), 'internal_error', err instanceof Error ? err.message : 'Internal Server Error');
  }
  res.status(Number(err?.status || 500)).json({ error: err instanceof Error ? err.message : 'Internal Server Error' });
});

// Запуск сервера
app.listen(Number(PORT), '0.0.0.0', () => {
  console.log(`🚀 VKontakte MCP Server для Make.com запущен на порту ${PORT}`);
  console.log(`📡 SSE endpoint: http://0.0.0.0:${PORT}/mcp/sse`);
  console.log(`🔧 API endpoint: http://0.0.0.0:${PORT}/mcp/api`);
  console.log(`🏥 Health check: http://0.0.0.0:${PORT}/health`);
  console.log(`ℹ️  MCP info: http://0.0.0.0:${PORT}/mcp/info`);
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
