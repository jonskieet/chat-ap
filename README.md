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
  context/AuthContext.tsx     # theo dõi session, cung cấp user/profile/signOut
  components/RequireAuth.tsx  # route guard — đá về /login nếu chưa đăng nhập
  components/RedirectIfAuthed.tsx # đá về / nếu đã đăng nhập mà vào /login
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

## 4. Auth flow

### Tạo tài khoản đầu tiên để test

1. Chạy `npm run dev`, mở app — vì chưa đăng nhập, mọi route (kể cả `/`) sẽ
   tự động đá về `/login`.
2. Bấm "Chưa có tài khoản? Đăng ký", điền **Tên người dùng**, **Email**,
   **Mật khẩu**, rồi bấm "Đăng ký".
3. Nếu project Supabase đang bật **Confirm email** (mặc định là bật), app
   sẽ hiện thông báo "Đăng ký thành công! Vui lòng kiểm tra email để xác
   nhận tài khoản..." — đây là hành vi đúng, không phải lỗi.
4. Vì Supabase free tier mặc định **không gửi được email xác nhận đáng tin
   cậy** (rất dễ vào spam hoặc không tới), cách nhanh nhất để test là xác
   nhận thủ công:
   - Vào Supabase Dashboard → **Authentication → Users**.
   - Tìm user vừa tạo → bấm **"..."** → **Confirm email**.
5. Quay lại app, đăng nhập bằng email/mật khẩu vừa tạo. App sẽ chuyển vào
   trang chủ `/`.

### Tắt "Confirm email" khi dev/test (tuỳ chọn)

Nếu muốn bỏ qua hoàn toàn bước xác nhận email lúc phát triển (signUp sẽ
đăng nhập ngay, không cần xác nhận):

1. Vào Supabase Dashboard → **Authentication → Settings** (hoặc **Providers
   → Email** tuỳ phiên bản dashboard).
2. Tắt tuỳ chọn **"Confirm email"** (Enable email confirmations).
3. Lưu lại. Từ giờ, `supabase.auth.signUp()` sẽ trả về `session` ngay lập
   tức và người dùng được điều hướng thẳng vào `/` sau khi đăng ký.

> Lưu ý: nên bật lại "Confirm email" trước khi đưa app lên production
> thật, để tránh tài khoản giả/spam.

### RequireAuth hoạt động ra sao

- `AuthContext` (`src/context/AuthContext.tsx`) dùng
  `supabase.auth.onAuthStateChange` để theo dõi session real-time, và nạp
  `profile` tương ứng từ bảng `profiles`. Toàn bộ app được bọc trong
  `<AuthProvider>` ở `main.tsx`, nên bất kỳ trang nào cũng gọi được
  `useAuth()` để lấy `{ user, profile, loading, signOut }` mà không cần tự
  gọi `supabase.auth.getUser()` riêng lẻ.
- `RequireAuth` (`src/components/RequireAuth.tsx`) bọc các route cần đăng
  nhập (`/`, `/chats`, `/chats/:id`, `/profile/:username`). Khi
  `loading` còn `true`, nó hiện một màn hình loading đơn giản để tránh
  nhấp nháy trắng; khi đã có kết quả mà không có `user`, nó điều hướng
  `<Navigate to="/login" replace />`.
- `RedirectIfAuthed` (`src/components/RedirectIfAuthed.tsx`) bọc route
  `/login` — nếu người dùng đã đăng nhập mà cố vào `/login`, họ sẽ bị đá
  ngược về `/` thay vì thấy lại form đăng nhập.
- Nút **Đăng xuất** nằm trong trang Profile, chỉ hiện khi đang xem đúng
  hồ sơ của chính người dùng đang đăng nhập (so sánh `user.id` với
  `profile.id`). Bấm vào sẽ gọi `useAuth().signOut()` rồi điều hướng về
  `/login`.

## Việc còn cần làm (chưa nằm trong lần triển khai này)

- Upload ảnh đính kèm/avatar qua Supabase Storage (mới có schema + bucket,
  chưa có UI upload trong `ChannelDetail`/`Profile`).
- Trang tạo channel mới (nút `+` ở BottomNav hiện chưa mở form).
- Presence "online" thời gian thực (mới có cột `status` tĩnh trong DB).
