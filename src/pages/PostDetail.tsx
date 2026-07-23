import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, Heart, Share2, Star, X } from 'lucide-react'
import { useNavigate, useParams } from 'react-router-dom'
import PhoneShell from '../components/PhoneShell'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import type { Post, ReactionEmotion } from '../types'

export default function PostDetail() {
  const { postId } = useParams()
  const navigate = useNavigate()
  const { user, profile: me } = useAuth()
  const { showToast } = useToast()
  const [post, setPost] = useState<Post | null>(null)
  const [notFound, setNotFound] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saved, setSaved] = useState(false)
  const [poppingHeart, setPoppingHeart] = useState(false)
  const [floatingHeart, setFloatingHeart] = useState(false)
  const lastTapRef = useRef(0)

  async function load() {
    if (!postId) return
    setLoading(true)
    setNotFound(false)

    const { data, error } = await supabase
      .from('posts')
      .select('*, author:profiles!posts_author_id_fkey(*)')
      .eq('id', postId)
      .maybeSingle()

    if (error) {
      console.error(error)
      showToast('Không tải được bài viết, kiểm tra kết nối mạng', 'error')
    }
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

  function applyReactionLocally(prevEmotion: ReactionEmotion | null, nextEmotion: ReactionEmotion | null) {
    setPost((prev) => {
      if (!prev) return prev
      const counts = { ...(prev.reaction_counts ?? {}) }
      if (prevEmotion) counts[prevEmotion] = Math.max(0, (counts[prevEmotion] ?? 0) - 1)
      if (nextEmotion) counts[nextEmotion] = (counts[nextEmotion] ?? 0) + 1
      return { ...prev, reaction_counts: counts, my_reaction: nextEmotion }
    })
  }

  async function handleReact(emotion: ReactionEmotion | null) {
    if (!me || !post) return navigate('/login')
    const prevEmotion = post.my_reaction ?? null

    // Optimistic update: không đợi round-trip DB rồi load() lại cả post
    applyReactionLocally(prevEmotion, emotion)

    let error = null
    if (emotion === null) {
      ;({ error } = await supabase.from('post_reactions').delete().eq('post_id', post.id).eq('user_id', me.id))
    } else if (prevEmotion) {
      ;({ error } = await supabase.from('post_reactions').update({ emotion }).eq('post_id', post.id).eq('user_id', me.id))
    } else {
      ;({ error } = await supabase.from('post_reactions').insert({ post_id: post.id, user_id: me.id, emotion }))
    }

    if (error) {
      console.error(error)
      applyReactionLocally(emotion, prevEmotion) // rollback
      showToast('Không thể gửi cảm xúc, thử lại nhé', 'error')
    }
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
        showToast('Không thể lưu bài viết, thử lại nhé', 'error')
      } else {
        showToast('Đã lưu bài viết', 'success')
      }
    } else {
      const { error } = await supabase.from('saved_posts').delete().eq('post_id', post.id).eq('user_id', me.id)
      if (error) {
        console.error(error)
        setSaved(true)
        showToast('Không thể bỏ lưu bài viết, thử lại nhé', 'error')
      } else {
        showToast('Đã bỏ lưu bài viết', 'success')
      }
    }
  }

  function triggerHeartPop() {
    setPoppingHeart(true)
    setTimeout(() => setPoppingHeart(false), 280)
  }

  function handleMediaTap() {
    const now = Date.now()
    if (now - lastTapRef.current < 300) {
      lastTapRef.current = 0
      setFloatingHeart(true)
      setTimeout(() => setFloatingHeart(false), 700)
      if (post && post.my_reaction !== 'love') {
        handleReact('love')
        triggerHeartPop()
      }
    } else {
      lastTapRef.current = now
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
      try {
        await navigator.clipboard.writeText(url)
        showToast('Đã copy link chia sẻ', 'success')
      } catch (e) {
        console.error(e)
        showToast('Không thể copy link, thử lại nhé', 'error')
      }
    }
  }

  return (
    <PhoneShell>
      <div className="flex-1 overflow-y-auto relative">
        {/* Ambient backdrop: phóng to + làm mờ chính ảnh của post, tạo chiều sâu
            phía sau card thay vì nền đơn sắc phẳng lì */}
        {post?.media_url && !loading && !notFound && (
          <div className="absolute inset-0 overflow-hidden">
            <img
              src={post.media_url}
              className="w-full h-full object-cover scale-125 blur-3xl opacity-60"
              aria-hidden
            />
            <div className="absolute inset-0 bg-black/50" />
          </div>
        )}

        <button
          onClick={() => navigate(-1)}
          aria-label="Quay lại"
          className="absolute top-5 left-5 z-20 w-9 h-9 rounded-full bg-black/40 backdrop-blur-md border border-white/10 flex items-center justify-center focus-ring"
        >
          <ArrowLeft size={18} className="text-white" />
        </button>

        <div className="relative z-10 min-h-[100dvh] flex items-center justify-center px-5 py-16">
          {loading ? (
            <div className="w-full aspect-[3/4] rounded-[2.25rem] skeleton-glass" />
          ) : notFound || !post ? (
            <div className="flex flex-col items-center text-center gap-3 px-4">
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
            // Card bo tròn nổi khối — viền sáng mảnh + bóng đổ sâu để tách hẳn
            // khỏi phông nền mờ phía sau, thay vì tràn kín màn hình như trước.
            <div className="relative w-full rounded-[2.25rem] overflow-hidden border border-white/15 shadow-[0_25px_60px_-15px_rgba(0,0,0,0.6)] bg-[var(--surface)] flex flex-col justify-end aspect-[3/4]">
              <div className="absolute inset-0 cursor-pointer" onClick={handleMediaTap}>
                {post.media_url ? (
                  <img src={post.media_url} className="absolute inset-0 w-full h-full object-cover" />
                ) : (
                  <div className="absolute inset-0 gradient-flame opacity-70" />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/15 to-transparent" />
              </div>

              {floatingHeart && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <Heart size={100} className="text-white fill-white heart-float-pop" />
                </div>
              )}

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

              <div className="relative px-4 pb-5">
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
                    onClick={() => {
                      handleReact(post.my_reaction === 'love' ? null : 'love')
                      triggerHeartPop()
                    }}
                    aria-label="Thích bài viết"
                    className="flex-1 h-12 rounded-full flex items-center justify-center gap-2 focus-ring shadow-[0_4px_18px_rgba(255,90,120,0.45)]"
                    style={{ background: 'linear-gradient(135deg, #ff8a5c 0%, #ff5e8f 55%, #ff4f9a 100%)' }}
                  >
                    <Heart
                      size={19}
                      className={`${post.my_reaction === 'love' ? 'fill-white text-white' : 'text-white'} ${poppingHeart ? 'heart-pop' : ''}`}
                    />
                    <span className="text-sm font-bold text-white">
                      {Object.values(post.reaction_counts ?? {}).reduce((a, b) => a + (b ?? 0), 0)}
                    </span>
                  </button>
                </div>

                <p className="text-[11px] text-white/50 mt-3">
                  {new Date(post.created_at).toLocaleDateString('vi-VN')}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </PhoneShell>
  )
}
