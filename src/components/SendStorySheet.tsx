import { useEffect, useState } from 'react'
import { Check, Search, Send, X } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import type { ChatSummary, Profile, Story } from '../types'

interface Recipient {
  id: string
  username: string
  display_name: string | null
  avatar_url: string | null
}

interface SendStorySheetProps {
  story: Story
  onClose: () => void
}

export default function SendStorySheet({ story, onClose }: SendStorySheetProps) {
  const { user } = useAuth()
  const { showToast } = useToast()
  const [recent, setRecent] = useState<Recipient[]>([])
  const [query, setQuery] = useState('')
  const [searchResults, setSearchResults] = useState<Recipient[]>([])
  const [searching, setSearching] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [note, setNote] = useState('')
  const [sending, setSending] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function load() {
      const { data, error } = await supabase.rpc('get_my_chats')
      if (!cancelled) {
        if (error) console.error(error)
        const dms = ((data as ChatSummary[]) ?? []).filter((c) => c.is_dm && c.other_user_id)
        setRecent(
          dms.map((c) => ({
            id: c.other_user_id as string,
            username: c.other_username ?? 'unknown',
            display_name: c.other_display_name,
            avatar_url: c.other_avatar_url,
          }))
        )
        setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!query.trim()) {
      setSearchResults([])
      return
    }
    let cancelled = false
    setSearching(true)
    const timer = setTimeout(async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, username, display_name, avatar_url')
        .neq('id', user?.id ?? '00000000-0000-0000-0000-000000000000')
        .ilike('username', `%${query.trim()}%`)
        .limit(15)
      if (!cancelled) {
        if (error) console.error(error)
        setSearchResults((data as Recipient[] | null) ?? [])
        setSearching(false)
      }
    }, 250)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [query, user?.id])

  function toggle(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function send() {
    if (!user || selectedIds.size === 0 || sending) return
    setSending(true)
    try {
      const targets = Array.from(selectedIds)
      for (const targetId of targets) {
        const { data: channelId, error } = await supabase.rpc('get_or_create_dm', { other_user: targetId })
        if (error) throw error
        const { error: msgError } = await supabase.from('messages').insert({
          channel_id: channelId,
          sender_id: user.id,
          content: note.trim() || null,
          attachment_url: story.media_url,
        })
        if (msgError) throw msgError
      }
      showToast(targets.length > 1 ? 'Đã gửi tin đến mọi người' : 'Đã gửi tin', 'success')
      onClose()
    } catch (e) {
      console.error(e)
      showToast('Không thể gửi, thử lại nhé', 'error')
    } finally {
      setSending(false)
    }
  }

  const list = query.trim() ? searchResults : recent
  const listLoading = query.trim() ? searching : loading

  return (
    <div className="absolute inset-0 z-50 bg-black/60 backdrop-blur-sm flex flex-col justify-end" onClick={onClose}>
      <div
        className="bg-[var(--surface)] rounded-t-3xl max-h-[80%] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 pt-4 pb-2 shrink-0">
          <h2 className="font-display font-bold text-lg">Gửi tin đến</h2>
          <button onClick={onClose} aria-label="Đóng" className="w-8 h-8 rounded-full bg-[var(--surface-2)] flex items-center justify-center focus-ring">
            <X size={16} />
          </button>
        </div>

        <div className="px-5 pb-3 shrink-0">
          <div className="flex items-center gap-2 bg-[var(--surface-2)] rounded-full px-4 py-2.5">
            <Search size={16} className="text-[var(--text-dim)]" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Tìm người dùng..."
              className="flex-1 bg-transparent outline-none text-sm placeholder:text-[var(--text-dim)]"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 pb-2 space-y-1 min-h-[180px]">
          {listLoading && <p className="text-center text-xs text-[var(--text-dim)] py-6">Đang tải...</p>}
          {!listLoading && list.length === 0 && (
            <p className="text-center text-xs text-[var(--text-dim)] py-6">
              {query.trim() ? 'Không tìm thấy người dùng' : 'Chưa có cuộc trò chuyện nào'}
            </p>
          )}
          {!listLoading &&
            list.map((p) => {
              const selected = selectedIds.has(p.id)
              return (
                <button
                  key={p.id}
                  onClick={() => toggle(p.id)}
                  className="w-full flex items-center gap-3 px-2 py-2 rounded-2xl focus-ring hover:bg-[var(--surface-2)] transition"
                >
                  <div className="w-11 h-11 rounded-full bg-[var(--surface-2)] overflow-hidden flex items-center justify-center text-sm font-semibold shrink-0">
                    {p.avatar_url ? <img src={p.avatar_url} className="w-full h-full object-cover" /> : p.username.slice(0, 1).toUpperCase()}
                  </div>
                  <div className="flex-1 text-left min-w-0">
                    <p className="text-sm font-semibold truncate">{p.display_name ?? p.username}</p>
                    <p className="text-xs text-[var(--text-dim)] truncate">@{p.username}</p>
                  </div>
                  <div
                    className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 border-2 ${
                      selected ? 'bg-[#ff4f9a] border-[#ff4f9a]' : 'border-[var(--border)]'
                    }`}
                  >
                    {selected && <Check size={14} className="text-white" strokeWidth={3} />}
                  </div>
                </button>
              )
            })}
        </div>

        <div className="px-5 pt-2 pb-[calc(env(safe-area-inset-bottom,0px)+16px)] shrink-0 border-t border-[var(--border)] mt-1">
          <div className="flex items-center gap-2 pt-3">
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Nhắn thêm (không bắt buộc)..."
              className="flex-1 bg-[var(--surface-2)] rounded-full px-4 py-2.5 text-sm outline-none placeholder:text-[var(--text-dim)] focus-ring"
              onKeyDown={(e) => e.key === 'Enter' && send()}
            />
            <button
              onClick={send}
              disabled={selectedIds.size === 0 || sending}
              aria-label="Gửi"
              className="w-11 h-11 shrink-0 rounded-full gradient-nova flex items-center justify-center focus-ring disabled:opacity-40"
            >
              <Send size={16} className="text-black" />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
