-- ============================================================
-- Cho phép đăng video trong post (ngoài ảnh)
-- Run in Supabase SQL Editor AFTER 006_post_comments.sql
-- Idempotent: safe to re-run
-- ============================================================

alter table posts add column if not exists media_type text
  check (media_type in ('image', 'video'));

-- Các post cũ đã có sẵn media_url thì mặc định coi là ảnh, để không bị vỡ UI
update posts set media_type = 'image' where media_url is not null and media_type is null;
