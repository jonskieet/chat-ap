import { Navigate, Route, Routes } from 'react-router-dom'
import ChatsList from './pages/ChatsList'
import ChannelDetail from './pages/ChannelDetail'
import Profile from './pages/Profile'
import Login from './pages/Login'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/chats" replace />} />
      <Route path="/login" element={<Login />} />
      <Route path="/chats" element={<ChatsList />} />
      <Route path="/chats/:channelId" element={<ChannelDetail />} />
      <Route path="/profile/:username" element={<Profile />} />
    </Routes>
  )
}
