import { useEffect, useState } from 'react'
import { ArrowLeft, Heart, Share2, Star, X } from 'lucide-react'
import { useNavigate, useParams } from 'react-router-dom'
import PhoneShell from '../components/PhoneShell'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import type { Post, ReactionEmotion } from '../types'

export default function PostDetail() {
  const { postId } = useParams()
  const navigate = useNavigate()
  const { user, profile: me } = useAuth()
  const [post, setPost] = useState<Post | null>(null)
  const [notFound, setNotFound] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saved, setSaved] = useState(false)

  async function load() {
    if (!postId) return
    setLoading(true)
    setNotFound(false)

    const { data, error } = await supabase
      .from('posts')
      .select('*, author:profiles!posts_author_id_fkey(*)')
      .eq('id', postId)
      .maybeSingle()

    if (error) console.error(error)
    if (!data) {
      setNotFound(true)
      setLoading(false)
      return
    }

    const { data: reactions } = await supabase
      .from('post_reactions')
      .select('user_id, emotion')
      .eq('post_id', postId)

    const counts: Partial<Record<ReactionEmotion, number>> = {}
    let mine: ReactionEmotion | null = null
    for (const r of reactions ?? []) {
      const emo = r.emotion as ReactionEmotion
      counts[emo] = (counts[emo] ?? 0) + 1
      if (r.user_id === user?.id) mine = emo
    }
    setPost({ ...(data as unknown as Post), reaction_counts: counts, my_reaction: mine })

    if (me) {
      const { data: savedRow } = await supabase
        .from('saved_posts')
        .select('post_id')
        .eq('post_id', postId)
        .eq('user_id', me.id)
        .maybeSingle()
      setSaved(!!savedRow)
    }

    setLoading(false)
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [postId])

  async function handleReact(emotion: ReactionEmotion | null) {
    if (!me || !post) return navigate('/login')
    if (emotion === null) {
      await supabase.from('post_reactions').delete().eq('post_id', post.id).eq('user_id', me.id)
    } else if (post.my_reaction) {
      await supabase.from('post_reactions').update({ emotion }).eq('post_id', post.id).eq('user_id', me.id)
    } else {
      await supabase.from('post_reactions').insert({ post_id: post.id, user_id: me.id, emotion })
    }
    load()
  }

  async function toggleSaved() {
    if (!me || !post) return navigate('/login')
    const next = !saved
    setSaved(next) // optimistic
    if (next) {
      const { error } = await supabase.from('saved_posts').insert({ post_id: post.id, user_id: me.id })
      if (error) {
        console.error(error)
        setSaved(false)
      }
    } else {
      const { error } = await supabase.from('saved_posts').delete().eq('post_id', post.id).eq('user_id', me.id)
      if (error) {
        console.error(error)
        setSaved(true)
      }
    }
  }

  async function sharePost() {
    if (!post) return
    const url = `${window.location.origin}/post/${post.id}`
    if (navigator.share) {
      try {
        await navigator.share({ title: post.author?.username ? `@${post.author.username}` : 'Bài viết', text: post.caption ?? '', url })
      } catch {
        // người dùng huỷ share, bỏ qua
      }
    } else {
      await navigator.clipboard.writeText(url)
    }
  }

  return (
    <PhoneShell>
      <div className="flex-1 overflow-y-auto">
        <div className="relative min-h-[100dvh] flex flex-col justify-end bg-[var(--surface)]">
          <button
            onClick={() => navigate(-1)}
            aria-label="Quay lại"
            className="absolute top-3 left-3 z-10 w-9 h-9 rounded-full bg-black/40 backdrop-blur-md flex items-center justify-center focus-ring"
          >
            <ArrowLeft size={18} className="text-white" />
          </button>

          {loading ? (
            <div className="absolute inset-0 skeleton-glass" />
          ) : notFound || !post ? (
            <div className="flex-1 flex flex-col items-center justify-center px-8 text-center gap-3 min-h-[100dvh]">
              <p className="font-display font-bold text-lg">Không tìm thấy bài viết</p>
              <p className="text-sm text-[var(--text-dim)]">
                Bài viết này có thể đã bị xoá, hoặc bạn không có quyền xem.
              </p>
              <button
                onClick={() => navigate('/')}
                className="mt-2 gradient-nova text-black font-bold rounded-full px-6 py-2.5 focus-ring"
              >
                Về trang chủ
              </button>
            </div>
          ) : (
            <>
              {post.media_url ? (
                <img src={post.media_url} className="absolute inset-0 w-full h-full object-cover" />
              ) : (
                <div className="absolute inset-0 gradient-flame opacity-70" />
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent" />

              <div className="absolute top-3 right-3 flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-[var(--surface-2)] border border-white/20 overflow-hidden flex items-center justify-center text-xs font-semibold">
                  {post.author?.avatar_url ? (
                    <img src={post.author.avatar_url} className="w-full h-full object-cover" />
                  ) : (
                    post.author?.username?.slice(0, 1).toUpperCase()
                  )}
                </div>
                <button
                  onClick={() => post.author?.username && navigate(`/profile/${post.author.username}`)}
                  className="text-xs font-semibold bg-black/40 rounded-full px-2.5 py-1 focus-ring"
                >
                  @{post.author?.username ?? 'unknown'}
                </button>
              </div>

              <div className="relative px-4 pb-8">
                {post.caption && (
                  <p className="font-display font-bold text-2xl leading-tight text-white mb-3">{post.caption}</p>
                )}

                {(post.author?.interests?.length ?? 0) > 0 && (
                  <div className="flex flex-wrap gap-2 mb-4">
                    {post.author!.interests.slice(0, 4).map((tag) => (
                      <span
                        key={tag}
                        className="text-xs font-medium bg-white/15 backdrop-blur-sm border border-white/10 rounded-full px-3 py-1.5"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}

                <div className="flex items-center gap-3">
                  <button
                    onClick={() => navigate(-1)}
                    aria-label="Đóng"
                    className="w-12 h-12 shrink-0 rounded-full bg-white/10 backdrop-blur-md border border-white/15 flex items-center justify-center focus-ring"
                  >
                    <X size={20} className="text-white" />
                  </button>
                  <button
                    onClick={toggleSaved}
                    aria-label="Lưu bài viết"
                    className="w-12 h-12 shrink-0 rounded-full bg-white/10 backdrop-blur-md border border-white/15 flex items-center justify-center focus-ring"
                  >
                    <Star size={19} className={saved ? 'fill-white text-white' : 'text-white'} />
                  </button>
                  <button
                    onClick={sharePost}
                    aria-label="Chia sẻ bài viết"
                    className="w-12 h-12 shrink-0 rounded-full bg-white/10 backdrop-blur-md border border-white/15 flex items-center justify-center focus-ring"
                  >
                    <Share2 size={18} className="text-white" />
                  </button>
                  <button
                    onClick={() => handleReact(post.my_reaction === 'love' ? null : 'love')}
                    aria-label="Thích bài viết"
                    className="flex-1 h-12 rounded-full flex items-center justify-center gap-2 focus-ring shadow-[0_4px_18px_rgba(255,90,120,0.45)]"
                    style={{ background: 'linear-gradient(135deg, #ff8a5c 0%, #ff5e8f 55%, #ff4f9a 100%)' }}
                  >
                    <Heart size={19} className={post.my_reaction === 'love' ? 'fill-white text-white' : 'text-white'} />
                    <span className="text-sm font-bold text-white">
                      {Object.values(post.reaction_counts ?? {}).reduce((a, b) => a + (b ?? 0), 0)}
                    </span>
                  </button>
                </div>

                <p className="text-[11px] text-white/50 mt-3">
                  {new Date(post.created_at).toLocaleDateString('vi-VN')}
                </p>
              </div>
            </>
          )}
        </div>
      </div>
    </PhoneShell>
  )
}