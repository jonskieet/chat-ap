import { MessageCircle, Plus, User } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

function HomeIcon({ size = 20 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3.5 10.5c0-1.4 0-2.1.32-2.68.31-.58.9-.94 2.06-1.66l3.5-2.19c1.29-.8 1.93-1.2 2.62-1.2s1.33.4 2.62 1.2l3.5 2.19c1.17.72 1.75 1.08 2.06 1.66.32.58.32 1.28.32 2.68v3.87c0 2.5 0 3.75-.77 4.53-.78.78-2.03.78-4.53.78H9c-2.5 0-3.75 0-4.53-.78-.77-.78-.77-2.03-.77-4.53z" />
    </svg>
  )
}

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
          <HomeIcon size={20} />
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
