import { useEffect, useRef, useState } from 'react'
import { Bell, Heart, MessageCircle, MessageSquare, Share2, Star, X } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import PhoneShell from '../components/PhoneShell'
import BottomNav from '../components/BottomNav'
import StoryBar from '../components/StoryBar'
import MediaCarousel from '../components/MediaCarousel'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { useComposer } from '../context/ComposerContext'
import { withViewTransition } from '../lib/viewTransition'
import type { Post, ReactionEmotion, SavedPost } from '../types'

export default function Home() {
  const navigate = useNavigate()
  const { user, profile: me } = useAuth()
  const { showToast } = useToast()
  const { openPostComposer } = useComposer()
  const [posts, setPosts] = useState<Post[]>([])
  const [loading, setLoading] = useState(true)
  const [hiddenPostIds, setHiddenPostIds] = useState<Set<string>>(new Set())
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set())
  const [unreadCount, setUnreadCount] = useState(0)
  const [poppingHeart, setPoppingHeart] = useState<string | null>(null)
  const [floatingHeart, setFloatingHeart] = useState<string | null>(null)
  const lastTapRef = useRef<Record<string, number>>({})
  const tapTimerRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({})
  const feedScrollRef = useRef<HTMLDivElement>(null)
  const parallaxMediaRefs = useRef<Record<string, HTMLElement | null>>({})
  const postsRef = useRef<Post[]>([])

  async function toggleSaved(postId: string) {
    if (!me) return navigate('/login')
    const alreadySaved = savedIds.has(postId)
    setSavedIds((prev) => {
      const next = new Set(prev)
      alreadySaved ? next.delete(postId) : next.add(postId)
      return next
    })
    if (alreadySaved) {
      const { error } = await supabase.from('saved_posts').delete().eq('post_id', postId).eq('user_id', me.id)
      if (error) {
        console.error(error)
        setSavedIds((prev) => new Set(prev).add(postId))
        showToast('Không thể bỏ lưu bài viết, thử lại nhé', 'error')
      } else {
        showToast('Đã bỏ lưu bài viết', 'success')
      }
    } else {
      const { error } = await supabase.from('saved_posts').insert({ post_id: postId, user_id: me.id })
      if (error) {
        console.error(error)
        setSavedIds((prev) => {
          const next = new Set(prev)
          next.delete(postId)
          return next
        })
        showToast('Không thể lưu bài viết, thử lại nhé', 'error')
      } else {
        showToast('Đã lưu bài viết', 'success')
      }
    }
  }

  async function sharePost(post: Post) {
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

  async function loadPosts(silent = false) {
    if (!silent) setLoading(true)
    const { data: postsData, error } = await supabase
      .from('posts')
      .select('*, author:profiles!posts_author_id_fkey(*), media:post_media(*)')
      .order('created_at', { ascending: false })
      .limit(20)

    if (error) {
      console.error(error)
      if (!silent) showToast('Không tải được bảng tin, kiểm tra kết nối mạng', 'error')
      if (!silent) setLoading(false)
      return
    }

    const list = ((postsData as unknown as Post[]) ?? []).map((p) => ({
      ...p,
      media: [...(p.media ?? [])].sort((a, b) => a.position - b.position),
    }))
    const uid = user?.id
    const ids = list.map((p) => p.id)

    let reactionsByPost: Record<string, { user_id: string; emotion: ReactionEmotion }[]> = {}
    if (ids.length) {
      const { data: allReactions } = await supabase
        .from('post_reactions')
        .select('post_id, user_id, emotion')
        .in('post_id', ids)

      reactionsByPost = {}
      for (const r of allReactions ?? []) {
        const key = r.post_id as string
        reactionsByPost[key] = [...(reactionsByPost[key] ?? []), { user_id: r.user_id, emotion: r.emotion as ReactionEmotion }]
      }
    }

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
    if (!silent) setLoading(false)
  }

  async function refreshReactionCounts(postIds: string[]) {
    if (!postIds.length) return
    const uid = user?.id
    const { data: allReactions, error } = await supabase
      .from('post_reactions')
      .select('post_id, user_id, emotion')
      .in('post_id', postIds)
    if (error) {
      console.error(error)
      return
    }

    const reactionsByPost: Record<string, { user_id: string; emotion: ReactionEmotion }[]> = {}
    for (const r of allReactions ?? []) {
      const key = r.post_id as string
      reactionsByPost[key] = [...(reactionsByPost[key] ?? []), { user_id: r.user_id, emotion: r.emotion as ReactionEmotion }]
    }

    setPosts((prev) =>
      prev.map((p) => {
        if (!postIds.includes(p.id)) return p
        const counts: Partial<Record<ReactionEmotion, number>> = {}
        let mine: ReactionEmotion | null = null
        for (const r of reactionsByPost[p.id] ?? []) {
          counts[r.emotion] = (counts[r.emotion] ?? 0) + 1
          if (r.user_id === uid) mine = r.emotion
        }
        return { ...p, reaction_counts: counts, my_reaction: mine }
      })
    )
  }

  async function loadSaved() {
    if (!me) {
      setSavedIds(new Set())
      return
    }
    const { data, error } = await supabase.from('saved_posts').select('post_id').eq('user_id', me.id)
    if (error) {
      console.error(error)
      return
    }
    setSavedIds(new Set(((data as SavedPost[]) ?? []).map((s) => s.post_id)))
  }

  async function loadUnreadCount() {
    if (!me) {
      setUnreadCount(0)
      return
    }
    const { count, error } = await supabase
      .from('notifications')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', me.id)
      .eq('read', false)
    if (error) {
      console.error(error)
      return
    }
    setUnreadCount(count ?? 0)
  }

  useEffect(() => {
    postsRef.current = posts
  }, [posts])

  useEffect(() => {
    return () => {
      Object.values(tapTimerRef.current).forEach((t) => clearTimeout(t))
    }
  }, [])

  useEffect(() => {
    loadUnreadCount()
    if (!me) return
    const sub = supabase
      .channel(`notifications_badge:${me.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${me.id}` },
        () => loadUnreadCount()
      )
      .subscribe()
    return () => {
      supabase.removeChannel(sub)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me?.id])

  useEffect(() => {
    loadPosts()
    loadSaved()

    const sub = supabase
      .channel('post_reactions_live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'post_reactions' }, (payload) => {
        const row = (payload.new ?? payload.old) as { user_id?: string } | null
        if (row?.user_id && row.user_id === me?.id) return
        refreshReactionCounts(postsRef.current.map((p) => p.id))
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'posts' }, () => {
        loadPosts(true)
      })
      .subscribe()

    return () => {
      supabase.removeChannel(sub)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me?.id])

  function applyReactionLocally(postId: string, prevEmotion: ReactionEmotion | null, nextEmotion: ReactionEmotion | null) {
    setPosts((prev) =>
      prev.map((p) => {
        if (p.id !== postId) return p
        const counts = { ...(p.reaction_counts ?? {}) }
        if (prevEmotion) counts[prevEmotion] = Math.max(0, (counts[prevEmotion] ?? 0) - 1)
        if (nextEmotion) counts[nextEmotion] = (counts[nextEmotion] ?? 0) + 1
        return { ...p, reaction_counts: counts, my_reaction: nextEmotion }
      })
    )
  }

  async function handleReact(post: Post, emotion: ReactionEmotion | null) {
    if (!me) return
    const prevEmotion = post.my_reaction ?? null
    applyReactionLocally(post.id, prevEmotion, emotion)

    let error = null
    if (emotion === null) {
      ;({ error } = await supabase.from('post_reactions').delete().eq('post_id', post.id).eq('user_id', me.id))
    } else if (prevEmotion) {
      ;({ error } = await supabase
        .from('post_reactions')
        .update({ emotion })
        .eq('post_id', post.id)
        .eq('user_id', me.id))
    } else {
      ;({ error } = await supabase.from('post_reactions').insert({ post_id: post.id, user_id: me.id, emotion }))
    }

    if (error) {
      console.error(error)
      applyReactionLocally(post.id, emotion, prevEmotion)
      showToast('Không thể gửi cảm xúc, thử lại nhé', 'error')
    }
  }

  // Parallax nhẹ cho ảnh nền khi cuộn feed
  useEffect(() => {
    const container = feedScrollRef.current
    if (!container) return

    let rafId: number | null = null

    function applyParallax() {
      rafId = null
      const containerRect = container!.getBoundingClientRect()
      const containerCenter = containerRect.top + containerRect.height / 2
      for (const el of Object.values(parallaxMediaRefs.current)) {
        if (!el) continue
        const rect = el.getBoundingClientRect()
        const cardCenter = rect.top + rect.height / 2
        const offset = Math.max(-24, Math.min(24, (cardCenter - containerCenter) * 0.08))
        el.style.transform = `translateY(${offset.toFixed(1)}px) scale(1.12)`
      }
    }

    function onScroll() {
      if (rafId !== null) return
      rafId = requestAnimationFrame(applyParallax)
    }

    applyParallax()
    container.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      container.removeEventListener('scroll', onScroll)
      if (rafId !== null) cancelAnimationFrame(rafId)
    }
  }, [posts])

  // Single-tap: mở chi tiết bài viết. Double-tap: thả tim kiểu Instagram.
  function handleMediaTap(post: Post) {
    const now = Date.now()
    const last = lastTapRef.current[post.id] ?? 0
    if (now - last < 300) {
      lastTapRef.current[post.id] = 0
      const pendingTimer = tapTimerRef.current[post.id]
      if (pendingTimer) {
        clearTimeout(pendingTimer)
        delete tapTimerRef.current[post.id]
      }
      setFloatingHeart(post.id)
      setTimeout(() => setFloatingHeart(null), 700)
      if (post.my_reaction !== 'love') {
        handleReact(post, 'love')
        triggerHeartPop(post.id)
      }
    } else {
      lastTapRef.current[post.id] = now
      tapTimerRef.current[post.id] = setTimeout(() => {
        delete tapTimerRef.current[post.id]
        withViewTransition(() => navigate(`/post/${post.id}`))
      }, 300)
    }
  }

  function triggerHeartPop(postId: string) {
    setPoppingHeart(postId)
    setTimeout(() => setPoppingHeart(null), 280)
  }

  return (
    <PhoneShell>
      <div className="flex items-center justify-between px-5 pt-6 pb-4 shrink-0">
        <h1 className="font-display text-2xl font-bold">Home</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate('/notifications')}
            className="relative w-9 h-9 rounded-full bg-[var(--surface)] flex items-center justify-center focus-ring"
            aria-label="Thông báo"
          >
            <Bell size={16} />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-[#ff4f9a] text-white text-[10px] font-bold flex items-center justify-center">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>
          <button
            onClick={() => navigate('/chats')}
            className="w-9 h-9 rounded-full bg-[var(--surface)] flex items-center justify-center focus-ring"
            aria-label="Tin nhắn"
          >
            <MessageSquare size={16} />
          </button>
        </div>
      </div>

      {/* Story row — tách hoàn toàn khỏi feed bài viết, tự quản lý dữ liệu/viewer riêng */}
      <StoryBar />

      {/* Feed: mỗi bài viết 1 card riêng (không gộp nhiều post lại nữa); ảnh nhiều tấm trong
          cùng 1 post thì vuốt ngang xem trong MediaCarousel. */}
      <div ref={feedScrollRef} className="flex-1 overflow-y-auto px-5 pb-32 space-y-5">
        {loading && <div className="h-80 rounded-3xl bg-[var(--surface)] animate-pulse" />}
        {!loading && posts.length === 0 && (
          <div className="text-center py-16">
            <p className="font-display font-bold text-lg mb-1">Chưa có bài viết nào</p>
            <p className="text-sm text-[var(--text-dim)] mb-4">Hãy là người đầu tiên chia sẻ điều gì đó.</p>
            <button onClick={openPostComposer} className="gradient-nova text-black font-bold rounded-full px-6 py-2.5 focus-ring">
              Đăng bài
            </button>
          </div>
        )}
        {posts
          .filter((p) => !hiddenPostIds.has(p.id))
          .map((post) => {
            const liked = post.my_reaction === 'love'
            const tags = post.author?.interests?.slice(0, 4) ?? []
            const media = post.media && post.media.length > 0
              ? post.media
              : post.media_url
                ? [{ id: post.id, post_id: post.id, media_url: post.media_url, media_type: post.media_type ?? 'image', position: 0 }]
                : []
            return (
              <div key={post.id} className="relative">
                <div className="relative rounded-3xl overflow-hidden bg-[var(--surface)] min-h-[420px] flex flex-col justify-end">
                  <MediaCarousel
                    media={media}
                    postId={post.id}
                    onTap={() => handleMediaTap(post)}
                    mediaRef={(el) => {
                      parallaxMediaRefs.current[post.id] = el
                    }}
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent pointer-events-none" />

                  {floatingHeart === post.id && (
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      <Heart size={92} className="text-white fill-white heart-float-pop" />
                    </div>
                  )}

                  <div className="absolute top-3 left-3 flex items-center gap-2">
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

                  <button
                    onClick={() => setHiddenPostIds((prev) => new Set(prev).add(post.id))}
                    aria-label="Ẩn bài viết"
                    className="absolute top-3 right-3 w-8 h-8 rounded-full bg-black/40 backdrop-blur-md flex items-center justify-center focus-ring"
                  >
                    <X size={16} className="text-white" />
                  </button>

                  <div className="relative px-4 pb-4">
                    {post.caption && (
                      <p className="font-display font-bold text-2xl leading-tight text-white mb-3">{post.caption}</p>
                    )}

                    {tags.length > 0 && (
                      <div className="flex flex-wrap gap-2 mb-4">
                        {tags.map((tag) => (
                          <span
                            key={tag}
                            className="text-xs font-medium bg-white/15 backdrop-blur-sm border border-white/10 rounded-full px-3 py-1.5"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}

                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => {
                            handleReact(post, liked ? null : 'love')
                            triggerHeartPop(post.id)
                          }}
                          aria-label="Thích bài viết"
                          className="h-11 pl-3.5 pr-4 rounded-full flex items-center gap-1.5 focus-ring shadow-[0_4px_18px_rgba(255,90,120,0.45)] shrink-0"
                          style={{ background: 'linear-gradient(135deg, #ff8a5c 0%, #ff5e8f 55%, #ff4f9a 100%)' }}
                        >
                          <Heart
                            size={18}
                            className={`${liked ? 'fill-white text-white' : 'text-white'} ${poppingHeart === post.id ? 'heart-pop' : ''}`}
                          />
                          <span className="text-sm font-bold text-white">
                            {Object.values(post.reaction_counts ?? {}).reduce((a, b) => a + (b ?? 0), 0)}
                          </span>
                        </button>
                        <button
                          onClick={() =>
                            withViewTransition(() => navigate(`/post/${post.id}`, { state: { openComments: true } }))
                          }
                          aria-label="Bình luận"
                          className="w-11 h-11 shrink-0 rounded-full bg-white/10 backdrop-blur-md border border-white/15 flex items-center justify-center focus-ring"
                        >
                          <MessageCircle size={17} className="text-white" />
                        </button>
                        <button
                          onClick={() => sharePost(post)}
                          aria-label="Chia sẻ bài viết"
                          className="w-11 h-11 shrink-0 rounded-full bg-white/10 backdrop-blur-md border border-white/15 flex items-center justify-center focus-ring"
                        >
                          <Share2 size={17} className="text-white" />
                        </button>
                      </div>
                      <button
                        onClick={() => toggleSaved(post.id)}
                        aria-label="Lưu bài viết"
                        className="w-11 h-11 shrink-0 rounded-full bg-white/10 backdrop-blur-md border border-white/15 flex items-center justify-center focus-ring"
                      >
                        <Star size={18} className={savedIds.has(post.id) ? 'fill-white text-white' : 'text-white'} />
                      </button>
                    </div>

                    <p className="text-[11px] text-white/50 mt-3">
                      {new Date(post.created_at).toLocaleDateString('vi-VN')}
                    </p>
                  </div>
                </div>
              </div>
            )
          })}
      </div>

      <BottomNav />
    </PhoneShell>
  )
}
