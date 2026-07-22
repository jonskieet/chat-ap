-- ============================================================
-- 003 — Verify backend + seed sample "chủ đề" (channels/topics)
-- Chạy SAU schema.sql và 002_chat_backend_upgrade.sql
-- An toàn chạy nhiều lần (idempotent)
-- ============================================================

-- 1. KIỂM TRA nhanh: các bảng / cột / hàm bắt buộc phải tồn tại
do $$
begin
  if to_regclass('public.channels') is null then
    raise exception 'Thiếu bảng channels — hãy chạy supabase/schema.sql trước';
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_name = 'channels' and column_name = 'is_dm'
  ) then
    raise exception 'Thiếu cột channels.is_dm — hãy chạy 002_chat_backend_upgrade.sql trước';
  end if;
  if to_regprocedure('public.get_or_create_dm(uuid)') is null then
    raise exception 'Thiếu function get_or_create_dm — hãy chạy 002_chat_backend_upgrade.sql trước';
  end if;
  if to_regprocedure('public.get_my_chats()') is null then
    raise exception 'Thiếu function get_my_chats — hãy chạy 002_chat_backend_upgrade.sql trước';
  end if;
  raise notice 'OK: schema + RPC cần thiết đã tồn tại.';
end $$;

-- 2. SEED chủ đề mẫu (group channels) nếu bảng channels đang rỗng
--    Dùng created_by = user đầu tiên trong hệ thống (nếu có), tránh lỗi FK khi DB mới trống hoàn toàn.
do $$
declare
  seed_user uuid;
begin
  select id into seed_user from public.profiles order by created_at asc limit 1;

  if seed_user is null then
    raise notice 'Chưa có user nào trong profiles — bỏ qua seed, hãy đăng ký 1 tài khoản trước rồi chạy lại phần seed.';
  elsif exists (select 1 from public.channels where is_group = true) then
    raise notice 'Đã có channel group — bỏ qua seed để tránh trùng lặp.';
  else
    insert into public.channels (name, topic, is_group, created_by) values
      ('art',      'Chia sẻ tranh vẽ, thiết kế, nhiếp ảnh',        true, seed_user),
      ('music',    'Bàn luận nhạc, playlist, concert',             true, seed_user),
      ('gaming',   'Trò chuyện về game, tìm đồng đội',             true, seed_user),
      ('food',     'Công thức nấu ăn, review quán ăn',             true, seed_user);

    -- tự động thêm seed_user vào các channel vừa tạo
    insert into public.channel_members (channel_id, user_id)
    select id, seed_user from public.channels where is_group = true;

    raise notice 'Đã seed 4 channel chủ đề mẫu.';
  end if;
end $$;
