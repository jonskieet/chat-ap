import { useEffect } from 'react'
import { useState } from 'react'
import { ArrowLeft, Flame, Heart, MessageSquare, Smile } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import PhoneShell from '../components/PhoneShell'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import type { AppNotification, ReactionEmotion } from '../types'

const REACTION_EMOJI: Record<ReactionEmotion, string> = {
  love: '❤️',
  fire: '🔥',
  haha: '😂',
  wow: '😮',
  sad: '😢',
}

function describe(n: AppNotification): string {
  const who = n.actor?.display_name || (n.actor?.username ? `@${n.actor.username}` : 'Ai đó')
  if (n.type === 'message') return `${who} đã gửi cho bạn một tin nhắn mới`
  if (n.type === 'post_reaction') return `${who} đã bày tỏ cảm xúc ${n.emotion ? REACTION_EMOJI[n.emotion] : ''} với bài viết của bạn`
  return `${who} đã thả cảm xúc ${n.emotion ? REACTION_EMOJI[n.emotion] : ''} cho tin nhắn của bạn`
}

function iconFor(type: AppNotification['type']) {
  if (type === 'message') return MessageSquare
  if (type === 'post_reaction') return Heart
  return Smile
}

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diffMs / 60000)
  if (mins < 1) return 'vừa xong'
  if (mins < 60) return `${mins} phút trước`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours} giờ trước`
  const days = Math.floor(hours / 24)
  return `${days} ngày trước`
}

export default function Notifications() {
  const navigate = useNavigate()
  const { profile: me } = useAuth()
  const { showToast } = useToast()
  const [items, setItems] = useState<AppNotification[]>([])
  const [loading, setLoading] = useState(true)

  async function load() {
    if (!me) return
    setLoading(true)
    const { data, error } = await supabase
      .from('notifications')
      .select('*, actor:profiles!notifications_actor_id_fkey(*)')
      .eq('user_id', me.id)
      .order('created_at', { ascending: false })
      .limit(50)

    if (error) {
      console.error(error)
      showToast('Không tải được thông báo', 'error')
      setLoading(false)
      return
    }
    setItems((data as unknown as AppNotification[]) ?? [])
    setLoading(false)

    await supabase.rpc('mark_notifications_read')
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me?.id])

  function openNotification(n: AppNotification) {
    if (n.type === 'message' && n.channel_id) {
      navigate(`/chats/${n.channel_id}`)
    } else if (n.type === 'post_reaction' && n.post_id) {
      navigate(`/post/${n.post_id}`)
    } else if (n.type === 'message_reaction' && n.channel_id) {
      navigate(`/chats/${n.channel_id}`)
    }
  }

  return (
    <PhoneShell>
      <div className="flex items-center gap-3 px-5 pt-6 pb-4 shrink-0">
        <button onClick={() => navigate(-1)} className="p-2 -ml-2 rounded-full focus-ring" aria-label="Quay lại">
          <ArrowLeft size={18} />
        </button>
        <h1 className="font-display text-2xl font-bold">Thông báo</h1>
      </div>

      <div className="flex-1 overflow-y-auto px-5 pb-10 space-y-2">
        {loading && (
          <>
            <div className="h-16 rounded-2xl skeleton-glass" />
            <div className="h-16 rounded-2xl skeleton-glass" />
            <div className="h-16 rounded-2xl skeleton-glass" />
          </>
        )}

        {!loading && items.length === 0 && (
          <div className="text-center py-16">
            <Flame size={28} className="mx-auto mb-3 text-[var(--text-dim)]" />
            <p className="font-display font-bold text-lg mb-1">Chưa có thông báo nào</p>
            <p className="text-sm text-[var(--text-dim)]">Tin nhắn mới và lượt thả cảm xúc sẽ xuất hiện ở đây.</p>
          </div>
        )}

        {!loading &&
          items.map((n) => {
            const Icon = iconFor(n.type)
            return (
              <button
                key={n.id}
                onClick={() => openNotification(n)}
                className={`w-full text-left flex items-center gap-3 rounded-2xl border px-4 py-3.5 focus-ring transition-colors ${
                  n.read ? 'border-[var(--border)] bg-[var(--surface)]' : 'border-white/15 bg-[var(--surface-2)]'
                }`}
              >
                <div className="relative w-10 h-10 shrink-0 rounded-full bg-[var(--surface-2)] border border-[var(--border)] overflow-hidden flex items-center justify-center text-sm font-semibold">
                  {n.actor?.avatar_url ? (
                    <img src={n.actor.avatar_url} className="w-full h-full object-cover" />
                  ) : (
                    n.actor?.username?.slice(0, 1).toUpperCase()
                  )}
                  <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-[var(--bg)] border border-[var(--border)] flex items-center justify-center">
                    <Icon size={11} />
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm leading-snug">{describe(n)}</p>
                  <p className="text-[11px] text-[var(--text-dim)] mt-0.5">{timeAgo(n.created_at)}</p>
                </div>
                {!n.read && <span className="w-2 h-2 rounded-full shrink-0" style={{ background: 'var(--online)' }} />}
              </button>
            )
          })}
      </div>
    </PhoneShell>
  )
}
