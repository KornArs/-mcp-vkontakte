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

class VKontakteMCPServer {
  private server: Server;
  private vkApi: VKApi;

  constructor() {
    const accessToken = process.env.VK_ACCESS_TOKEN;
    const apiVersion = process.env.VK_API_VERSION || '5.131';

    if (!accessToken) {
      throw new Error('VK_ACCESS_TOKEN environment variable is required');
    }

    this.vkApi = new VKApi(accessToken, apiVersion);
    this.server = new Server(
      {
        name: 'vkontakte-mcp-server',
        version: '1.0.0',
      }
    );

    this.setupToolHandlers();
  }

  private setupToolHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
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

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case 'post_to_wall': {
            const ownerId = args.group_id ? `-${args.group_id}` : args.user_id;
            const result = await this.vkApi.postToWall({
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
            const result = await this.vkApi.getWallPosts({
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
            const result = await this.vkApi.searchPosts({
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
            const result = await this.vkApi.getGroupInfo(args.group_id);
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
            const result = await this.vkApi.getUserInfo(args.user_id);
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
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('VKontakte MCP Server started');
  }
}

const server = new VKontakteMCPServer();
server.run().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});
