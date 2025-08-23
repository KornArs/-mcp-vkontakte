export interface VKPost {
  id: number;
  owner_id: number;
  from_id: number;
  date: number;
  text: string;
  likes?: {
    count: number;
    user_likes: number;
  };
  reposts?: {
    count: number;
    user_reposted: number;
  };
  comments?: {
    count: number;
  };
}

export interface VKGroup {
  id: number;
  name: string;
  screen_name: string;
  type: string;
  members_count: number;
}

export interface VKUser {
  id: number;
  first_name: string;
  last_name: string;
  screen_name: string;
  photo_100: string;
}

export interface VKApiResponse<T> {
  response: T;
  error?: {
    error_code: number;
    error_msg: string;
  };
}

// Единый перечень MCP инструментов
export type ToolName =
  | 'post_to_wall'
  | 'get_wall_posts'
  | 'search_posts'
  | 'get_group_info'
  | 'get_user_info'
  | 'get_post_stats'
  | 'get_wall_by_id'
  | 'get_comments'
  | 'create_comment'
  | 'delete_post'
  | 'edit_post'
  | 'add_like'
  | 'delete_like'
  | 'get_group_members'
  | 'resolve_screen_name'
  | 'upload_wall_photo_from_url'
  | 'upload_video_from_url';

export interface PostToWallParams {
  message: string;
  group_id?: string;
  user_id?: string;
  attachments?: string[];
  publish_date?: number;
}

export interface GetWallPostsParams {
  group_id?: string;
  user_id?: string;
  count?: number;
  offset?: number;
}

export interface SearchPostsParams {
  query: string;
  group_id?: string;
  count?: number;
  offset?: number;
}
