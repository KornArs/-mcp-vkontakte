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

// CORS для Make.com
app.use(cors({
  origin: ['https://www.make.com', 'https://*.make.com'],
  credentials: true,
}));

app.use(express.json());

// Достаём VK access token из заголовка запроса
function extractAccessToken(req: express.Request): string {
  const headerAuth = req.headers['authorization'];
  if (typeof headerAuth === 'string' && headerAuth.toLowerCase().startsWith('bearer ')) {
    const token = headerAuth.slice(7).trim();
    if (token) return token;
  }

  const headerToken = req.headers['x-vk-access-token'] || req.headers['x-access-token'];
  if (typeof headerToken === 'string' && headerToken.trim()) {
    return headerToken.trim();
  }

  throw new Error('VK access token required in Authorization header (Bearer <token>)');
}

// Создание VK API клиента
function createVKApi(req: express.Request) {
  const accessToken = extractAccessToken(req);
  const apiVersion = '5.199'; // Захардкоженная версия API

  return new VKApi(accessToken, apiVersion);
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

  req.on('close', () => {
    console.log('Client disconnected from SSE');
  });
});

// MCP API endpoint для Make.com - JSON-RPC 2.0
app.post('/mcp/api', async (req, res) => {
  try {
    const { method, params, id } = req.body;
    
    if (method === 'tools/call') {
      const { name, arguments: args } = params;
      const vkApi = createVKApi(req);

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
          const group = result[0];
          
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
          const user = result[0];
          
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
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    port: PORT
  });
});

// Startup probe для Railway
app.get('/', (req, res) => {
  res.json({
    status: 'ready',
    message: 'VKontakte MCP Server is running',
    timestamp: new Date().toISOString(),
    port: PORT
  });
});

// MCP Discovery endpoint для Make.com (корневой путь) - JSON-RPC 2.0
app.post('/', (req, res) => {
  const { id, method } = req.body;

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
    }
  });
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
