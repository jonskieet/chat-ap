import { Route, Routes } from 'react-router-dom'
import Home from './pages/Home'
import ChatsList from './pages/ChatsList'
import ChannelDetail from './pages/ChannelDetail'
import Profile from './pages/Profile'
import PostDetail from './pages/PostDetail'
import Login from './pages/Login'
import RequireAuth from './components/RequireAuth'
import RedirectIfAuthed from './components/RedirectIfAuthed'

export default function App() {
  return (
    <Routes>
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
      <Route path="/post/:postId" element={<PostDetail />} />
    </Routes>
  )
}