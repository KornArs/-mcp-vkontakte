import axios from 'axios';
import FormData from 'form-data';

// Inline типы вместо импорта из types.js
interface VKApiResponse<T> {
  response: T;
  error?: {
    error_code: number;
    error_msg: string;
  };
}

interface VKPost {
  id: number;
  text: string;
  date: number;
  likes?: {
    count: number;
  };
  reposts?: {
    count: number;
  };
  comments?: {
    count: number;
  };
}

interface VKGroup {
  id: number;
  name: string;
  screen_name: string;
  description?: string;
  members_count: number;
}

interface VKUser {
  id: number;
  first_name: string;
  last_name: string;
  screen_name: string;
}

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
    const buffer = await resp.arrayBuffer();

    const form = new FormData();
    form.append('photo', Buffer.from(buffer), 'image.jpg');

    const uploadRes = await fetch(srv.upload_url, { 
      method: 'POST', 
      body: form as any,
      headers: form.getHeaders()
    });
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
    const buffer = await resp.arrayBuffer();

    const form = new FormData();
    form.append('video_file', Buffer.from(buffer), 'video.mp4');

    const uploadRes = await fetch(save.upload_url, { 
      method: 'POST', 
      body: form as any,
      headers: form.getHeaders()
    });
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

  // ===== Stories API =====
  async getStoriesPhotoUploadServer(params: { group_id?: string }): Promise<{ upload_url: string }> {
    const methodParams: Record<string, any> = {};
    if (params.group_id) methodParams.group_id = params.group_id;
    
    return this.makeRequest<{ upload_url: string }>('stories.getPhotoUploadServer', methodParams);
  }

  async getStoriesVideoUploadServer(params: { group_id?: string }): Promise<{ upload_url: string }> {
    const methodParams: Record<string, any> = {};
    if (params.group_id) methodParams.group_id = params.group_id;
    
    return this.makeRequest<{ upload_url: string }>('stories.getVideoUploadServer', methodParams);
  }

  async saveStory(params: {
    upload_results: string;
    group_id?: string;
    reply_to_story?: string;
    link_text?: string;
    link_url?: string;
  }): Promise<any> {
    const methodParams: Record<string, any> = {
      upload_results: params.upload_results,
    };
    
    if (params.group_id) methodParams.group_id = params.group_id;
    if (params.reply_to_story) methodParams.reply_to_story = params.reply_to_story;
    if (params.link_text) methodParams.link_text = params.link_text;
    if (params.link_url) methodParams.link_url = params.link_url;
    
    return this.makeRequest<any>('stories.save', methodParams);
  }

  async getStories(params: {
    owner_id?: string;
    extended?: boolean;
    fields?: string[];
  }): Promise<any> {
    const methodParams: Record<string, any> = {};
    
    if (params.owner_id) methodParams.owner_id = params.owner_id;
    if (params.extended !== undefined) methodParams.extended = params.extended ? 1 : 0;
    if (params.fields?.length) methodParams.fields = params.fields.join(',');
    
    return this.makeRequest<any>('stories.get', methodParams);
  }

  async deleteStory(params: { story_id: number; owner_id?: string }): Promise<any> {
    const methodParams: Record<string, any> = {
      story_id: params.story_id,
    };
    
    if (params.owner_id) methodParams.owner_id = params.owner_id;
    
    return this.makeRequest<any>('stories.delete', methodParams);
  }

  // ===== Pin/Unpin Posts =====
  async pinPost(params: { post_id: number; owner_id?: string }): Promise<any> {
    const methodParams: Record<string, any> = {
      post_id: params.post_id,
    };
    
    if (params.owner_id) methodParams.owner_id = params.owner_id;
    
    return this.makeRequest<any>('wall.pinPost', methodParams);
  }

  async unpinPost(params: { post_id: number; owner_id?: string }): Promise<any> {
    const methodParams: Record<string, any> = {
      post_id: params.post_id,
    };
    
    if (params.owner_id) methodParams.owner_id = params.owner_id;
    
    return this.makeRequest<any>('wall.unpinPost', methodParams);
  }

  // ===== Reposts =====
  async repost(params: {
    object: string;
    message?: string;
    group_id?: string;
  }): Promise<any> {
    const methodParams: Record<string, any> = {
      object: params.object,
    };
    
    if (params.message) methodParams.message = params.message;
    if (params.group_id) methodParams.group_id = params.group_id;
    
    return this.makeRequest<any>('wall.repost', methodParams);
  }

  async getReposts(params: {
    owner_id?: string;
    post_id: number;
    count?: number;
    offset?: number;
  }): Promise<any> {
    const methodParams: Record<string, any> = {
      post_id: params.post_id,
    };
    
    if (params.owner_id) methodParams.owner_id = params.owner_id;
    if (params.count) methodParams.count = params.count;
    if (params.offset) methodParams.offset = params.offset;
    
    return this.makeRequest<any>('wall.getReposts', methodParams);
  }

  // ===== Photo Albums =====
  async createPhotoAlbum(params: {
    title: string;
    description?: string;
    group_id?: string;
    privacy_view?: string[];
    privacy_comment?: string[];
  }): Promise<any> {
    const methodParams: Record<string, any> = {
      title: params.title,
    };
    
    if (params.description) methodParams.description = params.description;
    if (params.group_id) methodParams.group_id = params.group_id;
    if (params.privacy_view?.length) methodParams.privacy_view = params.privacy_view.join(',');
    if (params.privacy_comment?.length) methodParams.privacy_comment = params.privacy_comment.join(',');
    
    return this.makeRequest<any>('photos.createAlbum', methodParams);
  }

  async getPhotoAlbums(params: {
    owner_id?: string;
    album_ids?: number[];
    count?: number;
    offset?: number;
    need_system?: boolean;
    need_covers?: boolean;
    photo_sizes?: boolean;
  }): Promise<any> {
    const methodParams: Record<string, any> = {};
    
    if (params.owner_id) methodParams.owner_id = params.owner_id;
    if (params.album_ids?.length) methodParams.album_ids = params.album_ids.join(',');
    if (params.count) methodParams.count = params.count;
    if (params.offset) methodParams.offset = params.offset;
    if (params.need_system !== undefined) methodParams.need_system = params.need_system ? 1 : 0;
    if (params.need_covers !== undefined) methodParams.need_covers = params.need_covers ? 1 : 0;
    if (params.photo_sizes !== undefined) methodParams.photo_sizes = params.photo_sizes ? 1 : 0;
    
    return this.makeRequest<any>('photos.getAlbums', methodParams);
  }

  async editPhotoAlbum(params: {
    album_id: number;
    title?: string;
    description?: string;
    owner_id?: string;
    privacy_view?: string[];
    privacy_comment?: string[];
  }): Promise<any> {
    const methodParams: Record<string, any> = {
      album_id: params.album_id,
    };
    
    if (params.title) methodParams.title = params.title;
    if (params.description) methodParams.description = params.description;
    if (params.owner_id) methodParams.owner_id = params.owner_id;
    if (params.privacy_view?.length) methodParams.privacy_view = params.privacy_view.join(',');
    if (params.privacy_comment?.length) methodParams.privacy_comment = params.privacy_comment.join(',');
    
    return this.makeRequest<any>('photos.editAlbum', methodParams);
  }

  async deletePhotoAlbum(params: { album_id: number; owner_id?: string }): Promise<any> {
    const methodParams: Record<string, any> = {
      album_id: params.album_id,
    };
    
    if (params.owner_id) methodParams.owner_id = params.owner_id;
    
    return this.makeRequest<any>('photos.deleteAlbum', methodParams);
  }

  // ===== User Groups Management =====
  async getUserGroups(params: {
    user_id?: string;
    extended?: boolean;
    filter?: string[];
    fields?: string[];
    count?: number;
    offset?: number;
  }): Promise<any> {
    const methodParams: Record<string, any> = {};
    
    if (params.user_id) methodParams.user_id = params.user_id;
    if (params.extended !== undefined) methodParams.extended = params.extended ? 1 : 0;
    if (params.filter?.length) methodParams.filter = params.filter.join(',');
    if (params.fields?.length) methodParams.fields = params.fields.join(',');
    if (params.count) methodParams.count = params.count;
    if (params.offset) methodParams.offset = params.offset;
    
    return this.makeRequest<any>('groups.get', methodParams);
  }

  async getGroupPermissions(params: { group_id: string }): Promise<any> {
    return this.makeRequest<any>('groups.getLongPollServer', {
      group_id: params.group_id,
    });
  }

  // ===== Advanced Analytics =====
  async getGroupStats(params: {
    group_id: string;
    date_from?: string;
    date_to?: string;
    fields?: string[];
  }): Promise<any> {
    const methodParams: Record<string, any> = {
      group_id: params.group_id,
    };
    
    if (params.date_from) methodParams.date_from = params.date_from;
    if (params.date_to) methodParams.date_to = params.date_to;
    if (params.fields?.length) methodParams.fields = params.fields.join(',');
    
    return this.makeRequest<any>('stats.get', methodParams);
  }

  async getGroupOnlineStatus(params: { group_id: string }): Promise<any> {
    return this.makeRequest<any>('groups.getOnlineStatus', {
      group_id: params.group_id,
    });
  }

  // ===== User Management =====
  async searchUsers(params: {
    q: string;
    sort?: number;
    offset?: number;
    count?: number;
    fields?: string[];
    city?: number;
    country?: number;
    hometown?: string;
    university_country?: number;
    university?: number;
    university_year?: number;
    university_faculty?: number;
    university_chair?: number;
    sex?: number;
    status?: number;
    age_from?: number;
    age_to?: number;
    birth_day?: number;
    birth_month?: number;
    birth_year?: number;
    online?: boolean;
    has_photo?: boolean;
    school_country?: number;
    school_city?: number;
    school_class?: number;
    school?: number;
    school_year?: number;
    religion?: string;
    interests?: string;
    company?: string;
    position?: string;
    group_id?: string;
    from_list?: string[];
  }): Promise<any> {
    const methodParams: Record<string, any> = {
      q: params.q,
    };
    
    // Добавляем все опциональные параметры
    Object.entries(params).forEach(([key, value]) => {
      if (key !== 'q' && value !== undefined) {
        if (Array.isArray(value)) {
          methodParams[key] = value.join(',');
        } else if (typeof value === 'boolean') {
          methodParams[key] = value ? 1 : 0;
        } else {
          methodParams[key] = value;
        }
      }
    });
    
    return this.makeRequest<any>('users.search', methodParams);
  }

  async getUserFollowers(params: {
    user_id?: string;
    offset?: number;
    count?: number;
    fields?: string[];
    name_case?: string;
  }): Promise<any> {
    const methodParams: Record<string, any> = {};
    
    if (params.user_id) methodParams.user_id = params.user_id;
    if (params.offset) methodParams.offset = params.offset;
    if (params.count) methodParams.count = params.count;
    if (params.fields?.length) methodParams.fields = params.fields.join(',');
    if (params.name_case) methodParams.name_case = params.name_case;
    
    return this.makeRequest<any>('users.getFollowers', methodParams);
  }

  async getUserSubscriptions(params: {
    user_id?: string;
    extended?: boolean;
    offset?: number;
    count?: number;
    fields?: string[];
  }): Promise<any> {
    const methodParams: Record<string, any> = {};
    
    if (params.user_id) methodParams.user_id = params.user_id;
    if (params.extended !== undefined) methodParams.extended = params.extended ? 1 : 0;
    if (params.offset) methodParams.offset = params.offset;
    if (params.count) methodParams.count = params.count;
    if (params.fields?.length) methodParams.fields = params.fields.join(',');
    
    return this.makeRequest<any>('users.getSubscriptions', methodParams);
  }

  // ===== Group Management =====
  async editGroup(params: {
    group_id: string;
    title?: string;
    description?: string;
    category_id?: number;
    public_category?: number;
    website?: string;
    subject?: string;
    age_limits?: number;
    market?: boolean;
    market_comments?: boolean;
    market_contacts?: boolean;
    market_wiki?: boolean;
    obscene_filter?: boolean;
    obscene_stopwords?: boolean;
    obscene_words?: string;
    main_section?: number;
    secondary_section?: number;
    country?: number;
    city?: number;
    address?: string;
    place_id?: number;
    public_date?: string;
    wall?: number;
    topics?: number;
    wiki?: number;
    messages?: number;
    articles?: number;
    events?: number;
    links?: boolean;
    rss?: string;
    event_start_date?: number;
    event_finish_date?: number;
    event_group_id?: number;
    public_category_list?: number[];
    subcategory?: number;
    subject_list?: number[];
  }): Promise<any> {
    const methodParams: Record<string, any> = {
      group_id: params.group_id,
    };
    
    // Добавляем все опциональные параметры
    Object.entries(params).forEach(([key, value]) => {
      if (key !== 'group_id' && value !== undefined) {
        if (Array.isArray(value)) {
          methodParams[key] = value.join(',');
        } else if (typeof value === 'boolean') {
          methodParams[key] = value ? 1 : 0;
        } else {
          methodParams[key] = value;
        }
      }
    });
    
    return this.makeRequest<any>('groups.edit', methodParams);
  }

  async banUser(params: {
    group_id: string;
    user_id: string;
    end_date?: number;
    reason?: number;
    comment?: string;
    comment_visible?: boolean;
  }): Promise<any> {
    const methodParams: Record<string, any> = {
      group_id: params.group_id,
      user_id: params.user_id,
    };
    
    if (params.end_date) methodParams.end_date = params.end_date;
    if (params.reason) methodParams.reason = params.reason;
    if (params.comment) methodParams.comment = params.comment;
    if (params.comment_visible !== undefined) methodParams.comment_visible = params.comment_visible ? 1 : 0;
    
    return this.makeRequest<any>('groups.banUser', methodParams);
  }

  async unbanUser(params: { group_id: string; user_id: string }): Promise<any> {
    return this.makeRequest<any>('groups.unbanUser', {
      group_id: params.group_id,
      user_id: params.user_id,
    });
  }

  async getBannedUsers(params: {
    group_id: string;
    offset?: number;
    count?: number;
    owner_id?: string;
  }): Promise<any> {
    const methodParams: Record<string, any> = {
      group_id: params.group_id,
    };
    
    if (params.offset) methodParams.offset = params.offset;
    if (params.count) methodParams.count = params.count;
    if (params.owner_id) methodParams.owner_id = params.owner_id;
    
    return this.makeRequest<any>('groups.getBanned', methodParams);
  }

  // ===== Stories Media Upload =====
  async uploadPhotoToStories(params: {
    upload_url: string;
    photo_file: Buffer;
    group_id?: string;
  }): Promise<any> {
    const form = new FormData();
    form.append('photo', params.photo_file, 'story.jpg');
    
    if (params.group_id) {
      form.append('group_id', params.group_id);
    }
    
    const response = await fetch(params.upload_url, {
      method: 'POST',
      body: form as any,
      headers: form.getHeaders(),
    });
    
    if (!response.ok) {
      throw new Error(`Failed to upload photo to stories: HTTP ${response.status}`);
    }
    
    return response.json();
  }

  async uploadVideoToStories(params: {
    upload_url: string;
    video_file: Buffer;
    group_id?: string;
  }): Promise<any> {
    const form = new FormData();
    form.append('video_file', params.video_file, 'story.mp4');
    
    if (params.group_id) {
      form.append('group_id', params.group_id);
    }
    
    const response = await fetch(params.upload_url, {
      method: 'POST',
      body: form as any,
      headers: form.getHeaders(),
    });
    
    if (!response.ok) {
      throw new Error(`Failed to upload video to stories: HTTP ${response.status}`);
    }
    
    return response.json();
  }
}
