import { useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Heart, MessageCircle, Share2, Star, X } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import type { Post, ReactionEmotion } from '../types'

interface StoryViewerProps {
  posts: Post[]
  initialIndex: number
  savedIds: Set<string>
  onClose: () => void
  onReact: (post: Post, emotion: ReactionEmotion | null) => void
  onToggleSaved: (postId: string) => void
  onShare: (post: Post) => void
}

// Trình xem "gộp bài viết theo tác giả" kiểu Instagram Stories: cùng 1 người đăng
// nhiều bài sẽ được duyệt tuần tự qua đây thay vì rải rác nhiều card riêng trong feed.
// Điều hướng bằng 2 nút bấm rõ ràng (trái/phải) theo đúng yêu cầu, không dùng auto-timer.
export default function StoryViewer({
  posts,
  initialIndex,
  savedIds,
  onClose,
  onReact,
  onToggleSaved,
  onShare,
}: StoryViewerProps) {
  const navigate = useNavigate()
  const [index, setIndex] = useState(initialIndex)
  const [poppingHeart, setPoppingHeart] = useState(false)
  const [floatingHeart, setFloatingHeart] = useState(false)
  const lastTapRef = useRef(0)

  // Nếu feed cập nhật (vd sau khi react) khiến mảng post của tác giả này rỗng/đổi độ dài,
  // giữ index trong phạm vi hợp lệ để tránh crash truy cập ngoài mảng.
  useEffect(() => {
    if (index > posts.length - 1) setIndex(Math.max(0, posts.length - 1))
  }, [posts.length, index])

  useEffect(() => {
    if (posts.length === 0) onClose()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [posts.length])

  if (posts.length === 0) return null
  const post = posts[index]
  const liked = post.my_reaction === 'love'
  const tags = post.author?.interests?.slice(0, 4) ?? []
  const isVideo = post.media_type === 'video'

  function goNext() {
    if (index >= posts.length - 1) {
      onClose()
    } else {
      setIndex((i) => i + 1)
    }
  }

  function goPrev() {
    if (index > 0) setIndex((i) => i - 1)
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
      if (post.my_reaction !== 'love') {
        onReact(post, 'love')
        triggerHeartPop()
      }
    } else {
      lastTapRef.current = now
    }
  }

  return (
    <div className="absolute inset-0 z-40 bg-black flex flex-col">
      {/* Progress bar: 1 đoạn cho mỗi bài của tác giả, đoạn đã qua/hiện tại được tô sáng */}
      <div className="flex gap-1 px-3 pt-4 shrink-0">
        {posts.map((p, i) => (
          <div key={p.id} className="flex-1 h-[3px] rounded-full bg-white/25 overflow-hidden">
            <div
              className="h-full bg-white rounded-full transition-all"
              style={{ width: i <= index ? '100%' : '0%' }}
            />
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between px-4 pt-3 shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-[var(--surface-2)] border border-white/20 overflow-hidden flex items-center justify-center text-xs font-semibold text-white">
            {post.author?.avatar_url ? (
              <img src={post.author.avatar_url} className="w-full h-full object-cover" />
            ) : (
              post.author?.username?.slice(0, 1).toUpperCase()
            )}
          </div>
          <button
            onClick={() => post.author?.username && navigate(`/profile/${post.author.username}`)}
            className="text-xs font-semibold text-white focus-ring rounded-full px-1"
          >
            @{post.author?.username ?? 'unknown'}
          </button>
          <span className="text-[11px] text-white/50">{index + 1}/{posts.length}</span>
        </div>
        <button
          onClick={onClose}
          aria-label="Đóng"
          className="w-9 h-9 rounded-full bg-white/10 backdrop-blur-md flex items-center justify-center focus-ring"
        >
          <X size={18} className="text-white" />
        </button>
      </div>

      {/* Media chính + 2 nút điều hướng tin trước / tin tiếp theo */}
      <div className="relative flex-1 min-h-0 mt-3">
        <div className="absolute inset-0 cursor-pointer overflow-hidden" onClick={handleMediaTap}>
          {post.media_url ? (
            isVideo ? (
              <video
                key={post.id}
                src={post.media_url}
                className="absolute inset-0 w-full h-full object-cover"
                autoPlay
                loop
                muted
                playsInline
                controls={false}
              />
            ) : (
              <img src={post.media_url} className="absolute inset-0 w-full h-full object-cover" />
            )
          ) : (
            <div className="absolute inset-0 gradient-flame opacity-70" />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/10 to-transparent" />
        </div>

        {floatingHeart && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <Heart size={100} className="text-white fill-white heart-float-pop" />
          </div>
        )}

        {index > 0 && (
          <button
            onClick={goPrev}
            aria-label="Tin trước đó"
            className="absolute left-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/35 backdrop-blur-md border border-white/15 flex items-center justify-center focus-ring"
          >
            <ChevronLeft size={20} className="text-white" />
          </button>
        )}
        <button
          onClick={goNext}
          aria-label={index >= posts.length - 1 ? 'Đóng' : 'Tin tiếp theo'}
          className="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/35 backdrop-blur-md border border-white/15 flex items-center justify-center focus-ring"
        >
          <ChevronRight size={20} className="text-white" />
        </button>

        <div className="absolute inset-x-0 bottom-0 px-4 pb-5">
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
                  onReact(post, liked ? null : 'love')
                  triggerHeartPop()
                }}
                aria-label="Thích bài viết"
                className="h-11 pl-3.5 pr-4 rounded-full flex items-center gap-1.5 focus-ring shadow-[0_4px_18px_rgba(255,90,120,0.45)] shrink-0"
                style={{ background: 'linear-gradient(135deg, #ff8a5c 0%, #ff5e8f 55%, #ff4f9a 100%)' }}
              >
                <Heart size={18} className={`${liked ? 'fill-white text-white' : 'text-white'} ${poppingHeart ? 'heart-pop' : ''}`} />
                <span className="text-sm font-bold text-white">
                  {Object.values(post.reaction_counts ?? {}).reduce((a, b) => a + (b ?? 0), 0)}
                </span>
              </button>
              <button
                onClick={() => navigate(`/post/${post.id}`, { state: { openComments: true } })}
                aria-label="Bình luận"
                className="w-11 h-11 shrink-0 rounded-full bg-white/10 backdrop-blur-md border border-white/15 flex items-center justify-center focus-ring"
              >
                <MessageCircle size={17} className="text-white" />
              </button>
              <button
                onClick={() => onShare(post)}
                aria-label="Chia sẻ bài viết"
                className="w-11 h-11 shrink-0 rounded-full bg-white/10 backdrop-blur-md border border-white/15 flex items-center justify-center focus-ring"
              >
                <Share2 size={17} className="text-white" />
              </button>
            </div>
            <button
              onClick={() => onToggleSaved(post.id)}
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
}
