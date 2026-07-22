export interface Profile {
  id: string
  username: string
  display_name: string | null
  avatar_url: string | null
  bio: string | null
  status: 'online' | 'offline'
  created_at: string
}

export interface Channel {
  id: string
  name: string
  topic: string | null
  cover_url: string | null
  is_group: boolean
  created_by: string
  member_count?: number
  message_count?: number
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

export interface Post {
  id: string
  author_id: string
  channel_id: string | null
  caption: string | null
  media_url: string | null
  created_at: string
  author?: Profile
  reaction_counts?: Partial<Record<ReactionEmotion, number>>
  my_reaction?: ReactionEmotion | null
}

export interface PostReaction {
  post_id: string
  user_id: string
  emotion: ReactionEmotion
  created_at: string
}
