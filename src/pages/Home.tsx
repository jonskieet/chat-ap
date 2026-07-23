import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { Bell, Heart, MessageCircle, MessageSquare, Plus, Share2, Star, X } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import PhoneShell from '../components/PhoneShell'
import BottomNav from '../components/BottomNav'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { withViewTransition } from '../lib/viewTransition'
import type { Post, ReactionEmotion, SavedPost } from '../types'

export default function Home() {
  const navigate = useNavigate()
  const { user, profile: me } = useAuth()
  const { showToast } = useToast()
  const [posts, setPosts] = useState<Post[]>([])
  const [loading, setLoading] = useState(true)
  const [composerOpen, setComposerOpen] = useState(false)
  const [caption, setCaption] = useState('')
  const [mediaFile, setMediaFile] = useState<File | null>(null)
  const [posting, setPosting] = useState(false)
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set())
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
    // optimistic update
    setSavedIds((prev) => {
      const next = new Set(prev)
      alreadySaved ? next.delete(postId) : next.add(postId)
      return next
    })
    if (alreadySaved) {
      const { error } = await supabase.from('saved_posts').delete().eq('post_id', postId).eq('user_id', me.id)
      if (error) {
        console.error(error)
        setSavedIds((prev) => new Set(prev).add(postId)) // rollback
        showToast('Không thể bỏ lưu bài viết, thử lại nhé', 'error')
      } else {
        showToast('Đã bỏ lưu bài viết', 'success')
      }
    } else {
      const { error } = await supabase.from('saved_posts').insert({ post_id: postId, user_id: me.id })
      if (error) {
        console.error(error)
        setSavedIds((prev) => {
          const next = new Set(prev) // rollback
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
    // silent=true: dùng cho refresh nền (realtime), không hiện skeleton để tránh
    // toàn bộ feed bị unmount/remount gây giật/nhảy ảnh khi đang cuộn hoặc vừa bấm tim
    if (!silent) setLoading(true)
    const { data: postsData, error } = await supabase
      .from('posts')
      .select('*, author:profiles!posts_author_id_fkey(*)')
      .order('created_at', { ascending: false })
      .limit(20)

    if (error) {
      console.error(error)
      if (!silent) showToast('Không tải được bảng tin, kiểm tra kết nối mạng', 'error')
      if (!silent) setLoading(false)
      return
    }

    const list = (postsData as unknown as Post[]) ?? []
    const uid = user?.id
    const ids = list.map((p) => p.id)

    // 1 query duy nhất cho toàn bộ post_reactions thay vì loop N+1 như trước
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

  // Refresh nhẹ chỉ số lượt tim cho các post đang hiển thị, không đụng tới danh sách
  // post/loading — dùng khi có người khác thả tim, tránh phải load lại (và nhảy) cả feed.
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

  // Dọn timer single-tap khi unmount, tránh gọi navigate() sau khi component đã gỡ
  // Giữ ref đồng bộ với posts để đọc trong subscription realtime mà không cần
  // đưa `posts` vào dependency array (tránh subscribe lại kênh mỗi lần feed đổi)
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
        // Bỏ qua nếu chính là hành động của mình: đã cập nhật optimistic ngay khi bấm,
        // gọi lại refresh ở đây chỉ tổ dư thừa (và có thể gây nhấp nháy do race condition).
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

    // Optimistic update: cập nhật UI ngay, không đợi round-trip DB rồi loadPosts() lại toàn bộ feed
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
      // rollback nếu request thất bại
      applyReactionLocally(post.id, emotion, prevEmotion)
      showToast('Không thể gửi cảm xúc, thử lại nhé', 'error')
    }
  }

  function openPost(postId: string) {
    // View Transitions API: cùng view-transition-name (theo post.id) được đặt trên
    // ảnh card ở đây và ảnh chính ở PostDetail để trình duyệt tự "morph" giữa 2 vị trí.
    withViewTransition(() => navigate(`/post/${postId}`))
  }

  // Parallax nhẹ cho ảnh nền khi cuộn feed: ảnh dịch chậm hơn khung card, tạo chiều sâu.
  // Dùng requestAnimationFrame để throttle theo scroll, tránh giật trên máy yếu; áp trực
  // tiếp qua ref.style.transform thay vì setState để không re-render lại cả feed mỗi frame.
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
        // Hệ số nhỏ + clamp để hiệu ứng "nhẹ", không gây jank hay lệch quá nhiều
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

  function handleMediaTap(post: Post) {
    const now = Date.now()
    const last = lastTapRef.current[post.id] ?? 0
    if (now - last < 300) {
      lastTapRef.current[post.id] = 0
      // Huỷ điều hướng single-tap đang chờ vì đây là double-tap
      const pendingTimer = tapTimerRef.current[post.id]
      if (pendingTimer) {
        clearTimeout(pendingTimer)
        delete tapTimerRef.current[post.id]
      }
      // Double-tap kiểu Instagram: luôn like (không unlike), kèm tim to hiện giữa ảnh rồi fade
      setFloatingHeart(post.id)
      setTimeout(() => setFloatingHeart(null), 700)
      if (post.my_reaction !== 'love') {
        handleReact(post, 'love')
        triggerHeartPop(post.id)
      }
    } else {
      lastTapRef.current[post.id] = now
      // Đợi hết khung double-tap rồi mới điều hướng sang PostDetail, để không mở trang
      // chi tiết mỗi khi người dùng double-tap để thả tim.
      tapTimerRef.current[post.id] = setTimeout(() => {
        delete tapTimerRef.current[post.id]
        openPost(post.id)
      }, 300)
    }
  }

  function triggerHeartPop(postId: string) {
    setPoppingHeart(postId)
    setTimeout(() => setPoppingHeart(null), 280)
  }

  async function submitPost() {
    if (!me || (!caption.trim() && !mediaFile)) return
    setPosting(true)
    try {
      let mediaUrl: string | null = null
      if (mediaFile) {
        const path = `${me.id}/${Date.now()}-${mediaFile.name}`
        const { error: uploadError } = await supabase.storage.from('posts').upload(path, mediaFile)
        if (uploadError) throw uploadError
        const { data: pub } = supabase.storage.from('posts').getPublicUrl(path)
        mediaUrl = pub.publicUrl
      }
      const { error } = await supabase.from('posts').insert({
        author_id: me.id,
        caption: caption.trim() || null,
        media_url: mediaUrl,
      })
      if (error) throw error
      setCaption('')
      setMediaFile(null)
      setComposerOpen(false)
      showToast('Đã đăng bài viết', 'success')
      loadPosts()
    } catch (e) {
      console.error(e)
      showToast('Đăng bài thất bại, thử lại nhé', 'error')
    } finally {
      setPosting(false)
    }
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

      {/* Story row */}
      <div className="flex gap-3 overflow-x-auto px-5 pb-4 shrink-0">
        <button onClick={() => setComposerOpen(true)} className="flex flex-col items-center gap-1.5 shrink-0 focus-ring rounded-2xl" aria-label="Đăng bài mới">
          <div className="w-14 h-14 rounded-full border-2 border-dashed border-[var(--text-dim)] flex items-center justify-center">
            <Plus size={18} className="text-[var(--text-dim)]" />
          </div>
          <span className="text-[11px] text-[var(--text-dim)]">Của bạn</span>
        </button>
        {posts.slice(0, 6).map((p) => (
          <div key={p.id} className="flex flex-col items-center gap-1.5 shrink-0">
            <div className="w-14 h-14 rounded-full story-ring p-[2px]">
              <div className="w-full h-full rounded-full bg-[var(--surface)] border-2 border-[var(--bg)] overflow-hidden flex items-center justify-center text-sm font-semibold">
                {p.author?.avatar_url ? (
                  <img src={p.author.avatar_url} className="w-full h-full object-cover" />
                ) : (
                  p.author?.username?.slice(0, 1).toUpperCase()
                )}
              </div>
            </div>
            <span className="text-[11px] text-[var(--text-dim)] max-w-[56px] truncate">
              {p.author?.username ?? '...'}
            </span>
          </div>
        ))}
      </div>

      {/* Feed */}
      <div ref={feedScrollRef} className="flex-1 overflow-y-auto px-5 pb-32 space-y-5">
        {loading && (
          <div className="h-80 rounded-3xl bg-[var(--surface)] animate-pulse" />
        )}
        {!loading && posts.length === 0 && (
          <div className="text-center py-16">
            <p className="font-display font-bold text-lg mb-1">Chưa có bài viết nào</p>
            <p className="text-sm text-[var(--text-dim)] mb-4">Hãy là người đầu tiên chia sẻ điều gì đó.</p>
            <button
              onClick={() => setComposerOpen(true)}
              className="gradient-nova text-black font-bold rounded-full px-6 py-2.5 focus-ring"
            >
              Đăng bài
            </button>
          </div>
        )}
        {posts
          .filter((post) => !hiddenIds.has(post.id))
          .map((post) => {
            const liked = post.my_reaction === 'love'
            const tags = post.author?.interests?.slice(0, 4) ?? []
            return (
              <div key={post.id} className="relative rounded-3xl overflow-hidden bg-[var(--surface)] min-h-[420px] flex flex-col justify-end">
                <div className="absolute inset-0 cursor-pointer overflow-hidden" onClick={() => handleMediaTap(post)}>
                  {post.media_url ? (
                    <img
                      ref={(el) => {
                        parallaxMediaRefs.current[post.id] = el
                      }}
                      src={post.media_url}
                      className="parallax-media absolute inset-0 w-full h-full object-cover"
                      style={{ viewTransitionName: `post-media-${post.id}` } as CSSProperties}
                    />
                  ) : (
                    <div
                      ref={(el) => {
                        parallaxMediaRefs.current[post.id] = el
                      }}
                      className="parallax-media absolute inset-0 gradient-flame opacity-70"
                      style={{ viewTransitionName: `post-media-${post.id}` } as CSSProperties}
                    />
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent" />
                </div>

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

                {/* Ẩn bài viết: đưa lên góc phải trên cùng kiểu menu "..." của Instagram thay vì chen vào hàng action bên dưới */}
                <button
                  onClick={() => setHiddenIds((prev) => new Set(prev).add(post.id))}
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

                  {/* Action panel kiểu Instagram: nhóm tim/bình luận/chia sẻ bên trái, nút lưu tách riêng bên phải */}
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
            )
          })}
      </div>

      {/* New post composer */}
      {composerOpen && (
        <div className="absolute inset-0 z-30 bg-black/70 flex items-end">
          <div className="w-full bg-[var(--surface)] rounded-t-3xl p-5 border-t border-[var(--border)]">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-display font-bold text-lg">Bài viết mới</h2>
              <button onClick={() => setComposerOpen(false)} className="p-1 focus-ring rounded-full" aria-label="Đóng">
                <X size={18} />
              </button>
            </div>
            <textarea
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              placeholder="Bạn đang nghĩ gì?"
              rows={3}
              className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-xl px-4 py-3 text-sm outline-none focus-ring resize-none mb-3"
            />
            <label className="flex items-center justify-center gap-2 border border-dashed border-[var(--border)] rounded-xl py-3 text-sm text-[var(--text-dim)] cursor-pointer mb-4 focus-ring">
              {mediaFile ? mediaFile.name : 'Chọn ảnh (tuỳ chọn)'}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => setMediaFile(e.target.files?.[0] ?? null)}
              />
            </label>
            <button
              onClick={submitPost}
              disabled={posting || (!caption.trim() && !mediaFile)}
              className="w-full gradient-nova text-black font-bold rounded-full py-3 focus-ring disabled:opacity-40"
            >
              {posting ? 'Đang đăng...' : 'Đăng bài'}
            </button>
          </div>
        </div>
      )}

      <BottomNav />
    </PhoneShell>
  )
}
