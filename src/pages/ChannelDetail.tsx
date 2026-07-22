import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, MessageCircle, Paperclip, Send, Users } from 'lucide-react'
import { useNavigate, useParams } from 'react-router-dom'
import PhoneShell from '../components/PhoneShell'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import type { Channel, Message } from '../types'

export default function ChannelDetail() {
  const { channelId } = useParams()
  const navigate = useNavigate()
  const { profile } = useAuth()
  const [channel, setChannel] = useState<Channel | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [draft, setDraft] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!channelId) return

    async function loadChannel() {
      const { data } = await supabase.from('channels').select('*').eq('id', channelId).single()
      setChannel(data)
    }

    async function loadMessages() {
      const { data } = await supabase
        .from('messages')
        .select('*, sender:profiles(*)')
        .eq('channel_id', channelId)
        .order('created_at', { ascending: true })
        .limit(50)
      setMessages((data as unknown as Message[]) ?? [])
    }

    loadChannel()
    loadMessages()

    // Realtime: new messages appear instantly without reload
    const sub = supabase
      .channel(`messages:${channelId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `channel_id=eq.${channelId}` },
        (payload) => {
          setMessages((prev) => [...prev, payload.new as Message])
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(sub)
    }
  }, [channelId])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length])

  async function sendMessage() {
    if (!draft.trim() || !channelId || !profile) return
    const content = draft.trim()
    setDraft('')
    const { error } = await supabase.from('messages').insert({
      channel_id: channelId,
      sender_id: profile.id,
      content,
    })
    if (error) console.error(error)
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
            <div className="w-7 h-7 rounded-full bg-[var(--surface)]" />
            <span className="text-sm font-medium">{profile?.display_name ?? 'Bạn'}</span>
          </div>
        </div>
        <div className="relative px-5 mt-4 flex items-center gap-3 text-xs">
          <span className="bg-black rounded-full px-3 py-1 font-semibold">#{channel?.name ?? 'kenh'}</span>
          <span className="flex items-center gap-1 text-white/80">
            <MessageCircle size={13} /> {messages.length}
          </span>
          <span className="flex items-center gap-1 text-white/80">
            <Users size={13} /> —
          </span>
        </div>
        <p className="relative px-5 mt-4 font-display font-bold text-2xl leading-tight">
          {channel?.topic ?? 'Đang tải chủ đề...'}
        </p>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {messages.map((m) => {
          const mine = m.sender_id === profile?.id
          return (
            <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'} items-end gap-2`}>
              {!mine && (
                <div className="w-7 h-7 rounded-full bg-[var(--surface-2)] shrink-0" />
              )}
              <div className="max-w-[75%]">
                {!mine && (
                  <p className="text-[11px] text-[var(--text-dim)] mb-1 px-1">
                    {m.sender?.display_name ?? m.sender?.username}
                  </p>
                )}
                <div
                  className={`rounded-2xl px-4 py-2.5 text-sm ${
                    mine ? 'bg-white text-black rounded-br-sm' : 'bg-[var(--surface)] rounded-bl-sm'
                  }`}
                >
                  {m.content}
                </div>
              </div>
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>

      <div className="shrink-0 px-4 pb-6 pt-2">
        <div className="flex items-center gap-2 bg-[var(--surface)] border border-[var(--border)] rounded-full px-3 py-2">
          <button className="p-1 text-[var(--text-dim)] focus-ring" aria-label="Đính kèm">
            <Paperclip size={18} />
          </button>
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
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
