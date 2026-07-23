import { useEffect, useState } from 'react'
import { Heart, X } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import type { Profile } from '../types'

interface ViewerRow {
  viewer_id: string
  viewed_at: string
  viewer: Profile | null
}

interface LikeRow {
  user_id: string
  created_at: string
  user: Profile | null
}

interface Person {
  id: string
  username: string
  display_name: string | null
  avatar_url: string | null
  at: string
  liked: boolean
}

export default function StoryViewersSheet({ storyId, onClose }: { storyId: string; onClose: () => void }) {
  const navigate = useNavigate()
  const [people, setPeople] = useState<Person[]>([])
  const [likeCount, setLikeCount] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function load() {
      const [viewsRes, likesRes] = await Promise.all([
        supabase
          .from('story_views')
          .select('viewer_id, viewed_at, viewer:profiles!story_views_viewer_id_fkey(*)')
          .eq('story_id', storyId)
          .order('viewed_at', { ascending: false }),
        supabase
          .from('story_likes')
          .select('user_id, created_at, user:profiles!story_likes_user_id_fkey(*)')
          .eq('story_id', storyId),
      ])
      if (cancelled) return

      const views = (viewsRes.data as unknown as ViewerRow[] | null) ?? []
      const likes = (likesRes.data as unknown as LikeRow[] | null) ?? []
      const likedIds = new Set(likes.map((l) => l.user_id))

      const merged: Person[] = views
        .filter((v) => v.viewer)
        .map((v) => ({
          id: v.viewer_id,
          username: v.viewer!.username,
          display_name: v.viewer!.display_name,
          avatar_url: v.viewer!.avatar_url,
          at: v.viewed_at,
          liked: likedIds.has(v.viewer_id),
        }))

      // Người đã thích nhưng chưa có bản ghi story_views (hiếm, phòng khi lệch dữ liệu) vẫn hiển thị
      for (const l of likes) {
        if (!l.user || merged.some((p) => p.id === l.user_id)) continue
        merged.push({
          id: l.user_id,
          username: l.user.username,
          display_name: l.user.display_name,
          avatar_url: l.user.avatar_url,
          at: l.created_at,
          liked: true,
        })
      }

      merged.sort((a, b) => {
        if (a.liked !== b.liked) return a.liked ? -1 : 1
        return new Date(b.at).getTime() - new Date(a.at).getTime()
      })

      setPeople(merged)
      setLikeCount(likedIds.size)
      setLoading(false)
    }
    load()
    return () => {
      cancelled = true
    }
  }, [storyId])

  return (
    <div className="absolute inset-0 z-50 bg-black/60 backdrop-blur-sm flex flex-col justify-end" onClick={onClose}>
      <div
        className="bg-[var(--surface)] rounded-t-3xl max-h-[75%] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 pt-4 pb-1 shrink-0">
          <div>
            <h2 className="font-display font-bold text-lg">Người xem tin</h2>
            <p className="text-xs text-[var(--text-dim)]">
              {people.length} lượt xem{likeCount > 0 ? ` · ${likeCount} lượt thích` : ''}
            </p>
          </div>
          <button onClick={onClose} aria-label="Đóng" className="w-8 h-8 rounded-full bg-[var(--surface-2)] flex items-center justify-center focus-ring">
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-2 space-y-1 min-h-[160px]">
          {loading && <p className="text-center text-xs text-[var(--text-dim)] py-6">Đang tải...</p>}
          {!loading && people.length === 0 && (
            <p className="text-center text-xs text-[var(--text-dim)] py-6">Chưa có ai xem tin này</p>
          )}
          {!loading &&
            people.map((p) => (
              <button
                key={p.id}
                onClick={() => {
                  onClose()
                  navigate(`/profile/${p.username}`)
                }}
                className="w-full flex items-center gap-3 px-2 py-2 rounded-2xl focus-ring hover:bg-[var(--surface-2)] transition"
              >
                <div className="w-11 h-11 rounded-full bg-[var(--surface-2)] overflow-hidden flex items-center justify-center text-sm font-semibold shrink-0">
                  {p.avatar_url ? <img src={p.avatar_url} className="w-full h-full object-cover" /> : p.username.slice(0, 1).toUpperCase()}
                </div>
                <div className="flex-1 text-left min-w-0">
                  <p className="text-sm font-semibold truncate">{p.display_name ?? p.username}</p>
                  <p className="text-xs text-[var(--text-dim)] truncate">@{p.username}</p>
                </div>
                {p.liked && <Heart size={16} className="text-[#ff4f9a] fill-[#ff4f9a] shrink-0" />}
              </button>
            ))}
        </div>
      </div>
    </div>
  )
}
