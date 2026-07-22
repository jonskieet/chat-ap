-- ============================================================
-- Chat App — Supabase schema + RLS policies
-- Run this in Supabase SQL Editor (or via `supabase db push`)
-- ============================================================

-- 1. PROFILES (extends auth.users) -----------------------------
create table if not exists profiles (
  id uuid references auth.users on delete cascade primary key,
  username text unique not null,
  display_name text,
  avatar_url text,
  bio text,
  status text default 'offline' check (status in ('online', 'offline')),
  created_at timestamptz default now()
);

alter table profiles enable row level security;

create policy "Profiles are viewable by everyone"
  on profiles for select using (true);

create policy "Users can insert their own profile"
  on profiles for insert with check (auth.uid() = id);

create policy "Users can update their own profile"
  on profiles for update using (auth.uid() = id);

-- 2. CHANNELS (topic chats / groups, e.g. #art) -----------------
create table if not exists channels (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  topic text,
  cover_url text,
  is_group boolean default false,
  created_by uuid references profiles(id),
  created_at timestamptz default now()
);

alter table channels enable row level security;

create policy "Channels are viewable by everyone"
  on channels for select using (true);

create policy "Authenticated users can create channels"
  on channels for insert with check (auth.uid() = created_by);

create policy "Creator can update their channel"
  on channels for update using (auth.uid() = created_by);

-- 3. CHANNEL MEMBERS ---------------------------------------------
create table if not exists channel_members (
  channel_id uuid references channels(id) on delete cascade,
  user_id uuid references profiles(id) on delete cascade,
  joined_at timestamptz default now(),
  primary key (channel_id, user_id)
);

alter table channel_members enable row level security;

create policy "Members list viewable by everyone"
  on channel_members for select using (true);

create policy "Users can join channels themselves"
  on channel_members for insert with check (auth.uid() = user_id);

create policy "Users can leave channels themselves"
  on channel_members for delete using (auth.uid() = user_id);

-- 4. MESSAGES ------------------------------------------------------
create table if not exists messages (
  id uuid default gen_random_uuid() primary key,
  channel_id uuid references channels(id) on delete cascade,
  sender_id uuid references profiles(id),
  content text,
  attachment_url text,
  created_at timestamptz default now()
);

alter table messages enable row level security;

-- Anyone can read messages in public channels (simple model:
-- tighten to "only channel_members" if you want private channels)
create policy "Messages viewable by everyone"
  on messages for select using (true);

create policy "Users can send messages as themselves"
  on messages for insert with check (auth.uid() = sender_id);

create policy "Users can delete their own messages"
  on messages for delete using (auth.uid() = sender_id);

-- 5. FOLLOWS ---------------------------------------------------------
create table if not exists follows (
  follower_id uuid references profiles(id) on delete cascade,
  following_id uuid references profiles(id) on delete cascade,
  created_at timestamptz default now(),
  primary key (follower_id, following_id),
  check (follower_id <> following_id)
);

alter table follows enable row level security;

create policy "Follows are viewable by everyone"
  on follows for select using (true);

create policy "Users can follow as themselves"
  on follows for insert with check (auth.uid() = follower_id);

create policy "Users can unfollow as themselves"
  on follows for delete using (auth.uid() = follower_id);

-- 6. POSTS (Home feed) ------------------------------------------------
create table if not exists posts (
  id uuid default gen_random_uuid() primary key,
  author_id uuid references profiles(id) on delete cascade,
  channel_id uuid references channels(id),
  caption text,
  media_url text,
  created_at timestamptz default now()
);

alter table posts enable row level security;

create policy "Posts are viewable by everyone"
  on posts for select using (true);

create policy "Users can create posts as themselves"
  on posts for insert with check (auth.uid() = author_id);

create policy "Users can delete their own posts"
  on posts for delete using (auth.uid() = author_id);

-- 7. POST REACTIONS (multi-emotion, one per user per post) ------------
create table if not exists post_reactions (
  post_id uuid references posts(id) on delete cascade,
  user_id uuid references profiles(id) on delete cascade,
  emotion text not null check (emotion in ('love', 'fire', 'haha', 'wow', 'sad')),
  created_at timestamptz default now(),
  primary key (post_id, user_id)
);

alter table post_reactions enable row level security;

create policy "Reactions are viewable by everyone"
  on post_reactions for select using (true);

create policy "Users can react as themselves"
  on post_reactions for insert with check (auth.uid() = user_id);

create policy "Users can change their own reaction"
  on post_reactions for update using (auth.uid() = user_id);

create policy "Users can remove their own reaction"
  on post_reactions for delete using (auth.uid() = user_id);

-- Realtime: live reaction counts + new posts without reload
alter publication supabase_realtime add table posts;
alter publication supabase_realtime add table post_reactions;

-- 8. STORAGE BUCKET FOR POST MEDIA -------------------------------------
insert into storage.buckets (id, name, public)
values ('posts', 'posts', true)
on conflict (id) do nothing;

create policy "Post media is publicly accessible"
  on storage.objects for select using (bucket_id = 'posts');

create policy "Authenticated users can upload post media"
  on storage.objects for insert with check (
    bucket_id = 'posts' and auth.role() = 'authenticated'
  );

-- 7. STORAGE BUCKETS -----------------------------------------------------
-- Run once (or create via Dashboard > Storage):
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('attachments', 'attachments', true)
on conflict (id) do nothing;

create policy "Avatar images are publicly accessible"
  on storage.objects for select using (bucket_id = 'avatars');

create policy "Users can upload their own avatar"
  on storage.objects for insert with check (
    bucket_id = 'avatars' and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "Attachments are publicly accessible"
  on storage.objects for select using (bucket_id = 'attachments');

create policy "Authenticated users can upload attachments"
  on storage.objects for insert with check (
    bucket_id = 'attachments' and auth.role() = 'authenticated'
  );
