import express from 'express';
import cors from 'cors';
import { VKApi } from './vk-api.js';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// CORS для Make.com
app.use(cors({
  origin: ['https://www.make.com', 'https://*.make.com'],
  credentials: true,
}));

app.use(express.json());

// Достаём VK access token из запроса или ENV
function extractAccessToken(req: express.Request): string | undefined {
  const headerAuth = req.headers['authorization'];
  if (typeof headerAuth === 'string' && headerAuth.toLowerCase().startsWith('bearer ')) {
    const token = headerAuth.slice(7).trim();
    if (token) return token;
  }

  const headerToken = req.headers['x-vk-access-token'] || req.headers['x-access-token'];
  if (typeof headerToken === 'string' && headerToken.trim()) {
    return headerToken.trim();
  }

  return process.env.VK_ACCESS_TOKEN;
}

// Создание VK API клиента
function createVKApi(req: express.Request) {
  const accessToken = extractAccessToken(req);
  const apiVersion = process.env.VK_API_VERSION || '5.131';

  if (!accessToken) {
    throw new Error('VK access token is required (Authorization: Bearer <token> or VK_ACCESS_TOKEN env)');
  }

  return new VKApi(accessToken, apiVersion);
}

// SSE endpoint для Make.com MCP Client
app.get('/mcp/sse', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': 'https://www.make.com',
    'Access-Control-Allow-Credentials': 'true',
  });

  // Отправляем информацию о доступных инструментах
  const tools = [
    {
      name: 'post_to_wall',
      description: 'Публикует пост на стену пользователя или группы ВКонтакте',
      inputSchema: {
        type: 'object',
        properties: {
          message: {
            type: 'string',
            description: 'Текст поста для публикации',
            required: true,
          },
          group_id: {
            type: 'string',
            description: 'ID группы (для публикации в группе)',
          },
          user_id: {
            type: 'string',
            description: 'ID пользователя (для публикации в профиле)',
          },
          attachments: {
            type: 'array',
            items: { type: 'string' },
            description: 'Массив вложений (ссылки на медиа)',
          },
          publish_date: {
            type: 'number',
            description: 'Время публикации (Unix timestamp)',
          },
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

  // Отправляем информацию о сервере
  res.write(`data: ${JSON.stringify({
    type: 'server_info',
    name: 'vkontakte-mcp-server',
    version: '1.0.0',
    description: 'MCP server for VKontakte (VK.com) integration',
    tools: tools.map(tool => tool.name),
  })}\n\n`);

  // Отправляем информацию об инструментах
  tools.forEach(tool => {
    res.write(`data: ${JSON.stringify({
      type: 'tool_info',
      tool: tool,
    })}\n\n`);
  });

  // Keep connection alive
  const interval = setInterval(() => {
    res.write('data: {"type": "ping"}\n\n');
  }, 30000);

  req.on('close', () => {
    clearInterval(interval);
  });
});

// MCP API endpoint для Make.com
app.post('/mcp/api', async (req, res) => {
  try {
    const { method, params, id } = req.body;
    
    if (method === 'callTool') {
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
            success: true,
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
            success: true,
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
            success: true,
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
            success: true,
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
            success: true,
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
            success: false,
            error: `Unknown tool: ${name}`
          });
          return;
      }
    } else {
      res.status(400).json({
        success: false,
        error: `Unknown method: ${method}`
      });
    }
  } catch (error) {
    console.error('Error in MCP API:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Неизвестная ошибка',
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
    }
  });
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
app.listen(PORT, () => {
  console.log(`🚀 VKontakte MCP Server для Make.com запущен на порту ${PORT}`);
  console.log(`📡 SSE endpoint: http://localhost:${PORT}/mcp/sse`);
  console.log(`🔧 API endpoint: http://localhost:${PORT}/mcp/api`);
  console.log(`🏥 Health check: http://localhost:${PORT}/health`);
  console.log(`ℹ️  MCP info: http://localhost:${PORT}/mcp/info`);
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
