-- ============================================================
-- 004 — Chủ đề quan tâm (profile interests) + tạo cộng đồng từ app
-- Chạy sau 003_verify_and_seed.sql. Idempotent.
-- ============================================================

-- 1. PROFILES: thêm danh sách chủ đề quan tâm của user ----------
alter table profiles add column if not exists interests text[] not null default '{}';

-- 2. RPC: create_channel — tạo 1 channel/topic mới + tự join làm thành viên
create or replace function public.create_channel(p_name text, p_topic text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  clean_name text := trim(p_name);
  new_id uuid;
begin
  if me is null then
    raise exception 'Not authenticated';
  end if;
  if clean_name = '' or clean_name is null then
    raise exception 'Tên cộng đồng không được để trống';
  end if;
  if length(clean_name) > 40 then
    raise exception 'Tên cộng đồng tối đa 40 ký tự';
  end if;

  insert into channels (name, topic, is_group, created_by)
  values (clean_name, nullif(trim(coalesce(p_topic, '')), ''), true, me)
  returning id into new_id;

  insert into channel_members (channel_id, user_id) values (new_id, me);

  return new_id;
end;
$$;

-- 3. RPC: suggested_channels — communities gợi ý theo interests của user,
--    fallback về channel mới nhất nếu chưa có match / chưa đăng nhập.
create or replace function public.suggested_channels(p_limit int default 8)
returns setof channels
language sql
security definer
set search_path = public
as $$
  select c.*
  from channels c
  where c.is_group = true
  order by
    case
      when auth.uid() is not null and exists (
        select 1
        from profiles p, unnest(p.interests) as interest
        where p.id = auth.uid()
          and (c.topic ilike '%' || interest || '%' or c.name ilike '%' || interest || '%')
      ) then 0
      else 1
    end,
    c.last_message_at desc nulls last,
    c.created_at desc
  limit p_limit;
$$;
