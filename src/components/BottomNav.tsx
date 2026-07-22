import { Home, MessageCircle, Plus, User } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

export default function BottomNav() {
  const navigate = useNavigate()
  return (
    <div className="absolute bottom-0 left-0 right-0 px-6 pb-6 pt-3 bg-gradient-to-t from-[var(--bg)] via-[var(--bg)]/95 to-transparent">
      <div className="flex items-center justify-between bg-[var(--surface)]/90 backdrop-blur border border-[var(--border)] rounded-full px-5 py-3">
        <button
          onClick={() => navigate('/chats')}
          className="text-[var(--text)] focus-ring rounded-full p-1"
          aria-label="Trang chủ"
        >
          <Home size={20} />
        </button>
        <button
          onClick={() => navigate('/chats')}
          className="flex items-center gap-1.5 text-[var(--text)] focus-ring rounded-full p-1"
          aria-label="Chats"
        >
          <MessageCircle size={20} />
          <span className="text-sm font-medium">Chats</span>
        </button>
        <button
          className="gradient-nova rounded-full p-2 text-white focus-ring"
          aria-label="Tạo mới"
        >
          <Plus size={18} />
        </button>
        <button
          onClick={() => navigate('/profile/annblack')}
          className="text-[var(--text-dim)] focus-ring rounded-full p-1"
          aria-label="Hồ sơ"
        >
          <User size={20} />
        </button>
      </div>
    </div>
  )
}
