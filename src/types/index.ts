export interface Profile {
  id: string
  username: string
  display_name: string | null
  avatar_url: string | null
  bio: string | null
  status: 'online' | 'offline'
  interests: string[]
  created_at: string
}

export interface Channel {
  id: string
  name: string
  topic: string | null
  cover_url: string | null
  is_group: boolean
  is_dm?: boolean
  dm_key?: string | null
  created_by: string
  member_count?: number
  message_count?: number
  created_at: string
}

export interface Follow {
  follower_id: string
  following_id: string
  created_at: string
}

export interface Message {
  id: string
  channel_id: string
  sender_id: string
  content: string | null
  attachment_url: string | null
  created_at: string
  sender?: Profile
}

export interface FollowStats {
  followers: number
  following: number
  posts: number
}

export type ReactionEmotion = 'love' | 'fire' | 'haha' | 'wow' | 'sad'

export interface PostMedia {
  id: string
  post_id: string
  media_url: string
  media_type: 'image' | 'video'
  position: number
}

export interface Post {
  id: string
  author_id: string
  channel_id: string | null
  caption: string | null
  media_url: string | null
  media_type?: 'image' | 'video' | null
  created_at: string
  author?: Profile
  reaction_counts?: Partial<Record<ReactionEmotion, number>>
  my_reaction?: ReactionEmotion | null
  /** Toàn bộ ảnh/video của post này (carousel nhiều ảnh), sắp theo `position`. */
  media?: PostMedia[]
}

// Tin (Story) 24h — hoàn toàn tách khỏi bảng posts/feed.
export interface Story {
  id: string
  author_id: string
  media_url: string
  media_type: 'image' | 'video'
  caption: string | null
  created_at: string
  expires_at: string
  author?: Profile
}

export interface StoryView {
  story_id: string
  viewer_id: string
  viewed_at: string
}

export interface StoryGroup {
  authorId: string
  author?: Profile
  stories: Story[]
  allViewed: boolean
}

export interface PostReaction {
  post_id: string
  user_id: string
  emotion: ReactionEmotion
  created_at: string
}

export interface MessageReaction {
  message_id: string
  user_id: string
  emotion: ReactionEmotion
  created_at: string
}

export interface SavedPost {
  post_id: string
  user_id: string
  created_at: string
}

export interface PostComment {
  id: string
  post_id: string
  author_id: string
  content: string
  created_at: string
  author?: Profile
}

export type NotificationType = 'message' | 'post_reaction' | 'message_reaction' | 'post_comment'

export interface AppNotification {
  id: string
  user_id: string
  actor_id: string
  type: NotificationType
  channel_id: string | null
  message_id: string | null
  post_id: string | null
  comment_id: string | null
  emotion: ReactionEmotion | null
  read: boolean
  created_at: string
  actor?: Profile
}

// Row shape returned by the get_my_chats() RPC (backs the Chats list screen)
export interface ChatSummary {
  channel_id: string
  name: string
  topic: string | null
  cover_url: string | null
  is_group: boolean
  is_dm: boolean
  other_user_id: string | null
  other_username: string | null
  other_display_name: string | null
  other_avatar_url: string | null
  other_status: 'online' | 'offline' | null
  last_message: string | null
  last_message_at: string | null
  unread_count: number
}