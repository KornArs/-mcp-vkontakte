import express from 'express';
import cors from 'cors';
import { randomUUID } from 'node:crypto';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';
import { VKApi } from './vk-api.js';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// CORS для браузерных клиентов
app.use(cors({
  origin: '*',
  exposedHeaders: ['Mcp-Session-Id'],
  allowedHeaders: ['Content-Type', 'mcp-session-id'],
}));

app.use(express.json());

// Создание MCP сервера
function createMCPServer() {
  const accessToken = process.env.VK_ACCESS_TOKEN;
  const apiVersion = process.env.VK_API_VERSION || '5.131';

  if (!accessToken) {
    throw new Error('VK_ACCESS_TOKEN environment variable is required');
  }

  const vkApi = new VKApi(accessToken, apiVersion);
  
  const server = new Server(
    {
      name: 'vkontakte-mcp-server',
      version: '1.0.0',
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // Регистрация инструментов
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: [
        {
          name: 'post_to_wall',
          description: 'Публикует пост на стену пользователя или группы ВКонтакте',
          inputSchema: {
            type: 'object',
            properties: {
              message: {
                type: 'string',
                description: 'Текст поста для публикации',
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
              },
              offset: {
                type: 'number',
                description: 'Смещение от начала (по умолчанию 0)',
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
              },
              group_id: {
                type: 'string',
                description: 'ID группы для поиска',
              },
              count: {
                type: 'number',
                description: 'Количество результатов',
              },
              offset: {
                type: 'number',
                description: 'Смещение от начала',
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
              },
            },
            required: ['user_id'],
          },
        },
      ],
    };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      switch (name) {
        case 'post_to_wall': {
          const ownerId = args.group_id ? `-${args.group_id}` : args.user_id;
          const result = await vkApi.postToWall({
            message: args.message,
            owner_id: ownerId,
            attachments: args.attachments,
            publish_date: args.publish_date,
          });
          return {
            content: [
              {
                type: 'text',
                text: `Пост успешно опубликован! ID поста: ${result.post_id}`,
              },
            ],
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
            content: [
              {
                type: 'text',
                text: `Найдено постов: ${result.count}\n\n${result.items
                  .map(
                    (post) =>
                      `📝 ${post.text.substring(0, 100)}${
                        post.text.length > 100 ? '...' : ''
                      }\n❤️ ${post.likes?.count || 0} | 🔄 ${post.reposts?.count || 0} | 💬 ${
                        post.comments?.count || 0
                      }\n`
                  )
                  .join('\n')}`,
              },
            ],
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
            content: [
              {
                type: 'text',
                text: `Поиск по запросу "${args.query}"\nНайдено постов: ${result.count}\n\n${result.items
                  .map(
                    (post) =>
                      `🔍 ${post.text.substring(0, 100)}${
                        post.text.length > 100 ? '...' : ''
                      }\n❤️ ${post.likes?.count || 0} | 🔄 ${post.reposts?.count || 0} | 💬 ${
                        post.comments?.count || 0
                      }\n`
                  )
                  .join('\n')}`,
              },
            ],
          };
        }

        case 'get_group_info': {
          const result = await vkApi.getGroupInfo(args.group_id);
          const group = result[0];
          return {
            content: [
              {
                type: 'text',
                text: `📊 Информация о группе:\nНазвание: ${group.name}\nID: ${group.id}\nТип: ${group.type}\nУчастников: ${group.members_count}`,
              },
            ],
          };
        }

        case 'get_user_info': {
          const result = await vkApi.getUserInfo(args.user_id);
          const user = result[0];
          return {
            content: [
              {
                type: 'text',
                text: `👤 Информация о пользователе:\nИмя: ${user.first_name} ${user.last_name}\nID: ${user.id}\nUsername: ${user.screen_name}`,
              },
            ],
          };
        }

        default:
          throw new Error(`Unknown tool: ${name}`);
      }
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `❌ Ошибка: ${error instanceof Error ? error.message : 'Неизвестная ошибка'}`,
          },
        ],
        isError: true,
      };
    }
  });

  return server;
}

// Обработка MCP запросов
app.all('/mcp', async (req, res) => {
  try {
    const server = createMCPServer();
    const transport = new StdioServerTransport();
    await server.connect(transport);

    // Простая обработка JSON-RPC запросов
    if (req.method === 'POST' && req.body) {
      const { method, params, id } = req.body;
      
      if (method === 'callTool') {
        const result = await server.handleRequest({
          jsonrpc: '2.0',
          method: 'callTool',
          params: { name: params.name, arguments: params.arguments },
          id
        });
        
        res.json({
          jsonrpc: '2.0',
          result,
          id
        });
      } else {
        res.json({
          jsonrpc: '2.0',
          error: { code: -32601, message: 'Method not found' },
          id
        });
      }
    } else {
      res.json({
        jsonrpc: '2.0',
        error: { code: -32600, message: 'Invalid Request' },
        id: null
      });
    }
  } catch (error) {
    console.error('Error handling MCP request:', error);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: '2.0',
        error: {
          code: -32603,
          message: 'Internal server error',
        },
        id: null,
      });
    }
  }
});

// Статус сервера
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'VKontakte MCP Server',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
  });
});

// Информация о MCP сервере
app.get('/mcp-info', (req, res) => {
  res.json({
    name: 'vkontakte-mcp-server',
    version: '1.0.0',
    description: 'MCP server for VKontakte (VK.com) integration',
    transports: ['HTTP'],
    capabilities: ['tools'],
    tools: [
      'post_to_wall',
      'get_wall_posts', 
      'search_posts',
      'get_group_info',
      'get_user_info'
    ]
  });
});

// Запуск сервера
app.listen(PORT, () => {
  console.log(`🚀 VKontakte MCP Server запущен на порту ${PORT}`);
  console.log(`📡 MCP endpoint: http://localhost:${PORT}/mcp`);
  console.log(`🏥 Health check: http://localhost:${PORT}/health`);
  console.log(`ℹ️  MCP info: http://localhost:${PORT}/mcp-info`);
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
