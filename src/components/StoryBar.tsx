import { useEffect, useMemo, useState } from 'react'
import { Plus } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import { useComposer } from '../context/ComposerContext'
import type { Story, StoryGroup } from '../types'
import StoryViewer from './StoryViewer'

export default function StoryBar() {
  const { user, profile: me } = useAuth()
  const { openStoryComposer } = useComposer()
  const [stories, setStories] = useState<Story[]>([])
  const [viewedIds, setViewedIds] = useState<Set<string>>(new Set())
  const [openAuthorId, setOpenAuthorId] = useState<string | null>(null)

  async function load() {
    // Dọn tin hết hạn (best-effort, không chặn UI nếu RPC lỗi)
    supabase.rpc('purge_expired_stories').then(() => {})

    const { data, error } = await supabase
      .from('stories')
      .select('*, author:profiles!stories_author_id_fkey(*)')
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
    if (error) {
      console.error(error)
      return
    }
    setStories((data as unknown as Story[]) ?? [])

    if (user) {
      const { data: views } = await supabase.from('story_views').select('story_id').eq('viewer_id', user.id)
      setViewedIds(new Set((views ?? []).map((v) => v.story_id as string)))
    }
  }

  useEffect(() => {
    load()
    const sub = supabase
      .channel('stories_live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'stories' }, () => load())
      .subscribe()
    return () => {
      supabase.removeChannel(sub)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id])

  const myGroup = useMemo(
    () => (user ? { authorId: user.id, stories: stories.filter((s) => s.author_id === user.id) } : null),
    [stories, user]
  )

  const otherGroups: StoryGroup[] = useMemo(() => {
    const order: string[] = []
    const map = new Map<string, Story[]>()
    for (const s of stories) {
      if (s.author_id === user?.id) continue
      if (!map.has(s.author_id)) {
        map.set(s.author_id, [])
        order.push(s.author_id)
      }
      map.get(s.author_id)!.push(s)
    }
    const groups = order.map((authorId) => {
      const list = map.get(authorId)!
      return {
        authorId,
        author: list[0]?.author,
        stories: list,
        allViewed: list.every((s) => viewedIds.has(s.id)),
      }
    })
    // Chưa xem lên trước (giống Instagram), trong mỗi nhóm thì mới nhất trước
    return groups.sort((a, b) => Number(a.allViewed) - Number(b.allViewed))
  }, [stories, viewedIds, user?.id])

  const activeGroup: StoryGroup | null = useMemo(() => {
    if (!openAuthorId) return null
    if (openAuthorId === user?.id && myGroup) {
      return { authorId: myGroup.authorId, author: me ?? undefined, stories: myGroup.stories, allViewed: true }
    }
    return otherGroups.find((g) => g.authorId === openAuthorId) ?? null
  }, [openAuthorId, otherGroups, myGroup, me, user?.id])

  function markViewed(storyId: string) {
    if (!user || viewedIds.has(storyId)) return
    setViewedIds((prev) => new Set(prev).add(storyId))
    supabase.from('story_views').upsert({ story_id: storyId, viewer_id: user.id }).then()
  }

  return (
    <div className="flex gap-3 overflow-x-auto px-5 pb-4 shrink-0">
      {/* Tin của bạn */}
      <button
        onClick={() => (myGroup && myGroup.stories.length > 0 ? setOpenAuthorId(user!.id) : openStoryComposer())}
        className="flex flex-col items-center gap-1.5 shrink-0 focus-ring rounded-2xl"
        aria-label="Tin của bạn"
      >
        <div className="relative w-14 h-14">
          <div
            className={`w-full h-full rounded-full p-[2px] ${myGroup && myGroup.stories.length > 0 ? 'story-ring' : ''}`}
          >
            <div className="w-full h-full rounded-full bg-[var(--surface)] border-2 border-[var(--bg)] overflow-hidden flex items-center justify-center text-sm font-semibold">
              {me?.avatar_url ? <img src={me.avatar_url} className="w-full h-full object-cover" /> : me?.username?.slice(0, 1).toUpperCase()}
            </div>
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation()
              openStoryComposer()
            }}
            aria-label="Thêm tin mới"
            className="absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full bg-[#ff4f9a] border-2 border-[var(--bg)] flex items-center justify-center focus-ring"
          >
            <Plus size={11} className="text-white" strokeWidth={3} />
          </button>
        </div>
        <span className="text-[11px] text-[var(--text-dim)]">Của bạn</span>
      </button>

      {otherGroups.map((group) => (
        <button
          key={group.authorId}
          onClick={() => setOpenAuthorId(group.authorId)}
          className="flex flex-col items-center gap-1.5 shrink-0 focus-ring rounded-2xl"
        >
          <div className={`relative w-14 h-14 rounded-full p-[2px] ${group.allViewed ? 'bg-[var(--border)]' : 'story-ring'}`}>
            <div className="w-full h-full rounded-full bg-[var(--surface)] border-2 border-[var(--bg)] overflow-hidden flex items-center justify-center text-sm font-semibold">
              {group.author?.avatar_url ? (
                <img src={group.author.avatar_url} className="w-full h-full object-cover" />
              ) : (
                group.author?.username?.slice(0, 1).toUpperCase()
              )}
            </div>
            {group.stories.length > 1 && (
              <span className="absolute -bottom-0.5 -right-0.5 min-w-[17px] h-[17px] px-1 rounded-full bg-[#ff4f9a] border-2 border-[var(--bg)] text-white text-[9px] font-bold flex items-center justify-center">
                {group.stories.length}
              </span>
            )}
          </div>
          <span className="text-[11px] text-[var(--text-dim)] max-w-[56px] truncate">{group.author?.username ?? '...'}</span>
        </button>
      ))}

      {activeGroup && (
        <StoryViewer group={activeGroup} isOwn={activeGroup.authorId === user?.id} onView={markViewed} onClose={() => setOpenAuthorId(null)} />
      )}
    </div>
  )
}
