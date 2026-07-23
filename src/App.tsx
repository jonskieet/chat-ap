import { useEffect, useRef } from 'react'
import { Route, Routes, useLocation, useNavigationType } from 'react-router-dom'
import Home from './pages/Home'
import ChatsList from './pages/ChatsList'
import ChannelDetail from './pages/ChannelDetail'
import Profile from './pages/Profile'
import PostDetail from './pages/PostDetail'
import SavedPosts from './pages/SavedPosts'
import Notifications from './pages/Notifications'
import Login from './pages/Login'
import RequireAuth from './components/RequireAuth'
import RedirectIfAuthed from './components/RedirectIfAuthed'

export default function App() {
  const location = useLocation()
  const navigationType = useNavigationType()
  const prevPathnameRef = useRef(location.pathname)

  // Home <-> PostDetail đã có hiệu ứng shared-element riêng (View Transitions API, xem
  // Home.tsx/PostDetail.tsx) — bỏ qua slide CSS ở đây cho cặp route này để tránh chạy
  // 2 animation chồng lên nhau.
  const isPostDetailTransition =
    location.pathname.startsWith('/post/') || prevPathnameRef.current.startsWith('/post/')

  // PUSH (navigate('/x')) => đi sâu hơn => slide vào từ phải.
  // POP (navigate(-1), nút back trình duyệt) => quay lại => slide vào từ trái.
  // REPLACE (vd redirect ở RequireAuth/RedirectIfAuthed) => không animation, tránh giật.
  const directionClass = isPostDetailTransition
    ? ''
    : navigationType === 'PUSH'
      ? 'page-slide-forward'
      : navigationType === 'POP'
        ? 'page-slide-back'
        : ''

  useEffect(() => {
    prevPathnameRef.current = location.pathname
  }, [location.pathname])

  return (
    // overflow-hidden để trang đang slide vào không tràn ra ngoài khung điện thoại
    <div className="page-transition-viewport">
      <div key={location.pathname} className={directionClass}>
        <Routes location={location}>
          <Route
            path="/"
            element={
              <RequireAuth>
                <Home />
              </RequireAuth>
            }
          />
          <Route
            path="/login"
            element={
              <RedirectIfAuthed>
                <Login />
              </RedirectIfAuthed>
            }
          />
          <Route
            path="/chats"
            element={
              <RequireAuth>
                <ChatsList />
              </RequireAuth>
            }
          />
          <Route
            path="/chats/:channelId"
            element={
              <RequireAuth>
                <ChannelDetail />
              </RequireAuth>
            }
          />
          <Route
            path="/profile/:username"
            element={
              <RequireAuth>
                <Profile />
              </RequireAuth>
            }
          />
          <Route
            path="/saved"
            element={
              <RequireAuth>
                <SavedPosts />
              </RequireAuth>
            }
          />
          <Route
            path="/notifications"
            element={
              <RequireAuth>
                <Notifications />
              </RequireAuth>
            }
          />
          <Route path="/post/:postId" element={<PostDetail />} />
        </Routes>
      </div>
    </div>
  )
}