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
          {
            name: 'get_post_stats',
            description: 'Получает статистику по посту (wall.getById)',
            inputSchema: {
              type: 'object',
              properties: {
                owner_id: { type: 'string' },
                post_id: { type: 'string' },
              },
              required: ['owner_id', 'post_id'],
            },
          },
          {
            name: 'get_wall_by_id',
            description: 'Получает посты по идентификаторам owner_post,owner_post',
            inputSchema: {
              type: 'object',
              properties: { posts: { type: 'string' } },
              required: ['posts'],
            },
          },
          {
            name: 'get_comments',
            description: 'Получает комментарии к посту',
            inputSchema: {
              type: 'object',
              properties: {
                owner_id: { type: 'string' },
                post_id: { type: 'number' },
                need_likes: { type: 'number' },
                count: { type: 'number' },
                offset: { type: 'number' },
                sort: { type: 'string', enum: ['asc', 'desc'] },
                preview_length: { type: 'number' },
              },
              required: ['owner_id', 'post_id'],
            },
          },
          {
            name: 'create_comment',
            description: 'Создаёт комментарий к посту',
            inputSchema: {
              type: 'object',
              properties: {
                owner_id: { type: 'string' },
                post_id: { type: 'number' },
                message: { type: 'string' },
                attachments: { type: 'array', items: { type: 'string' } },
                reply_to_comment: { type: 'number' },
                guid: { type: 'string' },
              },
              required: ['owner_id', 'post_id'],
            },
          },
          {
            name: 'delete_post',
            description: 'Удаляет пост со стены',
            inputSchema: {
              type: 'object',
              properties: {
                owner_id: { type: 'string' },
                post_id: { type: 'number' },
              },
              required: ['owner_id', 'post_id'],
            },
          },
          {
            name: 'edit_post',
            description: 'Редактирует пост на стене',
            inputSchema: {
              type: 'object',
              properties: {
                owner_id: { type: 'string' },
                post_id: { type: 'number' },
                message: { type: 'string' },
                attachments: { type: 'array', items: { type: 'string' } },
              },
              required: ['owner_id', 'post_id'],
            },
          },
          {
            name: 'add_like',
            description: 'Ставит лайк на пост или комментарий',
            inputSchema: {
              type: 'object',
              properties: {
                type: { type: 'string', enum: ['post', 'comment'] },
                owner_id: { type: 'string' },
                item_id: { type: 'number' },
              },
              required: ['type', 'owner_id', 'item_id'],
            },
          },
          {
            name: 'delete_like',
            description: 'Удаляет лайк с поста или комментария',
            inputSchema: {
              type: 'object',
              properties: {
                type: { type: 'string', enum: ['post', 'comment'] },
                owner_id: { type: 'string' },
                item_id: { type: 'number' },
              },
              required: ['type', 'owner_id', 'item_id'],
            },
          },
          {
            name: 'get_group_members',
            description: 'Получает участников группы',
            inputSchema: {
              type: 'object',
              properties: {
                group_id: { type: 'string' },
                sort: { type: 'string', enum: ['id_asc', 'id_desc', 'time_asc', 'time_desc'] },
                offset: { type: 'number' },
                count: { type: 'number' },
              },
              required: ['group_id'],
            },
          },
          {
            name: 'resolve_screen_name',
            description: 'Определяет объект по screen_name',
            inputSchema: {
              type: 'object',
              properties: { screen_name: { type: 'string' } },
              required: ['screen_name'],
            },
          },
          {
            name: 'upload_wall_photo_from_url',
            description: 'Загружает фото по URL и готовит attachment для стены',
            inputSchema: {
              type: 'object',
              properties: {
                imageUrl: { type: 'string' },
                owner_id: { type: 'string' },
              },
              required: ['imageUrl'],
            },
          },
          {
            name: 'upload_video_from_url',
            description: 'Загружает видео по URL и готовит attachment для стены',
            inputSchema: {
              type: 'object',
              properties: {
                videoUrl: { type: 'string' },
                owner_id: { type: 'string' },
                name: { type: 'string' },
                description: { type: 'string' },
              },
              required: ['videoUrl'],
            },
          },
        ],
      };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name } = request.params;
      const rawArgs: unknown = (request.params as any).arguments;
      const args: any = rawArgs && typeof rawArgs === 'object' ? (rawArgs as any) : {};

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
                  text: `📊 Информация о группе:\nНазвание: ${group.name}\nID: ${group.id}\nУчастников: ${group.members_count}`,
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

          case 'get_post_stats': {
            const result = await this.vkApi.getPostStats(String(args.post_id), String(args.owner_id));
            return { content: [{ type: 'text', text: JSON.stringify(result) }] };
          }

          case 'get_wall_by_id': {
            const result = await this.vkApi.getWallById(String(args.posts));
            return { content: [{ type: 'text', text: JSON.stringify(result) }] };
          }

          case 'get_comments': {
            const result = await this.vkApi.getComments({
              owner_id: String(args.owner_id),
              post_id: Number(args.post_id),
              need_likes: typeof args.need_likes === 'number' ? Number(args.need_likes) : undefined,
              count: typeof args.count === 'number' ? Number(args.count) : undefined,
              offset: typeof args.offset === 'number' ? Number(args.offset) : undefined,
              sort: args.sort as 'asc' | 'desc' | undefined,
              preview_length: typeof args.preview_length === 'number' ? Number(args.preview_length) : undefined,
            });
            return { content: [{ type: 'text', text: JSON.stringify(result) }] };
          }

          case 'create_comment': {
            const result = await this.vkApi.createComment({
              owner_id: String(args.owner_id),
              post_id: Number(args.post_id),
              message: args.message as string | undefined,
              attachments: Array.isArray(args.attachments) ? (args.attachments as string[]) : undefined,
              reply_to_comment: typeof args.reply_to_comment === 'number' ? Number(args.reply_to_comment) : undefined,
              guid: args.guid as string | undefined,
            });
            return { content: [{ type: 'text', text: JSON.stringify(result) }] };
          }

          case 'delete_post': {
            const result = await this.vkApi.deletePost({ owner_id: String(args.owner_id), post_id: Number(args.post_id) });
            return { content: [{ type: 'text', text: JSON.stringify(result) }] };
          }

          case 'edit_post': {
            const result = await this.vkApi.editPost({
              owner_id: String(args.owner_id),
              post_id: Number(args.post_id),
              message: args.message as string | undefined,
              attachments: Array.isArray(args.attachments) ? (args.attachments as string[]) : undefined,
            });
            return { content: [{ type: 'text', text: JSON.stringify(result) }] };
          }

          case 'add_like': {
            const result = await this.vkApi.addLike({ type: args.type as 'post' | 'comment', owner_id: String(args.owner_id), item_id: Number(args.item_id) });
            return { content: [{ type: 'text', text: JSON.stringify(result) }] };
          }

          case 'delete_like': {
            const result = await this.vkApi.deleteLike({ type: args.type as 'post' | 'comment', owner_id: String(args.owner_id), item_id: Number(args.item_id) });
            return { content: [{ type: 'text', text: JSON.stringify(result) }] };
          }

          case 'get_group_members': {
            const result = await this.vkApi.getGroupMembers({
              group_id: String(args.group_id),
              sort: args.sort as 'id_asc' | 'id_desc' | 'time_asc' | 'time_desc' | undefined,
              offset: typeof args.offset === 'number' ? Number(args.offset) : undefined,
              count: typeof args.count === 'number' ? Number(args.count) : undefined,
            });
            return { content: [{ type: 'text', text: JSON.stringify(result) }] };
          }

          case 'resolve_screen_name': {
            const result = await this.vkApi.resolveScreenName(String(args.screen_name));
            return { content: [{ type: 'text', text: JSON.stringify(result) }] };
          }

          case 'upload_wall_photo_from_url': {
            const attachment = await this.vkApi.uploadWallPhotoFromUrl({ imageUrl: String(args.imageUrl), owner_id: args.owner_id as string | undefined });
            return { content: [{ type: 'text', text: attachment }] };
          }

          case 'upload_video_from_url': {
            const attachment = await this.vkApi.uploadVideoFromUrl({
              videoUrl: String(args.videoUrl),
              owner_id: args.owner_id as string | undefined,
              name: args.name as string | undefined,
              description: args.description as string | undefined,
            });
            return { content: [{ type: 'text', text: attachment }] };
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
