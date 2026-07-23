-- ============================================================
-- Notifications: tin nhắn mới + reaction mới (post & message)
-- Run in Supabase SQL Editor AFTER 002_chat_backend_upgrade.sql
-- Idempotent: safe to re-run
-- ============================================================

-- 1. TABLE -----------------------------------------------------
create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade,   -- người nhận thông báo
  actor_id uuid references profiles(id) on delete cascade,  -- người gây ra hành động
  type text not null check (type in ('message', 'post_reaction', 'message_reaction')),
  channel_id uuid references channels(id) on delete cascade,
  message_id uuid references messages(id) on delete cascade,
  post_id uuid references posts(id) on delete cascade,
  emotion text,
  read boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists notifications_user_unread_idx
  on notifications (user_id, read, created_at desc);

alter table notifications enable row level security;

drop policy if exists "Users see their own notifications" on notifications;
create policy "Users see their own notifications"
  on notifications for select using (auth.uid() = user_id);

drop policy if exists "Users update their own notifications" on notifications;
create policy "Users update their own notifications"
  on notifications for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Inserts only happen via the security-definer trigger functions below,
-- so no direct insert policy is granted to end users.

-- 2. TRIGGER: tin nhắn mới -> thông báo cho các thành viên khác trong kênh
create or replace function public.notify_new_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into notifications (user_id, actor_id, type, channel_id, message_id)
  select cm.user_id, new.sender_id, 'message', new.channel_id, new.id
  from channel_members cm
  where cm.channel_id = new.channel_id
    and cm.user_id <> new.sender_id;
  return new;
end;
$$;

drop trigger if exists on_message_notify on messages;
create trigger on_message_notify
  after insert on messages
  for each row execute function public.notify_new_message();

-- 3. TRIGGER: reaction mới trên bài viết -> thông báo cho tác giả bài viết
create or replace function public.notify_post_reaction()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  post_author uuid;
begin
  select author_id into post_author from posts where id = new.post_id;
  if post_author is not null and post_author <> new.user_id then
    insert into notifications (user_id, actor_id, type, post_id, emotion)
    values (post_author, new.user_id, 'post_reaction', new.post_id, new.emotion);
  end if;
  return new;
end;
$$;

drop trigger if exists on_post_reaction_notify on post_reactions;
create trigger on_post_reaction_notify
  after insert on post_reactions
  for each row execute function public.notify_post_reaction();

-- 4. TRIGGER: reaction mới trên tin nhắn -> thông báo cho người gửi tin nhắn
create or replace function public.notify_message_reaction()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  msg_sender uuid;
  msg_channel uuid;
begin
  select sender_id, channel_id into msg_sender, msg_channel from messages where id = new.message_id;
  if msg_sender is not null and msg_sender <> new.user_id then
    insert into notifications (user_id, actor_id, type, channel_id, message_id, emotion)
    values (msg_sender, new.user_id, 'message_reaction', msg_channel, new.message_id, new.emotion);
  end if;
  return new;
end;
$$;

drop trigger if exists on_message_reaction_notify on message_reactions;
create trigger on_message_reaction_notify
  after insert on message_reactions
  for each row execute function public.notify_message_reaction();

-- 5. RPC: đánh dấu tất cả thông báo đã đọc ------------------------
create or replace function public.mark_notifications_read()
returns void
language sql
security definer
set search_path = public
as $$
  update notifications set read = true where user_id = auth.uid() and read = false;
$$;

-- 6. Realtime ------------------------------------------------------
alter publication supabase_realtime add table notifications;
