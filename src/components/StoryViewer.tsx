import { useEffect, useRef, useState } from 'react'
import { Heart, Send, Trash2, X } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import type { StoryGroup } from '../types'
import SendStorySheet from './SendStorySheet'

const IMAGE_DURATION_MS = 5000

interface StoryViewerProps {
  group: StoryGroup
  isOwn: boolean
  onView: (storyId: string) => void
  onClose: () => void
}

export default function StoryViewer({ group, isOwn, onView, onClose }: StoryViewerProps) {
  const navigate = useNavigate()
  const { user } = useAuth()
  const { showToast } = useToast()
  const [index, setIndex] = useState(0)
  const [paused, setPaused] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [replyText, setReplyText] = useState('')
  const [sendingReply, setSendingReply] = useState(false)
  const [likedIds, setLikedIds] = useState<Set<string>>(new Set())
  const [likeCounts, setLikeCounts] = useState<Record<string, number>>({})
  const [poppingHeart, setPoppingHeart] = useState(false)
  const [floatingHeart, setFloatingHeart] = useState(false)
  const [sendSheetOpen, setSendSheetOpen] = useState(false)
  const rafRef = useRef<number | null>(null)
  const lastTsRef = useRef<number | null>(null)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const lastTapRef = useRef(0)

  const stories = group.stories
  const story = stories[index]
  const liked = story ? likedIds.has(story.id) : false

  useEffect(() => {
    if (story) onView(story.id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [story?.id])

  useEffect(() => {
    if (stories.length === 0) onClose()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stories.length])

  // Tải trạng thái tim (đã thích chưa + tổng số tim) cho toàn bộ story trong nhóm này
  useEffect(() => {
    let cancelled = false
    async function loadLikes() {
      const ids = stories.map((s) => s.id)
      if (ids.length === 0) return
      const { data, error } = await supabase.from('story_likes').select('story_id, user_id').in('story_id', ids)
      if (error || cancelled) return
      const counts: Record<string, number> = {}
      const mine = new Set<string>()
      for (const row of data ?? []) {
        counts[row.story_id] = (counts[row.story_id] ?? 0) + 1
        if (row.user_id === user?.id) mine.add(row.story_id)
      }
      setLikeCounts(counts)
      setLikedIds(mine)
    }
    loadLikes()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [group.authorId, user?.id])

  // Auto-advance: ảnh chạy theo timer cố định, video chạy theo duration thật
  useEffect(() => {
    setElapsed(0)
    lastTsRef.current = null
    if (paused || !story) return

    const duration = story.media_type === 'video' ? null : IMAGE_DURATION_MS

    function tick(ts: number) {
      if (lastTsRef.current === null) lastTsRef.current = ts
      const dt = ts - lastTsRef.current
      lastTsRef.current = ts

      if (story!.media_type === 'video' && videoRef.current) {
        const v = videoRef.current
        if (v.duration > 0) setElapsed((v.currentTime / v.duration) * 100)
      } else if (duration) {
        setElapsed((prev) => {
          const next = prev + (dt / duration) * 100
          if (next >= 100) {
            goNext()
            return 100
          }
          return next
        })
      }
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [story?.id, paused])

  function goNext() {
    if (index >= stories.length - 1) {
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

  async function toggleLike(forceLike = false) {
    if (!user || !story || isOwn) return
    const currentlyLiked = likedIds.has(story.id)
    if (forceLike && currentlyLiked) return
    const nextLiked = forceLike ? true : !currentlyLiked

    setLikedIds((prev) => {
      const next = new Set(prev)
      if (nextLiked) next.add(story.id)
      else next.delete(story.id)
      return next
    })
    setLikeCounts((prev) => ({
      ...prev,
      [story.id]: Math.max(0, (prev[story.id] ?? 0) + (nextLiked ? 1 : -1)),
    }))
    triggerHeartPop()

    try {
      if (nextLiked) {
        const { error } = await supabase.from('story_likes').insert({ story_id: story.id, user_id: user.id })
        if (error && error.code !== '23505') throw error
      } else {
        const { error } = await supabase.from('story_likes').delete().eq('story_id', story.id).eq('user_id', user.id)
        if (error) throw error
      }
    } catch (e) {
      console.error(e)
      // rollback nếu lỗi
      setLikedIds((prev) => {
        const next = new Set(prev)
        if (nextLiked) next.delete(story.id)
        else next.add(story.id)
        return next
      })
      setLikeCounts((prev) => ({
        ...prev,
        [story.id]: Math.max(0, (prev[story.id] ?? 0) + (nextLiked ? -1 : 1)),
      }))
      showToast('Không thể thả tim, thử lại nhé', 'error')
    }
  }

  // Double-tap lên media để thả tim, giống Instagram
  function handleMediaTap() {
    const now = Date.now()
    if (now - lastTapRef.current < 300) {
      lastTapRef.current = 0
      if (!isOwn) {
        setFloatingHeart(true)
        setTimeout(() => setFloatingHeart(false), 700)
        toggleLike(true)
      }
    } else {
      lastTapRef.current = now
    }
  }

  async function sendReply() {
    if (!user || !story || !replyText.trim() || sendingReply) return
    setSendingReply(true)
    try {
      const { data: channelId, error } = await supabase.rpc('get_or_create_dm', { other_user: story.author_id })
      if (error) throw error
      const { error: msgError } = await supabase.from('messages').insert({
        channel_id: channelId,
        sender_id: user.id,
        content: `↩️ Trả lời tin: ${replyText.trim()}`,
        attachment_url: story.media_url,
      })
      if (msgError) throw msgError
      showToast('Đã gửi trả lời', 'success')
      setReplyText('')
    } catch (e) {
      console.error(e)
      showToast('Không thể gửi trả lời, thử lại nhé', 'error')
    } finally {
      setSendingReply(false)
    }
  }

  async function deleteStory() {
    if (!story) return
    const { error } = await supabase.from('stories').delete().eq('id', story.id)
    if (error) {
      console.error(error)
      showToast('Không thể xoá tin', 'error')
      return
    }
    showToast('Đã xoá tin', 'success')
    if (stories.length <= 1) onClose()
    else goNext()
  }

  if (!story) return null
  const author = group.author

  return (
    <div className="absolute inset-0 z-40 bg-black flex flex-col">
      <div className="flex gap-1 px-3 pt-4 shrink-0">
        {stories.map((s, i) => (
          <div key={s.id} className="flex-1 h-[3px] rounded-full bg-white/25 overflow-hidden">
            <div
              className="h-full bg-white rounded-full"
              style={{ width: i < index ? '100%' : i === index ? `${elapsed}%` : '0%' }}
            />
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between px-4 pt-3 shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-[var(--surface-2)] border border-white/20 overflow-hidden flex items-center justify-center text-xs font-semibold text-white">
            {author?.avatar_url ? <img src={author.avatar_url} className="w-full h-full object-cover" /> : author?.username?.slice(0, 1).toUpperCase()}
          </div>
          <button
            onClick={() => author?.username && navigate(`/profile/${author.username}`)}
            className="text-xs font-semibold text-white focus-ring rounded-full px-1"
          >
            {isOwn ? 'Tin của bạn' : `@${author?.username ?? 'unknown'}`}
          </button>
          <span className="text-[11px] text-white/50">{timeAgo(story.created_at)}</span>
        </div>
        <div className="flex items-center gap-2">
          {isOwn && (
            <button
              onClick={deleteStory}
              aria-label="Xoá tin"
              className="w-9 h-9 rounded-full bg-white/10 backdrop-blur-md flex items-center justify-center focus-ring"
            >
              <Trash2 size={16} className="text-white" />
            </button>
          )}
          <button
            onClick={onClose}
            aria-label="Đóng"
            className="w-9 h-9 rounded-full bg-white/10 backdrop-blur-md flex items-center justify-center focus-ring"
          >
            <X size={18} className="text-white" />
          </button>
        </div>
      </div>

      <div className="relative flex-1 min-h-0 mt-3">
        <div
          className="absolute inset-0 overflow-hidden select-none"
          onPointerDown={() => setPaused(true)}
          onPointerUp={() => setPaused(false)}
          onPointerLeave={() => setPaused(false)}
          onClick={handleMediaTap}
        >
          {story.media_type === 'video' ? (
            <video
              ref={videoRef}
              key={story.id}
              src={story.media_url}
              className="absolute inset-0 w-full h-full object-cover"
              autoPlay
              muted
              playsInline
              onEnded={goNext}
            />
          ) : (
            <img src={story.media_url} className="absolute inset-0 w-full h-full object-cover" />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-black/10" />
        </div>

        {/* Vùng chạm trái/phải để chuyển tin, chừa khoảng giữa cho nội dung không bị chặn */}
        <button onClick={goPrev} aria-label="Tin trước đó" className="absolute left-0 top-0 bottom-24 w-1/4" />
        <button onClick={goNext} aria-label="Tin tiếp theo" className="absolute right-0 top-0 bottom-24 w-1/4" />

        {floatingHeart && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <Heart size={92} className="text-white fill-white heart-float-pop" />
          </div>
        )}

        {story.caption && (
          <div className="absolute inset-x-6 top-1/2 -translate-y-1/2 text-center pointer-events-none">
            <p className="font-display font-bold text-2xl leading-tight text-white drop-shadow-lg">{story.caption}</p>
          </div>
        )}

        {!isOwn ? (
          <div className="absolute inset-x-4 bottom-5 flex items-center gap-2">
            <input
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              onFocus={() => setPaused(true)}
              onBlur={() => setPaused(false)}
              placeholder={`Trả lời ${author?.username ? '@' + author.username : ''}...`}
              className="flex-1 bg-white/10 backdrop-blur-md border border-white/20 rounded-full px-4 py-2.5 text-sm text-white outline-none placeholder:text-white/50 focus-ring"
              onKeyDown={(e) => e.key === 'Enter' && sendReply()}
            />
            <button
              onClick={() => toggleLike()}
              aria-label={liked ? 'Bỏ thích tin' : 'Thích tin'}
              className="w-11 h-11 shrink-0 rounded-full bg-white/10 backdrop-blur-md border border-white/20 flex items-center justify-center focus-ring"
            >
              <Heart
                size={19}
                className={`${liked ? 'fill-[#ff4f9a] text-[#ff4f9a]' : 'text-white'} ${poppingHeart ? 'heart-pop' : ''}`}
              />
            </button>
            <button
              onClick={() => (replyText.trim() ? sendReply() : setSendSheetOpen(true))}
              disabled={sendingReply}
              aria-label={replyText.trim() ? 'Gửi trả lời' : 'Gửi tin đến...'}
              className="w-11 h-11 shrink-0 rounded-full gradient-nova flex items-center justify-center focus-ring disabled:opacity-40"
            >
              <Send size={16} className="text-black" />
            </button>
          </div>
        ) : (
          (likeCounts[story.id] ?? 0) > 0 && (
            <div className="absolute inset-x-4 bottom-5 flex items-center gap-1.5 text-white/90">
              <Heart size={15} className="fill-[#ff4f9a] text-[#ff4f9a]" />
              <span className="text-xs font-semibold">
                {likeCounts[story.id]} {likeCounts[story.id] === 1 ? 'lượt thích' : 'lượt thích'}
              </span>
            </div>
          )
        )}
      </div>

      {sendSheetOpen && <SendStorySheet story={story} onClose={() => setSendSheetOpen(false)} />}
    </div>
  )
}

function timeAgo(iso: string) {
  const diffMs = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diffMs / 60000)
  if (mins < 1) return 'vừa xong'
  if (mins < 60) return `${mins} phút`
  const hrs = Math.floor(mins / 60)
  return `${hrs} giờ`
}
