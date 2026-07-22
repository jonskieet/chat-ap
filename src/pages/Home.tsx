import { useEffect, useState } from 'react'
import { Bell, MessageSquare, Plus, X } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import PhoneShell from '../components/PhoneShell'
import BottomNav from '../components/BottomNav'
import ReactionButton from '../components/ReactionButton'
import { supabase } from '../lib/supabaseClient'
import type { Post, Profile, ReactionEmotion } from '../types'

export default function Home() {
  const navigate = useNavigate()
  const [posts, setPosts] = useState<Post[]>([])
  const [loading, setLoading] = useState(true)
  const [me, setMe] = useState<Profile | null>(null)
  const [composerOpen, setComposerOpen] = useState(false)
  const [caption, setCaption] = useState('')
  const [mediaFile, setMediaFile] = useState<File | null>(null)
  const [posting, setPosting] = useState(false)

  async function loadPosts() {
    setLoading(true)
    const { data: postsData, error } = await supabase
      .from('posts')
      .select('*, author:profiles(*)')
      .order('created_at', { ascending: false })
      .limit(20)

    if (error) {
      console.error(error)
      setLoading(false)
      return
    }

    const list = (postsData as unknown as Post[]) ?? []
    const { data: userRes } = await supabase.auth.getUser()
    const uid = userRes.user?.id

    const enriched = await Promise.all(
      list.map(async (p) => {
        const { data: reactions } = await supabase
          .from('post_reactions')
          .select('user_id, emotion')
          .eq('post_id', p.id)

        const counts: Partial<Record<ReactionEmotion, number>> = {}
        let mine: ReactionEmotion | null = null
        for (const r of reactions ?? []) {
          const emo = r.emotion as ReactionEmotion
          counts[emo] = (counts[emo] ?? 0) + 1
          if (r.user_id === uid) mine = emo
        }
        return { ...p, reaction_counts: counts, my_reaction: mine }
      })
    )

    setPosts(enriched)
    setLoading(false)
  }

  useEffect(() => {
    async function loadMe() {
      const { data } = await supabase.auth.getUser()
      if (data.user) {
        const { data: p } = await supabase.from('profiles').select('*').eq('id', data.user.id).single()
        setMe(p)
      }
    }
    loadMe()
    loadPosts()

    const sub = supabase
      .channel('post_reactions_live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'post_reactions' }, () => {
        loadPosts()
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'posts' }, () => {
        loadPosts()
      })
      .subscribe()

    return () => {
      supabase.removeChannel(sub)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleReact(post: Post, emotion: ReactionEmotion | null) {
    if (!me) return
    if (emotion === null) {
      await supabase.from('post_reactions').delete().eq('post_id', post.id).eq('user_id', me.id)
    } else if (post.my_reaction) {
      await supabase
        .from('post_reactions')
        .update({ emotion })
        .eq('post_id', post.id)
        .eq('user_id', me.id)
    } else {
      await supabase.from('post_reactions').insert({ post_id: post.id, user_id: me.id, emotion })
    }
    loadPosts()
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
      loadPosts()
    } catch (e) {
      console.error(e)
    } finally {
      setPosting(false)
    }
  }

  return (
    <PhoneShell>
      <div className="flex items-center justify-between px-5 pt-6 pb-4 shrink-0">
        <h1 className="font-display text-2xl font-bold">Home</h1>
        <div className="flex items-center gap-2">
          <button className="w-9 h-9 rounded-full bg-[var(--surface)] flex items-center justify-center focus-ring" aria-label="Thông báo">
            <Bell size={16} />
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
      <div className="flex-1 overflow-y-auto px-5 pb-32 space-y-5">
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
        {posts.map((post) => (
          <div key={post.id} className="relative rounded-3xl overflow-hidden bg-[var(--surface)] min-h-[340px] flex flex-col justify-end">
            {post.media_url ? (
              <img src={post.media_url} className="absolute inset-0 w-full h-full object-cover" />
            ) : (
              <div className="absolute inset-0 gradient-flame opacity-70" />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent" />

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

            <div className="absolute right-3 bottom-24">
              <ReactionButton
                myReaction={post.my_reaction ?? null}
                count={Object.values(post.reaction_counts ?? {}).reduce((a, b) => a + (b ?? 0), 0)}
                onReact={(emo) => handleReact(post, emo)}
              />
            </div>

            <div className="relative px-4 pb-4 pr-16">
              {post.caption && <p className="text-sm text-white leading-snug">{post.caption}</p>}
              <p className="text-[11px] text-white/60 mt-1">
                {new Date(post.created_at).toLocaleDateString('vi-VN')}
              </p>
            </div>
          </div>
        ))}
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
