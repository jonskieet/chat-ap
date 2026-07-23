import { useCallback, useEffect, useMemo, useState } from 'react'
import { Plus, Search, X } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import PhoneShell from '../components/PhoneShell'
import BottomNav from '../components/BottomNav'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import type { ChatSummary, Channel, Profile } from '../types'

const TABS = ['All', 'Personal', 'Groups', 'Unanswered'] as const

export default function ChatsList() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const { showToast } = useToast()
  const [activeTab, setActiveTab] = useState<(typeof TABS)[number]>('All')
  const [chats, setChats] = useState<ChatSummary[]>([])
  const [communities, setCommunities] = useState<Channel[]>([])
  const [suggested, setSuggested] = useState<Profile[]>([])
  const [followingIds, setFollowingIds] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [newName, setNewName] = useState('')
  const [newTopic, setNewTopic] = useState('')
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)

    const [chatsRes, communitiesRes] = await Promise.all([
      user ? supabase.rpc('get_my_chats') : Promise.resolve({ data: [], error: null }),
      // suggested_channels() ranks communities matching the user's profile
      // interests first, then falls back to the most recently active ones.
      supabase.rpc('suggested_channels', { p_limit: 8 }),
    ])

    if (chatsRes.error || communitiesRes.error) {
      if (chatsRes.error) console.error(chatsRes.error)
      if (communitiesRes.error) console.error(communitiesRes.error)
      showToast('Không tải được danh sách trò chuyện', 'error')
    }
    setChats((chatsRes.data as ChatSummary[]) ?? [])
    setCommunities(communitiesRes.data ?? [])

    // People suggestions: everyone except me
    const { data: allProfiles } = await supabase
      .from('profiles')
      .select('*')
      .neq('id', user?.id ?? '00000000-0000-0000-0000-000000000000')
      .order('created_at', { ascending: false })
      .limit(10)

    if (user) {
      const { data: follows } = await supabase
        .from('follows')
        .select('following_id')
        .eq('follower_id', user.id)
      setFollowingIds(new Set((follows ?? []).map((f) => f.following_id)))
    }

    setSuggested((allProfiles ?? []).slice(0, 6))
    setLoading(false)
  }, [user])

  useEffect(() => {
    load()
  }, [load])

  // Realtime: refresh the list whenever a message lands anywhere I'm a member
  useEffect(() => {
    if (!user) return
    const sub = supabase
      .channel('chats-list-updates')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, () => load())
      .subscribe()
    return () => {
      supabase.removeChannel(sub)
    }
  }, [user, load])

  async function handleFollow(targetId: string) {
    if (!user) return navigate('/login')
    const already = followingIds.has(targetId)
    if (already) {
      const { error } = await supabase.from('follows').delete().eq('follower_id', user.id).eq('following_id', targetId)
      if (error) {
        console.error(error)
        showToast('Không thể bỏ theo dõi, thử lại nhé', 'error')
        return
      }
      setFollowingIds((prev) => {
        const next = new Set(prev)
        next.delete(targetId)
        return next
      })
    } else {
      const { error } = await supabase.from('follows').insert({ follower_id: user.id, following_id: targetId })
      if (error) {
        console.error(error)
        showToast('Không thể theo dõi, thử lại nhé', 'error')
        return
      }
      setFollowingIds((prev) => new Set(prev).add(targetId))
    }
  }

  async function handleOpenPerson(targetId: string, username: string) {
    if (!user) return navigate(`/profile/${username}`)
    const { data, error } = await supabase.rpc('get_or_create_dm', { other_user: targetId })
    if (error) {
      console.error(error)
      showToast('Không thể mở đoạn chat, thử lại nhé', 'error')
      navigate(`/profile/${username}`)
      return
    }
    navigate(`/chats/${data}`)
  }

  async function handleCreateCommunity() {
    if (!user) return navigate('/login')
    if (!newName.trim() || creating) return
    setCreating(true)
    setCreateError(null)
    try {
      const { data, error } = await supabase.rpc('create_channel', {
        p_name: newName.trim(),
        p_topic: newTopic.trim() || null,
      })
      if (error) throw error
      setCreateOpen(false)
      setNewName('')
      setNewTopic('')
      await load()
      navigate(`/chats/${data}`)
    } catch (e) {
      console.error(e)
      setCreateError('Không thể tạo cộng đồng. Vui lòng thử lại.')
    } finally {
      setCreating(false)
    }
  }

  async function handleJoinCommunity(channelId: string) {
    if (!user) return navigate('/login')
    await supabase.from('channel_members').upsert({ channel_id: channelId, user_id: user.id })
    navigate(`/chats/${channelId}`)
  }

  const filteredChats = useMemo(() => {
    let list = chats
    if (activeTab === 'Personal') list = list.filter((c) => c.is_dm)
    else if (activeTab === 'Groups') list = list.filter((c) => c.is_group)
    else if (activeTab === 'Unanswered') list = list.filter((c) => c.unread_count > 0)

    const q = searchQuery.trim().toLowerCase()
    if (!q) return list
    // Lọc theo tên hiển thị / username của người còn lại (DM) hoặc tên nhóm — client-side,
    // vì ChatsList đã load đủ dữ liệu chats trong state, không cần query mới.
    return list.filter((c) => {
      const name = c.is_dm ? c.other_display_name ?? '' : c.name ?? ''
      const username = c.is_dm ? c.other_username ?? '' : ''
      return name.toLowerCase().includes(q) || username.toLowerCase().includes(q)
    })
  }, [chats, activeTab, searchQuery])

  const filteredSuggested = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return suggested
    return suggested.filter(
      (p) =>
        p.username.toLowerCase().includes(q) ||
        (p.display_name ?? '').toLowerCase().includes(q)
    )
  }, [suggested, searchQuery])

  function openSearch() {
    setSearchOpen(true)
  }

  function closeSearch() {
    setSearchOpen(false)
    setSearchQuery('')
  }

  return (
    <PhoneShell>
      <div className="flex-1 overflow-y-auto px-5 pt-6 pb-32">
        <div className="flex items-center justify-between mb-5 gap-3">
          {searchOpen ? (
            <div className="flex-1 flex items-center gap-2 bg-[var(--surface)] border border-[var(--border)] rounded-full px-4 py-2.5">
              <Search size={16} className="text-[var(--text-dim)] shrink-0" />
              <input
                autoFocus
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Tìm cuộc trò chuyện, người dùng..."
                className="flex-1 bg-transparent outline-none text-sm min-w-0"
              />
              <button onClick={closeSearch} className="p-0.5 focus-ring rounded-full shrink-0" aria-label="Đóng tìm kiếm">
                <X size={16} />
              </button>
            </div>
          ) : (
            <>
              <h1 className="font-display text-3xl font-bold">Chats</h1>
              <button onClick={openSearch} className="p-2 rounded-full bg-[var(--surface)] focus-ring" aria-label="Tìm kiếm">
                <Search size={18} />
              </button>
            </>
          )}
        </div>

        <div className="flex items-center gap-5 mb-6 text-sm">
          {TABS.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`focus-ring rounded-full px-1 pb-1 transition ${
                activeTab === tab
                  ? 'text-white font-semibold border-b-2 border-white'
                  : 'text-[var(--text-dim)]'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Story-style avatars — ring + badge reflect unread state */}
        <div className="flex gap-4 overflow-x-auto pb-2 mb-2 -mx-1 px-1">
          {loading &&
            Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="w-16 h-16 rounded-full bg-[var(--surface)] animate-pulse shrink-0" />
            ))}
          {!loading && filteredChats.length === 0 && (
            <p className="text-sm text-[var(--text-dim)]">
              {searchQuery.trim()
                ? 'Không tìm thấy cuộc trò chuyện phù hợp.'
                : user
                  ? 'Chưa có cuộc trò chuyện nào. Nhắn ai đó ở mục People bên dưới!'
                  : 'Đăng nhập để xem cuộc trò chuyện của bạn.'}
            </p>
          )}
          {filteredChats.slice(0, searchQuery.trim() ? filteredChats.length : 8).map((c) => {
            const label = c.is_dm ? c.other_display_name ?? c.other_username ?? 'Direct message' : c.name
            const avatarUrl = c.is_dm ? c.other_avatar_url : c.cover_url
            return (
              <button
                key={c.channel_id}
                onClick={() => navigate(`/chats/${c.channel_id}`, { state: { preview: c } })}
                className="shrink-0 focus-ring rounded-full relative"
              >
                <div className={`w-16 h-16 rounded-full p-[2px] ${c.unread_count > 0 ? 'story-ring' : 'bg-[var(--border)]'}`}>
                  <div className="w-full h-full rounded-full bg-[var(--surface)] border-2 border-[var(--bg)] overflow-hidden flex items-center justify-center text-lg font-semibold">
                    {avatarUrl ? (
                      <img src={avatarUrl} alt={label} className="w-full h-full object-cover" />
                    ) : (
                      label.slice(0, 1).toUpperCase()
                    )}
                  </div>
                </div>
                {c.is_dm && c.other_status === 'online' && (
                  <span className="absolute bottom-0 right-0 w-3.5 h-3.5 rounded-full bg-green-500 border-2 border-[var(--bg)]" />
                )}
                {c.unread_count > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-[10px] font-bold flex items-center justify-center">
                    {c.unread_count > 9 ? '9+' : c.unread_count}
                  </span>
                )}
              </button>
            )
          })}
        </div>

        {/* Chat previews with last message */}
        <div className="flex flex-col gap-1 mb-7">
          {filteredChats.slice(0, searchQuery.trim() ? filteredChats.length : 6).map((c) => {
            const label = c.is_dm ? c.other_display_name ?? c.other_username ?? 'Direct message' : c.name
            return (
              <button
                key={`row-${c.channel_id}`}
                onClick={() => navigate(`/chats/${c.channel_id}`, { state: { preview: c } })}
                className="flex items-center justify-between gap-3 py-2 focus-ring rounded-xl text-left"
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold truncate">{label}</p>
                  <p className="text-xs text-[var(--text-dim)] truncate max-w-[220px]">
                    {c.last_message ?? 'Bắt đầu trò chuyện...'}
                  </p>
                </div>
                {c.unread_count > 0 && (
                  <span className="shrink-0 min-w-[20px] h-5 px-1.5 rounded-full bg-white text-black text-[11px] font-bold flex items-center justify-center">
                    {c.unread_count}
                  </span>
                )}
              </button>
            )
          })}
        </div>

        <section className="mb-8">
          <h2 className="font-display font-bold text-lg mb-0.5">People</h2>
          <p className="text-xs text-[var(--text-dim)] mb-3">Friends' recommendations</p>
          <div className="flex gap-3 overflow-x-auto -mx-1 px-1">
            {filteredSuggested.length === 0 && !loading && (
              <p className="text-xs text-[var(--text-dim)]">
                {searchQuery.trim() ? 'Không tìm thấy người dùng phù hợp.' : 'Chưa có gợi ý nào.'}
              </p>
            )}
            {filteredSuggested.map((p, i) => (
              <div
                key={p.id}
                className={`relative shrink-0 w-40 h-52 rounded-2xl overflow-hidden p-3 flex flex-col justify-between ${
                  i % 2 === 0 ? 'gradient-flame' : 'gradient-nova'
                }`}
              >
                {p.avatar_url && (
                  <img src={p.avatar_url} alt="" className="absolute inset-0 w-full h-full object-cover opacity-50" />
                )}
                <button
                  onClick={() => handleOpenPerson(p.id, p.username)}
                  className="relative flex items-center justify-between text-left"
                >
                  <span className="text-xs font-semibold bg-black/30 rounded-full px-2 py-1">
                    {p.display_name ?? p.username}
                  </span>
                </button>
                <button
                  onClick={() => handleFollow(p.id)}
                  className="relative text-[10px] font-bold bg-black rounded-full px-2 py-1 focus-ring self-start"
                >
                  {followingIds.has(p.id) ? 'FOLLOWING' : 'FOLLOW'}
                </button>
                <p className="relative font-display font-bold text-sm leading-tight">{p.bio ?? '@' + p.username}</p>
              </div>
            ))}
          </div>
        </section>

        <section>
          <div className="flex items-center justify-between mb-0.5">
            <h2 className="font-display font-bold text-lg">Communities</h2>
            <button
              onClick={() => (user ? setCreateOpen(true) : navigate('/login'))}
              className="flex items-center gap-1 text-xs font-semibold bg-[var(--surface)] border border-[var(--border)] rounded-full px-3 py-1.5 focus-ring"
            >
              <Plus size={13} /> Tạo mới
            </button>
          </div>
          <p className="text-xs text-[var(--text-dim)] mb-3">
            {user ? 'Gợi ý theo chủ đề bạn quan tâm' : 'Popular chat rooms'}
          </p>
          <div className="grid grid-cols-4 gap-3">
            {communities.length === 0 && !loading && (
              <p className="text-xs text-[var(--text-dim)] col-span-4">
                Chưa có cộng đồng nào phù hợp. Hãy tạo cộng đồng đầu tiên!
              </p>
            )}
            {communities.map((c) => (
              <button
                key={c.id}
                onClick={() => handleJoinCommunity(c.id)}
                className="flex flex-col items-center gap-2 focus-ring rounded-2xl"
              >
                <div className="w-14 h-14 rounded-full bg-[var(--surface)] border border-[var(--border)] overflow-hidden flex items-center justify-center text-xl">
                  {c.cover_url ? (
                    <img src={c.cover_url} className="w-full h-full object-cover" />
                  ) : (
                    c.name.slice(0, 1).toUpperCase()
                  )}
                </div>
                <span className="text-xs text-[var(--text-dim)] truncate max-w-[64px]">{c.name}</span>
              </button>
            ))}
          </div>
        </section>
      </div>

      {createOpen && (
        <div
          className="absolute inset-0 z-30 bg-black/70 flex items-end"
          onClick={() => !creating && setCreateOpen(false)}
        >
          <div
            className="w-full bg-[var(--surface)] rounded-t-3xl p-5 border-t border-[var(--border)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-5">
              <h2 className="font-display font-bold text-lg">Tạo cộng đồng mới</h2>
              <button
                onClick={() => setCreateOpen(false)}
                className="p-1 focus-ring rounded-full"
                aria-label="Đóng"
              >
                <X size={18} />
              </button>
            </div>

            <label className="block text-xs font-semibold text-[var(--text-dim)] mb-1.5">Tên cộng đồng</label>
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="vd: photography"
              maxLength={40}
              className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-xl px-4 py-3 text-sm outline-none focus-ring mb-4"
            />

            <label className="block text-xs font-semibold text-[var(--text-dim)] mb-1.5">
              Chủ đề <span className="font-normal">(không bắt buộc)</span>
            </label>
            <textarea
              value={newTopic}
              onChange={(e) => setNewTopic(e.target.value)}
              placeholder="Mô tả ngắn về chủ đề của cộng đồng..."
              rows={3}
              maxLength={140}
              className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-xl px-4 py-3 text-sm outline-none focus-ring resize-none mb-4"
            />

            {createError && <p className="text-xs text-red-400 mb-3">{createError}</p>}

            <button
              onClick={handleCreateCommunity}
              disabled={creating || !newName.trim()}
              className="w-full gradient-nova text-black font-bold rounded-full py-3.5 focus-ring disabled:opacity-50"
            >
              {creating ? 'Đang tạo...' : 'Tạo cộng đồng'}
            </button>
          </div>
        </div>
      )}

      <BottomNav />
    </PhoneShell>
  )
}