import axios from 'axios';
import { VKApiResponse, VKPost, VKGroup, VKUser } from './types.js';

export class VKApi {
  private accessToken: string;
  private apiVersion: string;
  private baseUrl = 'https://api.vk.com/method';

  constructor(accessToken: string, apiVersion: string = '5.199') {
    this.accessToken = accessToken;
    this.apiVersion = apiVersion;
  }

  private async makeRequest<T>(method: string, params: Record<string, any>): Promise<T> {
    try {
      // Логируем безопасно (маскируем токен)
      const maskedToken = this.accessToken ? `${this.accessToken.slice(0, 6)}...${this.accessToken.slice(-4)}` : '<none>';
      const requestParams = {
        ...params,
        access_token: this.accessToken,
        v: this.apiVersion,
      };

      console.log(`[VKApi] → ${method}`);
      console.log(`[VKApi] v=${this.apiVersion} token=${maskedToken}`);
      console.log(`[VKApi] params:`, { ...params, access_token: '<masked>' });

      const response = await axios.get(`${this.baseUrl}/${method}`, {
        params: {
          ...requestParams,
        },
        headers: {
          'Accept': 'application/json; charset=utf-8',
          'Accept-Charset': 'utf-8',
        },
        responseType: 'json',
        timeout: 15000,
        // Правильная обработка UTF-8
        transformRequest: [(data, headers) => {
          if (data && typeof data === 'object') {
            return Object.fromEntries(
              Object.entries(data).map(([key, value]) => [
                key, 
                typeof value === 'string' ? value : value
              ])
            );
          }
          return data;
        }],
      });

      const data: VKApiResponse<T> = response.data;
      
      if (data.error) {
        console.error(`[VKApi] ✖ ${method} error: ${data.error.error_msg} (${data.error.error_code})`);
        console.error(`[VKApi] params (masked):`, { ...params, access_token: '<masked>' });
        throw new Error(`VK API Error: ${data.error.error_msg} (${data.error.error_code})`);
      }

      console.log(`[VKApi] ← ${method} OK`);
      return data.response;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const status = error.response?.status;
        const payload = error.response?.data;
        console.error(`[VKApi] Network/HTTP error for ${method}:`, status, payload);
        throw new Error(`Network Error: ${error.message}${status ? ` (HTTP ${status})` : ''}`);
      }
      console.error(`[VKApi] Unknown error for ${method}:`, error);
      throw error instanceof Error ? error : new Error('Unknown error');
    }
  }

  async postToWall(params: {
    message: string;
    owner_id?: string;
    attachments?: string[];
    publish_date?: number;
  }): Promise<{ post_id: number }> {
    const methodParams: Record<string, any> = {
      message: params.message,
    };

    if (params.owner_id) {
      methodParams.owner_id = params.owner_id;
    }

    if (params.attachments) {
      methodParams.attachments = params.attachments.join(',');
    }

    if (params.publish_date) {
      methodParams.publish_date = params.publish_date;
    }

    return this.makeRequest<{ post_id: number }>('wall.post', methodParams);
  }

  async getWallPosts(params: {
    owner_id?: string;
    count?: number;
    offset?: number;
  }): Promise<{ count: number; items: VKPost[] }> {
    const methodParams: Record<string, any> = {};

    if (params.owner_id) {
      methodParams.owner_id = params.owner_id;
    }

    if (params.count) {
      methodParams.count = params.count;
    }

    if (params.offset) {
      methodParams.offset = params.offset;
    }

    return this.makeRequest<{ count: number; items: VKPost[] }>('wall.get', methodParams);
  }

  async searchPosts(params: {
    query: string;
    owner_id?: string;
    count?: number;
    offset?: number;
  }): Promise<{ count: number; items: VKPost[] }> {
    const methodParams: Record<string, any> = {
      query: params.query,
      q: params.query, // совместимость на случай, если используется параметр q
    };

    if (params.owner_id) {
      methodParams.owner_id = params.owner_id;
    }

    if (params.count) {
      methodParams.count = params.count;
    }

    if (params.offset) {
      methodParams.offset = params.offset;
    }

    return this.makeRequest<{ count: number; items: VKPost[] }>('wall.search', methodParams);
  }

  async getGroupInfo(groupId: string): Promise<VKGroup[]> {
    return this.makeRequest<VKGroup[]>('groups.getById', {
      group_ids: groupId,
    });
  }

  async getUserInfo(userId: string): Promise<VKUser[]> {
    return this.makeRequest<VKUser[]>('users.get', {
      user_ids: userId,
      fields: 'screen_name,photo_100',
    });
  }

  async getPostStats(postId: string, ownerId: string): Promise<any> {
    return this.makeRequest<any>('wall.getById', {
      posts: `${ownerId}_${postId}`,
    });
  }

  // Дополнительно: получить посты по id (несколько через запятую "owner_post,owner_post")
  async getWallById(posts: string): Promise<any> {
    return this.makeRequest<any>('wall.getById', {
      posts,
    });
  }

  // Комментарии к посту
  async getComments(params: {
    owner_id: string;
    post_id: number;
    need_likes?: number; // 0|1
    count?: number;
    offset?: number;
    sort?: 'asc' | 'desc';
    preview_length?: number;
  }): Promise<any> {
    const methodParams: Record<string, any> = {
      owner_id: params.owner_id,
      post_id: params.post_id,
    };
    if (typeof params.need_likes === 'number') methodParams.need_likes = params.need_likes;
    if (typeof params.count === 'number') methodParams.count = params.count;
    if (typeof params.offset === 'number') methodParams.offset = params.offset;
    if (params.sort) methodParams.sort = params.sort;
    if (typeof params.preview_length === 'number') methodParams.preview_length = params.preview_length;

    return this.makeRequest<any>('wall.getComments', methodParams);
  }

  async createComment(params: {
    owner_id: string;
    post_id: number;
    message?: string;
    attachments?: string[];
    reply_to_comment?: number;
    guid?: string;
  }): Promise<any> {
    const methodParams: Record<string, any> = {
      owner_id: params.owner_id,
      post_id: params.post_id,
    };
    if (params.message) methodParams.message = params.message;
    if (params.attachments?.length) methodParams.attachments = params.attachments.join(',');
    if (typeof params.reply_to_comment === 'number') methodParams.reply_to_comment = params.reply_to_comment;
    if (params.guid) methodParams.guid = params.guid;
    return this.makeRequest<any>('wall.createComment', methodParams);
  }

  async deletePost(params: { owner_id: string; post_id: number }): Promise<{ response: number } | any> {
    return this.makeRequest<any>('wall.delete', {
      owner_id: params.owner_id,
      post_id: params.post_id,
    });
  }

  async editPost(params: {
    owner_id: string;
    post_id: number;
    message?: string;
    attachments?: string[];
  }): Promise<any> {
    const methodParams: Record<string, any> = {
      owner_id: params.owner_id,
      post_id: params.post_id,
    };
    if (params.message) methodParams.message = params.message;
    if (params.attachments?.length) methodParams.attachments = params.attachments.join(',');
    return this.makeRequest<any>('wall.edit', methodParams);
  }

  // Лайки
  async addLike(params: { type: 'post' | 'comment'; owner_id: string; item_id: number }): Promise<any> {
    return this.makeRequest<any>('likes.add', {
      type: params.type,
      owner_id: params.owner_id,
      item_id: params.item_id,
    });
  }

  async deleteLike(params: { type: 'post' | 'comment'; owner_id: string; item_id: number }): Promise<any> {
    return this.makeRequest<any>('likes.delete', {
      type: params.type,
      owner_id: params.owner_id,
      item_id: params.item_id,
    });
  }

  // Участники группы
  async getGroupMembers(params: { group_id: string; sort?: 'id_asc' | 'id_desc' | 'time_asc' | 'time_desc'; offset?: number; count?: number }): Promise<any> {
    const methodParams: Record<string, any> = { group_id: params.group_id };
    if (params.sort) methodParams.sort = params.sort;
    if (typeof params.offset === 'number') methodParams.offset = params.offset;
    if (typeof params.count === 'number') methodParams.count = params.count;
    return this.makeRequest<any>('groups.getMembers', methodParams);
  }

  // Resolve screen name → object info (user|group)
  async resolveScreenName(screen_name: string): Promise<any> {
    return this.makeRequest<any>('utils.resolveScreenName', { screen_name });
  }

  // ===== Media upload helpers =====
  private extractGroupIdFromOwner(ownerId?: string): string | undefined {
    if (!ownerId) return undefined;
    if (ownerId.startsWith('-')) {
      return ownerId.slice(1);
    }
    return undefined;
  }

  async uploadWallPhotoFromUrl(params: { imageUrl: string; owner_id?: string }): Promise<string> {
    const groupId = this.extractGroupIdFromOwner(params.owner_id);

    const srv = await this.makeRequest<{ upload_url: string }>('photos.getWallUploadServer', {
      ...(groupId ? { group_id: groupId } : {}),
    });

    const resp = await fetch(params.imageUrl);
    if (!resp.ok) {
      throw new Error(`Failed to fetch image: HTTP ${resp.status}`);
    }
    const blob = await resp.blob();

    const form = new FormData();
    form.append('photo', blob, 'image');

    const uploadRes = await fetch(srv.upload_url, { method: 'POST', body: form as any });
    if (!uploadRes.ok) {
      throw new Error(`Failed to upload photo to VK: HTTP ${uploadRes.status}`);
    }
    const uploadJson = await uploadRes.json();

    const saved = await this.makeRequest<any>('photos.saveWallPhoto', {
      server: uploadJson.server,
      photo: uploadJson.photo,
      hash: uploadJson.hash,
      ...(groupId ? { group_id: groupId } : {}),
    });

    const photo = Array.isArray(saved) ? saved[0] : saved;
    if (!photo || typeof photo.id === 'undefined' || typeof photo.owner_id === 'undefined') {
      throw new Error('VK did not return saved photo info');
    }
    return `photo${photo.owner_id}_${photo.id}`;
  }

  async uploadVideoFromUrl(params: { videoUrl: string; owner_id?: string; name?: string; description?: string }): Promise<string> {
    const groupId = this.extractGroupIdFromOwner(params.owner_id);

    const save = await this.makeRequest<any>('video.save', {
      ...(groupId ? { group_id: groupId } : {}),
      name: params.name || 'Video',
      description: params.description || '',
      wallpost: 0,
    });

    const resp = await fetch(params.videoUrl);
    if (!resp.ok) {
      throw new Error(`Failed to fetch video: HTTP ${resp.status}`);
    }
    const blob = await resp.blob();

    const form = new FormData();
    form.append('video_file', blob, 'video');

    const uploadRes = await fetch(save.upload_url, { method: 'POST', body: form as any });
    if (!uploadRes.ok) {
      throw new Error(`Failed to upload video to VK: HTTP ${uploadRes.status}`);
    }

    const owner = save.owner_id;
    const videoId = save.video_id || save.video?.id;
    if (!owner || !videoId) {
      throw new Error('VK did not return video identifiers');
    }
    return `video${owner}_${videoId}`;
  }
}
