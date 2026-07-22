import { useEffect, useState } from 'react'
import { Search } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import PhoneShell from '../components/PhoneShell'
import BottomNav from '../components/BottomNav'
import { supabase } from '../lib/supabaseClient'
import type { Channel } from '../types'

const TABS = ['All', 'Personal', 'Groups', 'Unanswered'] as const

export default function ChatsList() {
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState<(typeof TABS)[number]>('All')
  const [channels, setChannels] = useState<Channel[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      const { data, error } = await supabase
        .from('channels')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(20)
      if (!cancelled) {
        if (error) console.error(error)
        setChannels(data ?? [])
        setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [])

  const communities = [
    { name: 'Games', emoji: '🎮' },
    { name: 'Art', emoji: '🎨' },
    { name: 'Technology', emoji: '💻' },
    { name: 'Humor', emoji: '😂' },
  ]

  return (
    <PhoneShell>
      <div className="flex-1 overflow-y-auto px-5 pt-6 pb-32">
        <div className="flex items-center justify-between mb-5">
          <h1 className="font-display text-3xl font-bold">Chats</h1>
          <button className="p-2 rounded-full bg-[var(--surface)] focus-ring" aria-label="Tìm kiếm">
            <Search size={18} />
          </button>
        </div>

        <div className="flex items-center gap-5 mb-6 text-sm">
          {TABS.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`focus-ring rounded-full px-1 pb-1 transition ${
                activeTab === tab
                  ? 'text-white font-semibold border-b-2 border-white'
                  : 'text-[var(--text-dim)]'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Story-style unread avatars */}
        <div className="flex gap-4 overflow-x-auto pb-2 mb-7 -mx-1 px-1">
          {loading &&
            Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="w-16 h-16 rounded-full bg-[var(--surface)] animate-pulse shrink-0" />
            ))}
          {!loading && channels.length === 0 && (
            <p className="text-sm text-[var(--text-dim)]">
              Chưa có cuộc trò chuyện nào. Tạo channel đầu tiên của bạn!
            </p>
          )}
          {channels.slice(0, 6).map((c) => (
            <button
              key={c.id}
              onClick={() => navigate(`/chats/${c.id}`)}
              className="shrink-0 focus-ring rounded-full"
            >
              <div className="w-16 h-16 rounded-full story-ring p-[2px]">
                <div className="w-full h-full rounded-full bg-[var(--surface)] border-2 border-[var(--bg)] overflow-hidden flex items-center justify-center text-lg font-semibold">
                  {c.cover_url ? (
                    <img src={c.cover_url} alt={c.name} className="w-full h-full object-cover" />
                  ) : (
                    c.name.slice(0, 1).toUpperCase()
                  )}
                </div>
              </div>
            </button>
          ))}
        </div>

        <section className="mb-8">
          <h2 className="font-display font-bold text-lg mb-0.5">People</h2>
          <p className="text-xs text-[var(--text-dim)] mb-3">Friends' recommendations</p>
          <div className="flex gap-3 overflow-x-auto -mx-1 px-1">
            {[
              { name: 'Guy Hawkins', role: 'Tech blogger', tag: 'Green Nature Loving', grad: 'gradient-flame' },
              { name: 'Jerome Bell', role: 'Fashion influencer', tag: "It's 2024, learn something new", grad: 'gradient-nova' },
            ].map((p) => (
              <div
                key={p.name}
                className={`relative shrink-0 w-40 h-52 rounded-2xl overflow-hidden p-3 flex flex-col justify-between ${p.grad}`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold bg-black/30 rounded-full px-2 py-1">
                    {p.name}
                  </span>
                  <button className="text-[10px] font-bold bg-black rounded-full px-2 py-1 focus-ring">
                    FOLLOW
                  </button>
                </div>
                <p className="font-display font-bold text-sm leading-tight">{p.tag}</p>
              </div>
            ))}
          </div>
        </section>

        <section>
          <h2 className="font-display font-bold text-lg mb-0.5">Communities</h2>
          <p className="text-xs text-[var(--text-dim)] mb-3">Popular chat rooms</p>
          <div className="grid grid-cols-4 gap-3">
            {communities.map((c) => (
              <button key={c.name} className="flex flex-col items-center gap-2 focus-ring rounded-2xl">
                <div className="w-14 h-14 rounded-full bg-[var(--surface)] border border-[var(--border)] flex items-center justify-center text-xl">
                  {c.emoji}
                </div>
                <span className="text-xs text-[var(--text-dim)]">{c.name}</span>
              </button>
            ))}
          </div>
        </section>
      </div>
      <BottomNav />
    </PhoneShell>
  )
}
