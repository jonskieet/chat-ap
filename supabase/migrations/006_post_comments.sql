-- ============================================================
-- Comment cho post
-- Run in Supabase SQL Editor AFTER 005_notifications.sql
-- Idempotent: safe to re-run
-- ============================================================

-- 1. TABLE -----------------------------------------------------
create table if not exists post_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid references posts(id) on delete cascade,
  author_id uuid references profiles(id) on delete cascade,
  content text not null check (char_length(trim(content)) > 0 and char_length(content) <= 500),
  created_at timestamptz not null default now()
);

create index if not exists post_comments_post_idx
  on post_comments (post_id, created_at asc);

alter table post_comments enable row level security;

-- Ai cũng xem được comment của post họ xem được (posts đang mở cho tất cả xem)
drop policy if exists "Comments are viewable by everyone" on post_comments;
create policy "Comments are viewable by everyone"
  on post_comments for select using (true);

drop policy if exists "Users can comment as themselves" on post_comments;
create policy "Users can comment as themselves"
  on post_comments for insert with check (auth.uid() = author_id);

-- Chỉ author tự xoá/sửa comment của mình
drop policy if exists "Users can delete their own comments" on post_comments;
create policy "Users can delete their own comments"
  on post_comments for delete using (auth.uid() = author_id);

drop policy if exists "Users can edit their own comments" on post_comments;
create policy "Users can edit their own comments"
  on post_comments for update
  using (auth.uid() = author_id)
  with check (auth.uid() = author_id);

-- 2. Thêm loại 'post_comment' vào notifications.type -----------------
alter table notifications drop constraint if exists notifications_type_check;
alter table notifications add constraint notifications_type_check
  check (type in ('message', 'post_reaction', 'message_reaction', 'post_comment'));

-- notifications.post_id đã tồn tại (dùng lại cho post_comment); thêm cột riêng
-- để trỏ đúng vào comment cụ thể, tránh lẫn với reaction notification cùng post.
alter table notifications add column if not exists comment_id uuid
  references post_comments(id) on delete cascade;

-- 3. TRIGGER: comment mới trên bài viết -> thông báo cho tác giả bài viết ------
-- (giữ nguyên pattern notify_post_reaction() ở 005_notifications.sql)
create or replace function public.notify_post_comment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  post_author uuid;
begin
  select author_id into post_author from posts where id = new.post_id;
  if post_author is not null and post_author <> new.author_id then
    insert into notifications (user_id, actor_id, type, post_id, comment_id)
    values (post_author, new.author_id, 'post_comment', new.post_id, new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists on_post_comment_notify on post_comments;
create trigger on_post_comment_notify
  after insert on post_comments
  for each row execute function public.notify_post_comment();

-- 4. Realtime ------------------------------------------------------
alter publication supabase_realtime add table post_comments;
