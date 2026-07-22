# Chat App — Topic-based social chat (React + Supabase)

Web app mobile-first, dark mode, giao diện lấy cảm hứng từ mockup 3 màn hình:
**Chats list → Channel detail (#art) → Profile**.

## Stack
- React 19 + Vite + TypeScript
- Tailwind CSS v4 (qua `@tailwindcss/vite`, không cần file config riêng)
- react-router-dom (routing)
- Supabase: Auth, Postgres, Realtime, Storage
- lucide-react (icon)

## Cấu trúc
```
src/
  components/PhoneShell.tsx   # khung điện thoại bọc mọi trang
  components/BottomNav.tsx    # thanh điều hướng dưới cùng
  pages/ChatsList.tsx         # màn "Chats" — tabs, story avatars, People, Communities
  pages/ChannelDetail.tsx     # màn "#art" — header cover, bubble chat, realtime
  pages/Profile.tsx           # màn hồ sơ — stats, bio, tag, grid Chats
  pages/Login.tsx             # đăng nhập / đăng ký qua Supabase Auth
  lib/supabaseClient.ts       # khởi tạo Supabase client
  types/index.ts              # type khớp với schema DB
supabase/schema.sql           # toàn bộ bảng + RLS + realtime + storage bucket
```

## 1. Chạy local

```bash
npm install
cp .env.example .env
# điền VITE_SUPABASE_URL và VITE_SUPABASE_ANON_KEY vào .env
npm run dev
```

## 2. Setup Supabase

1. Tạo project tại supabase.com.
2. Vào **SQL Editor**, dán toàn bộ nội dung `supabase/schema.sql` và chạy.
   File này tạo:
   - Bảng `profiles`, `channels`, `channel_members`, `messages`, `follows`
   - RLS policy cho từng bảng (đọc công khai, ghi/sửa/xoá chỉ chính chủ)
   - Bật Realtime cho bảng `messages`
   - Storage bucket `avatars` và `attachments` (public) + policy upload
3. Vào **Authentication → Providers**, bật Email (mặc định đã bật).
4. Lấy `Project URL` và `anon public key` ở **Settings → API**, điền vào `.env`.

> Muốn test nhanh: tạo vài dòng mẫu trong `channels` (name = "art",
> topic = "A still of the character Tommy Shelby...") qua Table Editor.

## 3. Deploy lên Render (từ GitHub)

1. Push code lên một GitHub repo.
2. Vào Render → **New +** → **Static Site** → connect repo.
3. Cấu hình:
   - **Build Command**: `npm install && npm run build`
   - **Publish Directory**: `dist`
4. Thêm **Environment Variables**:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
5. Deploy. Mỗi lần push lên GitHub, Render tự build & deploy lại (auto-deploy).

Vì đây là site tĩnh (SPA dùng react-router), thêm **Rewrite Rule** trên Render:
Source `/*` → Destination `/index.html` → Action `Rewrite`
(để refresh trang `/chats/:id` không bị 404).

## Việc còn cần làm (chưa nằm trong lần triển khai này)

- Upload ảnh đính kèm/avatar qua Supabase Storage (mới có schema + bucket,
  chưa có UI upload trong `ChannelDetail`/`Profile`).
- Trang tạo channel mới (nút `+` ở BottomNav hiện chưa mở form).
- Presence "online" thời gian thực (mới có cột `status` tĩnh trong DB).
- Bảo vệ route: chưa có middleware redirect `/login` khi chưa đăng nhập.
