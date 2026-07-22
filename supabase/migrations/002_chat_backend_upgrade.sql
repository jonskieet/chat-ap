-- ============================================================
-- Chat backend upgrade — DMs, reactions, unread counts, presence
-- Run in Supabase SQL Editor AFTER schema.sql
-- Idempotent: safe to re-run
-- ============================================================

-- 1. CHANNELS: direct-message support -----------------------------
alter table channels add column if not exists is_dm boolean default false;
alter table channels add column if not exists dm_key text unique;
alter table channels add column if not exists last_message_at timestamptz default now();

-- keep last_message_at fresh whenever a message is inserted (drives chat-list ordering)
create or replace function public.touch_channel_last_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update channels set last_message_at = new.created_at where id = new.channel_id;
  return new;
end;
$$;

drop trigger if exists on_message_touch_channel on messages;
create trigger on_message_touch_channel
  after insert on messages
  for each row execute function public.touch_channel_last_message();

-- 2. MESSAGE REACTIONS (emoji react per user per message) --------
create table if not exists message_reactions (
  message_id uuid references messages(id) on delete cascade,
  user_id uuid references profiles(id) on delete cascade,
  emotion text not null check (emotion in ('love', 'fire', 'haha', 'wow', 'sad')),
  created_at timestamptz default now(),
  primary key (message_id, user_id)
);

alter table message_reactions enable row level security;

create policy "Message reactions viewable by everyone"
  on message_reactions for select using (true);

create policy "Users can react as themselves"
  on message_reactions for insert with check (auth.uid() = user_id);

create policy "Users can change their own message reaction"
  on message_reactions for update using (auth.uid() = user_id);

create policy "Users can remove their own message reaction"
  on message_reactions for delete using (auth.uid() = user_id);

-- 3. CHANNEL READS (per-user read cursor -> powers unread badges) --
create table if not exists channel_reads (
  channel_id uuid references channels(id) on delete cascade,
  user_id uuid references profiles(id) on delete cascade,
  last_read_at timestamptz default now(),
  primary key (channel_id, user_id)
);

alter table channel_reads enable row level security;

create policy "Users manage their own read cursor"
  on channel_reads for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- 4. PRESENCE: last_seen on profiles ------------------------------
alter table profiles add column if not exists last_seen timestamptz default now();

create or replace function public.touch_last_seen()
returns void
language sql
security definer
set search_path = public
as $$
  update profiles set last_seen = now(), status = 'online' where id = auth.uid();
$$;

-- 5. TIGHTEN PRIVACY: DMs are only visible to their members --------
-- (public/group channels stay open per original schema.sql policies)
drop policy if exists "Messages viewable by everyone" on messages;
create policy "Messages viewable by channel members or public channels"
  on messages for select using (
    exists (
      select 1 from channels c
      where c.id = messages.channel_id
        and (
          c.is_dm is not true
          or exists (
            select 1 from channel_members cm
            where cm.channel_id = c.id and cm.user_id = auth.uid()
          )
        )
    )
  );

drop policy if exists "Channels are viewable by everyone" on channels;
create policy "Channels viewable by everyone or by DM members"
  on channels for select using (
    is_dm is not true
    or exists (
      select 1 from channel_members cm
      where cm.channel_id = channels.id and cm.user_id = auth.uid()
    )
  );

-- 6. RPC: get_or_create_dm — find existing 1:1 chat or create it ---
create or replace function public.get_or_create_dm(other_user uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  key text;
  existing_id uuid;
  new_id uuid;
begin
  if me is null then
    raise exception 'Not authenticated';
  end if;
  if me = other_user then
    raise exception 'Cannot DM yourself';
  end if;

  -- deterministic key so (a,b) and (b,a) map to the same conversation
  key := (select string_agg(u::text, '_' order by u)
          from unnest(array[me, other_user]) as u);

  select id into existing_id from channels where dm_key = key;
  if existing_id is not null then
    return existing_id;
  end if;

  insert into channels (name, is_dm, dm_key, created_by)
  values ('Direct message', true, key, me)
  returning id into new_id;

  insert into channel_members (channel_id, user_id) values (new_id, me);
  insert into channel_members (channel_id, user_id) values (new_id, other_user);

  return new_id;
end;
$$;

-- 7. RPC: get_my_chats — chat list with last message + unread count -
create or replace function public.get_my_chats()
returns table (
  channel_id uuid,
  name text,
  topic text,
  cover_url text,
  is_group boolean,
  is_dm boolean,
  other_user_id uuid,
  other_username text,
  other_display_name text,
  other_avatar_url text,
  other_status text,
  last_message text,
  last_message_at timestamptz,
  unread_count bigint
)
language sql
security definer
set search_path = public
as $$
  select
    c.id,
    c.name,
    c.topic,
    c.cover_url,
    c.is_group,
    c.is_dm,
    op.id,
    op.username,
    op.display_name,
    op.avatar_url,
    op.status,
    (select m.content from messages m where m.channel_id = c.id order by m.created_at desc limit 1),
    c.last_message_at,
    (select count(*) from messages m
       where m.channel_id = c.id
         and m.sender_id <> auth.uid()
         and m.created_at > coalesce(
           (select cr.last_read_at from channel_reads cr
              where cr.channel_id = c.id and cr.user_id = auth.uid()),
           'epoch'::timestamptz
         ))
  from channels c
  join channel_members cm on cm.channel_id = c.id and cm.user_id = auth.uid()
  left join channel_members other_cm on other_cm.channel_id = c.id and other_cm.user_id <> auth.uid() and c.is_dm
  left join profiles op on op.id = other_cm.user_id
  order by c.last_message_at desc nulls last;
$$;

-- 8. RPC: mark_channel_read — update my read cursor ----------------
create or replace function public.mark_channel_read(p_channel_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  insert into channel_reads (channel_id, user_id, last_read_at)
  values (p_channel_id, auth.uid(), now())
  on conflict (channel_id, user_id) do update set last_read_at = now();
$$;

-- 9. Realtime for the new interactive tables -----------------------
alter publication supabase_realtime add table message_reactions;
alter publication supabase_realtime add table channel_members;
