-- ============================================================
-- STORY_LIKES: viewer thả tim cho 1 tin (story), giống Instagram.
-- Run in Supabase SQL Editor AFTER 008_post_media_and_stories.sql
-- Idempotent: safe to re-run
-- ============================================================

create table if not exists story_likes (
  story_id uuid not null references stories(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (story_id, user_id)
);

create index if not exists story_likes_story_idx on story_likes (story_id);

alter table story_likes enable row level security;

drop policy if exists "Story likes are viewable by everyone" on story_likes;
create policy "Story likes are viewable by everyone"
  on story_likes for select using (true);

drop policy if exists "Users can like as themselves" on story_likes;
create policy "Users can like as themselves"
  on story_likes for insert with check (auth.uid() = user_id);

drop policy if exists "Users can remove their own like" on story_likes;
create policy "Users can remove their own like"
  on story_likes for delete using (auth.uid() = user_id);

alter publication supabase_realtime add table story_likes;
