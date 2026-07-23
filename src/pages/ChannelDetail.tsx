import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, MessageCircle, Paperclip, Send, Users } from 'lucide-react'
import { useNavigate, useParams } from 'react-router-dom'
import PhoneShell from '../components/PhoneShell'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import type { Channel, Message, MessageReaction, Profile, ReactionEmotion } from '../types'

const QUICK_REACTIONS: ReactionEmotion[] = ['love', 'fire', 'haha', 'wow', 'sad']
const REACTION_EMOJI: Record<ReactionEmotion, string> = {
  love: '❤️',
  fire: '🔥',
  haha: '😂',
  wow: '😮',
  sad: '😢',
}

export default function ChannelDetail() {
  const { channelId } = useParams()
  const navigate = useNavigate()
  const { profile } = useAuth()
  const [channel, setChannel] = useState<Channel | null>(null)
  const [otherUser, setOtherUser] = useState<Profile | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [reactions, setReactions] = useState<Record<string, MessageReaction[]>>({})
  const [memberCount, setMemberCount] = useState<number | null>(null)
  const [messagesLoading, setMessagesLoading] = useState(true)
  const [draft, setDraft] = useState('')
  const [typingUser, setTypingUser] = useState<string | null>(null)
  const [openReactionFor, setOpenReactionFor] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const typingTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!channelId) return
    setMessagesLoading(true)
    setMessages([])
    setChannel(null)

    async function loadChannel() {
      const { data, error } = await supabase.from('channels').select('*').eq('id', channelId).single()
      if (error) console.error(error)
      setChannel(data)

      if (data?.is_dm) {
        // Who am I chatting with? channel_members holds both sides of the DM;
        // filter out myself and join profiles for their live avatar/name/status.
        const { data: members, error: memberErr } = await supabase
          .from('channel_members')
          .select('user_id, profile:profiles(*)')
          .eq('channel_id', channelId)
          .neq('user_id', profile?.id ?? '00000000-0000-0000-0000-000000000000')
          .limit(1)
          .maybeSingle()
        if (memberErr) console.error(memberErr)
        setOtherUser((members?.profile as unknown as Profile) ?? null)
      } else {
        setOtherUser(null)
      }
    }

    async function loadMemberCount() {
      const { count } = await supabase
        .from('channel_members')
        .select('*', { count: 'exact', head: true })
        .eq('channel_id', channelId)
      setMemberCount(count ?? 0)
    }

    async function loadMessages() {
      const { data } = await supabase
        .from('messages')
        .select('*, sender:profiles(*)')
        .eq('channel_id', channelId)
        .order('created_at', { ascending: true })
        .limit(50)
      setMessages((data as unknown as Message[]) ?? [])
      setMessagesLoading(false)

      const ids = (data ?? []).map((m) => m.id)
      if (ids.length) {
        const { data: reacts } = await supabase
          .from('message_reactions')
          .select('*')
          .in('message_id', ids)
        const grouped: Record<string, MessageReaction[]> = {}
        for (const r of (reacts as MessageReaction[]) ?? []) {
          grouped[r.message_id] = [...(grouped[r.message_id] ?? []), r]
        }
        setReactions(grouped)
      }
    }

    async function markRead() {
      await supabase.rpc('mark_channel_read', { p_channel_id: channelId })
    }

    loadChannel()
    loadMemberCount()
    loadMessages()
    markRead()

    // Realtime: new messages, live reactions, and typing indicator
    const sub = supabase
      .channel(`messages:${channelId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `channel_id=eq.${channelId}` },
        (payload) => {
          const incoming = payload.new as Message
          setMessages((prev) => (prev.some((m) => m.id === incoming.id) ? prev : [...prev, incoming]))
          markRead()
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'message_reactions' },
        () => loadMessages()
      )
      .on('broadcast', { event: 'typing' }, ({ payload }) => {
        if (payload.userId === profile?.id) return
        setTypingUser(payload.name ?? 'Someone')
        setTimeout(() => setTypingUser(null), 2500)
      })
      .subscribe()

    return () => {
      supabase.removeChannel(sub)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelId])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length])

  function broadcastTyping() {
    if (!channelId || !profile) return
    supabase.channel(`messages:${channelId}`).send({
      type: 'broadcast',
      event: 'typing',
      payload: { userId: profile.id, name: profile.display_name ?? profile.username },
    })
  }

  function handleDraftChange(value: string) {
    setDraft(value)
    if (typingTimeout.current) clearTimeout(typingTimeout.current)
    typingTimeout.current = setTimeout(broadcastTyping, 150)
  }

  async function sendMessage() {
    if (!draft.trim() || !channelId || !profile) return
    const content = draft.trim()
    setDraft('')

    // Optimistic append: hiện ngay trong UI, không đợi Realtime round-trip
    const tempId = `temp-${Date.now()}`
    const optimisticMessage: Message = {
      id: tempId,
      channel_id: channelId,
      sender_id: profile.id,
      content,
      attachment_url: null,
      created_at: new Date().toISOString(),
      sender: profile,
    } as unknown as Message
    setMessages((prev) => [...prev, optimisticMessage])

    const { data, error } = await supabase
      .from('messages')
      .insert({ channel_id: channelId, sender_id: profile.id, content })
      .select('*, sender:profiles(*)')
      .single()

    if (error) {
      console.error(error)
      // rollback nếu insert thất bại
      setMessages((prev) => prev.filter((m) => m.id !== tempId))
      setDraft(content)
      return
    }

    // thay message tạm bằng bản ghi thật từ DB (id thật, timestamp thật)
    setMessages((prev) => prev.map((m) => (m.id === tempId ? (data as unknown as Message) : m)))
  }

  async function toggleReaction(messageId: string, emotion: ReactionEmotion) {
    if (!profile) return
    setOpenReactionFor(null)
    const mine = reactions[messageId]?.find((r) => r.user_id === profile.id)
    if (mine && mine.emotion === emotion) {
      await supabase.from('message_reactions').delete().eq('message_id', messageId).eq('user_id', profile.id)
    } else if (mine) {
      await supabase
        .from('message_reactions')
        .update({ emotion })
        .eq('message_id', messageId)
        .eq('user_id', profile.id)
    } else {
      await supabase.from('message_reactions').insert({ message_id: messageId, user_id: profile.id, emotion })
    }
  }

  return (
    <PhoneShell>
      <div className="relative h-56 shrink-0 gradient-flame">
        {channel?.cover_url && (
          <img src={channel.cover_url} className="absolute inset-0 w-full h-full object-cover opacity-70" />
        )}
        <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-black/10 to-[var(--bg)]" />
        <div className="relative flex items-center justify-between px-5 pt-6">
          <button onClick={() => navigate(-1)} className="p-2 rounded-full bg-black/30 focus-ring" aria-label="Quay lại">
            <ArrowLeft size={18} />
          </button>
          <div className="flex items-center gap-2 bg-black/40 rounded-full pl-1 pr-3 py-1">
            <div className="relative w-7 h-7 rounded-full bg-[var(--surface)] overflow-hidden shrink-0 skeleton-glass">
              {(channel?.is_dm ? otherUser?.avatar_url : channel?.cover_url) && (
                <img
                  src={channel?.is_dm ? otherUser?.avatar_url ?? '' : channel?.cover_url ?? ''}
                  alt=""
                  className="w-full h-full object-cover"
                />
              )}
              {channel?.is_dm && otherUser?.status === 'online' && (
                <span className="absolute bottom-0 right-0 w-2 h-2 rounded-full bg-green-500 border border-black" />
              )}
            </div>
            {channel ? (
              <span className="text-sm font-medium">
                {channel.is_dm ? otherUser?.display_name ?? otherUser?.username ?? 'Đang tải...' : profile?.display_name ?? 'Bạn'}
              </span>
            ) : (
              <span className="h-4 w-16 rounded skeleton-glass inline-block" />
            )}
          </div>
        </div>
        <div className="relative px-5 mt-4 flex items-center gap-3 text-xs">
          {channel ? (
            <span className="bg-black rounded-full px-3 py-1 font-semibold">
              {channel.is_dm ? `@${otherUser?.username ?? '...'}` : `#${channel.name ?? 'kenh'}`}
            </span>
          ) : (
            <span className="h-6 w-16 rounded-full skeleton-glass inline-block" />
          )}
          <span className="flex items-center gap-1 text-white/80">
            <MessageCircle size={13} /> {messages.length}
          </span>
          <span className="flex items-center gap-1 text-white/80">
            <Users size={13} /> {memberCount ?? '—'}
          </span>
        </div>
        {!channel ? (
          <div className="relative px-5 mt-4 space-y-2">
            <div className="h-6 w-2/3 rounded-lg skeleton-glass" />
            <div className="h-6 w-1/3 rounded-lg skeleton-glass" />
          </div>
        ) : channel.is_dm ? (
          otherUser?.bio && (
            <p className="relative px-5 mt-4 font-display font-bold text-2xl leading-tight">{otherUser.bio}</p>
          )
        ) : (
          <p className="relative px-5 mt-4 font-display font-bold text-2xl leading-tight">{channel.topic}</p>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {messagesLoading ? (
          <>
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className={`flex ${i % 2 ? 'justify-end' : 'justify-start'}`}>
                <div
                  className="h-9 rounded-2xl skeleton-glass"
                  style={{ width: `${120 + (i % 3) * 30}px` }}
                />
              </div>
            ))}
          </>
        ) : messages.length === 0 ? (
          <p className="text-center text-xs text-[var(--text-dim)] mt-6">Chưa có tin nhắn nào</p>
        ) : null}
        {messages.map((m) => {
          const mine = m.sender_id === profile?.id
          const msgReactions = reactions[m.id] ?? []
          const counts = msgReactions.reduce<Partial<Record<ReactionEmotion, number>>>((acc, r) => {
            acc[r.emotion] = (acc[r.emotion] ?? 0) + 1
            return acc
          }, {})
          return (
            <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'} items-end gap-2`}>
              {!mine && (
                <div className="w-7 h-7 rounded-full bg-[var(--surface-2)] shrink-0 overflow-hidden flex items-center justify-center text-[11px] font-semibold">
                  {m.sender?.avatar_url ? (
                    <img src={m.sender.avatar_url} alt="" className="w-full h-full object-cover" />
                  ) : (
                    (m.sender?.display_name ?? m.sender?.username ?? '?').slice(0, 1).toUpperCase()
                  )}
                </div>
              )}
              <div className="max-w-[75%]">
                {!mine && (
                  <p className="text-[11px] text-[var(--text-dim)] mb-1 px-1">
                    {m.sender?.display_name ?? m.sender?.username}
                  </p>
                )}
                <button
                  onClick={() => setOpenReactionFor(openReactionFor === m.id ? null : m.id)}
                  className={`text-left rounded-2xl px-4 py-2.5 text-sm focus-ring ${
                    mine ? 'bg-white text-black rounded-br-sm' : 'bg-[var(--surface)] rounded-bl-sm'
                  }`}
                >
                  {m.content}
                </button>

                {Object.keys(counts).length > 0 && (
                  <div className="flex gap-1 mt-1 px-1">
                    {(Object.entries(counts) as [ReactionEmotion, number][]).map(([emotion, n]) => (
                      <span key={emotion} className="text-[11px] bg-[var(--surface)] rounded-full px-1.5 py-0.5">
                        {REACTION_EMOJI[emotion]} {n}
                      </span>
                    ))}
                  </div>
                )}

                {openReactionFor === m.id && (
                  <div className="flex gap-1 mt-1 bg-[var(--surface)] rounded-full px-2 py-1 w-fit">
                    {QUICK_REACTIONS.map((emotion) => (
                      <button
                        key={emotion}
                        onClick={() => toggleReaction(m.id, emotion)}
                        className="text-base focus-ring rounded-full hover:scale-110 transition"
                        aria-label={emotion}
                      >
                        {REACTION_EMOJI[emotion]}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )
        })}
        {typingUser && (
          <p className="text-xs text-[var(--text-dim)] px-2 italic">{typingUser} is typing…</p>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="shrink-0 px-4 pb-6 pt-2">
        <div className="flex items-center gap-2 bg-[var(--surface)] border border-[var(--border)] rounded-full px-3 py-2">
          <button className="p-1 text-[var(--text-dim)] focus-ring" aria-label="Đính kèm">
            <Paperclip size={18} />
          </button>
          <input
            value={draft}
            onChange={(e) => handleDraftChange(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
            placeholder="Send a message"
            className="flex-1 bg-transparent outline-none text-sm placeholder:text-[var(--text-dim)]"
          />
          <button
            onClick={sendMessage}
            className="gradient-nova p-2 rounded-full text-white focus-ring disabled:opacity-40"
            disabled={!draft.trim()}
            aria-label="Gửi"
          >
            <Send size={15} />
          </button>
        </div>
      </div>
    </PhoneShell>
  )
}