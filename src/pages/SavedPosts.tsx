import { useEffect, useState } from 'react'
import { ArrowLeft, Heart, Star } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import PhoneShell from '../components/PhoneShell'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import type { Post, ReactionEmotion } from '../types'

export default function SavedPosts() {
  const navigate = useNavigate()
  const { user, profile: me } = useAuth()
  const { showToast } = useToast()
  const [posts, setPosts] = useState<Post[]>([])
  const [loading, setLoading] = useState(true)

  async function load() {
    if (!me) return
    setLoading(true)

    // saved_posts chỉ lưu post_id — join sang posts (kèm tác giả) qua 1 query duy nhất
    const { data, error } = await supabase
      .from('saved_posts')
      .select('post_id, created_at, post:posts(*, author:profiles!posts_author_id_fkey(*))')
      .eq('user_id', me.id)
      .order('created_at', { ascending: false })

    if (error) {
      console.error(error)
      showToast('Không tải được danh sách bài đã lưu', 'error')
      setLoading(false)
      return
    }

    const list = ((data ?? []) as unknown as { post: Post | null }[])
      .map((row) => row.post)
      .filter((p): p is Post => !!p)

    const ids = list.map((p) => p.id)
    let reactionsByPost: Record<string, { user_id: string; emotion: ReactionEmotion }[]> = {}
    if (ids.length) {
      const { data: allReactions } = await supabase
        .from('post_reactions')
        .select('post_id, user_id, emotion')
        .in('post_id', ids)
      for (const r of allReactions ?? []) {
        const key = r.post_id as string
        reactionsByPost[key] = [...(reactionsByPost[key] ?? []), { user_id: r.user_id, emotion: r.emotion as ReactionEmotion }]
      }
    }

    const uid = user?.id
    const enriched = list.map((p) => {
      const counts: Partial<Record<ReactionEmotion, number>> = {}
      let mine: ReactionEmotion | null = null
      for (const r of reactionsByPost[p.id] ?? []) {
        counts[r.emotion] = (counts[r.emotion] ?? 0) + 1
        if (r.user_id === uid) mine = r.emotion
      }
      return { ...p, reaction_counts: counts, my_reaction: mine }
    })

    setPosts(enriched)
    setLoading(false)
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me?.id])

  async function unsave(postId: string) {
    if (!me) return
    // optimistic: bỏ khỏi danh sách ngay
    setPosts((prev) => prev.filter((p) => p.id !== postId))
    const { error } = await supabase.from('saved_posts').delete().eq('post_id', postId).eq('user_id', me.id)
    if (error) {
      console.error(error)
      showToast('Không thể bỏ lưu bài viết, thử lại nhé', 'error')
      load() // khôi phục danh sách đúng từ server
    } else {
      showToast('Đã bỏ lưu bài viết', 'success')
    }
  }

  return (
    <PhoneShell>
      <div className="flex items-center gap-3 px-5 pt-6 pb-4 shrink-0">
        <button onClick={() => navigate(-1)} className="p-2 -ml-2 rounded-full focus-ring" aria-label="Quay lại">
          <ArrowLeft size={18} />
        </button>
        <h1 className="font-display text-2xl font-bold">Bài đã lưu</h1>
      </div>

      <div className="flex-1 overflow-y-auto px-5 pb-10 space-y-4">
        {loading && (
          <>
            <div className="h-40 rounded-2xl skeleton-glass" />
            <div className="h-40 rounded-2xl skeleton-glass" />
          </>
        )}

        {!loading && posts.length === 0 && (
          <div className="text-center py-16">
            <Star size={28} className="mx-auto mb-3 text-[var(--text-dim)]" />
            <p className="font-display font-bold text-lg mb-1">Chưa lưu bài viết nào</p>
            <p className="text-sm text-[var(--text-dim)]">
              Bấm biểu tượng ngôi sao trên một bài viết để lưu lại xem sau.
            </p>
          </div>
        )}

        {!loading &&
          posts.map((post) => (
            <button
              key={post.id}
              onClick={() => navigate(`/post/${post.id}`)}
              className="relative w-full text-left rounded-2xl overflow-hidden bg-[var(--surface)] min-h-[160px] flex flex-col justify-end focus-ring"
            >
              {post.media_url ? (
                <img src={post.media_url} className="absolute inset-0 w-full h-full object-cover" />
              ) : (
                <div className="absolute inset-0 gradient-flame opacity-70" />
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent" />

              <div className="absolute top-3 left-3 flex items-center gap-2">
                <div className="w-7 h-7 rounded-full bg-[var(--surface-2)] border border-white/20 overflow-hidden flex items-center justify-center text-[11px] font-semibold">
                  {post.author?.avatar_url ? (
                    <img src={post.author.avatar_url} className="w-full h-full object-cover" />
                  ) : (
                    post.author?.username?.slice(0, 1).toUpperCase()
                  )}
                </div>
                <span className="text-xs font-semibold bg-black/40 rounded-full px-2.5 py-1">
                  @{post.author?.username ?? 'unknown'}
                </span>
              </div>

              <button
                onClick={(e) => {
                  e.stopPropagation()
                  unsave(post.id)
                }}
                aria-label="Bỏ lưu bài viết"
                className="absolute top-3 right-3 w-8 h-8 rounded-full bg-white/10 backdrop-blur-md border border-white/15 flex items-center justify-center focus-ring"
              >
                <Star size={15} className="fill-white text-white" />
              </button>

              <div className="relative px-4 pb-3.5">
                {post.caption && (
                  <p className="font-display font-bold text-base leading-tight text-white mb-1.5 line-clamp-2">
                    {post.caption}
                  </p>
                )}
                <div className="flex items-center gap-1.5 text-white/70">
                  <Heart size={13} className={post.my_reaction ? 'fill-white text-white' : ''} />
                  <span className="text-xs font-medium">
                    {Object.values(post.reaction_counts ?? {}).reduce((a, b) => a + (b ?? 0), 0)}
                  </span>
                </div>
              </div>
            </button>
          ))}
      </div>
    </PhoneShell>
  )
}
