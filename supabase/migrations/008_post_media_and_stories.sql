-- ============================================================
-- Tách Story ra khỏi Post + cho phép 1 post có nhiều ảnh/video
-- Run in Supabase SQL Editor AFTER 007_post_media_type.sql
-- Idempotent: safe to re-run
-- ============================================================

-- 1. POST_MEDIA: nhiều ảnh/video cho 1 post (thay vì 1 post = 1 media_url) --
create table if not exists post_media (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references posts(id) on delete cascade,
  media_url text not null,
  media_type text not null default 'image' check (media_type in ('image', 'video')),
  position int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists post_media_post_idx on post_media (post_id, position asc);

alter table post_media enable row level security;

drop policy if exists "Post media rows are viewable by everyone" on post_media;
create policy "Post media rows are viewable by everyone"
  on post_media for select using (true);

drop policy if exists "Users can add media to their own posts" on post_media;
create policy "Users can add media to their own posts"
  on post_media for insert with check (
    exists (select 1 from posts where posts.id = post_id and posts.author_id = auth.uid())
  );

drop policy if exists "Users can delete media from their own posts" on post_media;
create policy "Users can delete media from their own posts"
  on post_media for delete using (
    exists (select 1 from posts where posts.id = post_id and posts.author_id = auth.uid())
  );

-- Chuyển dữ liệu cũ (posts.media_url đơn) sang post_media để không mất ảnh đã đăng trước đó
insert into post_media (post_id, media_url, media_type, position)
select id, media_url, coalesce(media_type, 'image'), 0
from posts
where media_url is not null
  and not exists (select 1 from post_media pm where pm.post_id = posts.id);

alter publication supabase_realtime add table post_media;

-- 2. STORIES: tin 24h thực sự tách riêng khỏi bài đăng (feed) -------------
create table if not exists stories (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references profiles(id) on delete cascade,
  media_url text not null,
  media_type text not null default 'image' check (media_type in ('image', 'video')),
  caption text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '24 hours')
);

create index if not exists stories_author_idx on stories (author_id, created_at desc);
create index if not exists stories_expires_idx on stories (expires_at);

alter table stories enable row level security;

drop policy if exists "Stories are viewable by everyone while active" on stories;
create policy "Stories are viewable by everyone while active"
  on stories for select using (true);

drop policy if exists "Users can create their own stories" on stories;
create policy "Users can create their own stories"
  on stories for insert with check (auth.uid() = author_id);

drop policy if exists "Users can delete their own stories" on stories;
create policy "Users can delete their own stories"
  on stories for delete using (auth.uid() = author_id);

alter publication supabase_realtime add table stories;

-- 3. STORY_VIEWS: ai đã xem tin nào (để tô nhẫn story mờ đi khi đã xem) ----
create table if not exists story_views (
  story_id uuid not null references stories(id) on delete cascade,
  viewer_id uuid not null references profiles(id) on delete cascade,
  viewed_at timestamptz not null default now(),
  primary key (story_id, viewer_id)
);

alter table story_views enable row level security;

drop policy if exists "Story authors can see who viewed" on story_views;
create policy "Story authors can see who viewed"
  on story_views for select using (
    viewer_id = auth.uid()
    or exists (select 1 from stories where stories.id = story_id and stories.author_id = auth.uid())
  );

drop policy if exists "Users can mark stories as viewed by themselves" on story_views;
create policy "Users can mark stories as viewed by themselves"
  on story_views for insert with check (auth.uid() = viewer_id);

alter publication supabase_realtime add table story_views;

-- 4. STORAGE BUCKET FOR STORIES -------------------------------------------
insert into storage.buckets (id, name, public)
values ('stories', 'stories', true)
on conflict (id) do nothing;

drop policy if exists "Story media is publicly accessible" on storage.objects;
create policy "Story media is publicly accessible"
  on storage.objects for select using (bucket_id = 'stories');

drop policy if exists "Authenticated users can upload story media" on storage.objects;
create policy "Authenticated users can upload story media"
  on storage.objects for insert with check (
    bucket_id = 'stories' and auth.role() = 'authenticated'
  );

-- 5. Dọn tin đã hết hạn (24h) — gọi định kỳ qua pg_cron nếu bật extension, --
--    hoặc gọi thủ công/từ client mỗi lần load story bar.
create or replace function public.purge_expired_stories()
returns void
language sql
security definer
set search_path = public
as $$
  delete from stories where expires_at < now();
$$;
