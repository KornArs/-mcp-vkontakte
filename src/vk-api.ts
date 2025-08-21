import axios from 'axios';
import { VKApiResponse, VKPost, VKGroup, VKUser } from './types.js';

export class VKApi {
  private accessToken: string;
  private apiVersion: string;
  private baseUrl = 'https://api.vk.com/method';

  constructor(accessToken: string, apiVersion: string = '5.131') {
    this.accessToken = accessToken;
    this.apiVersion = apiVersion;
  }

  private async makeRequest<T>(method: string, params: Record<string, any>): Promise<T> {
    try {
      const response = await axios.get(`${this.baseUrl}/${method}`, {
        params: {
          ...params,
          access_token: this.accessToken,
          v: this.apiVersion,
        },
        headers: {
          'Accept': 'application/json; charset=utf-8',
          'Accept-Charset': 'utf-8',
        },
        responseType: 'json',
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
        throw new Error(`VK API Error: ${data.error.error_msg} (${data.error.error_code})`);
      }

      return data.response;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new Error(`Network Error: ${error.message}`);
      }
      throw error;
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
}
