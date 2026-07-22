import { useCallback, useEffect, useState } from 'react'
import { ArrowLeft, MessageCircle } from 'lucide-react'
import { useNavigate, useParams } from 'react-router-dom'
import PhoneShell from '../components/PhoneShell'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import type { Profile as ProfileType } from '../types'

export default function Profile() {
  const { username } = useParams()
  const navigate = useNavigate()
  const { user, signOut } = useAuth()
  const [profile, setProfile] = useState<ProfileType | null>(null)
  const [stats, setStats] = useState({ followers: 0, following: 0, posts: 0 })
  const [isFollowing, setIsFollowing] = useState(false)
  const [followBusy, setFollowBusy] = useState(false)
  const [messageBusy, setMessageBusy] = useState(false)
  const [signingOut, setSigningOut] = useState(false)
  const [loading, setLoading] = useState(true)

  const isOwnProfile = !!user && !!profile && user.id === profile.id

  const load = useCallback(async () => {
    if (!username) return
    setLoading(true)
    const { data: p } = await supabase.from('profiles').select('*').eq('username', username).single()
    setProfile(p)
    if (p) {
      const [{ count: followers }, { count: following }, { count: posts }, followRow] = await Promise.all([
        supabase.from('follows').select('*', { count: 'exact', head: true }).eq('following_id', p.id),
        supabase.from('follows').select('*', { count: 'exact', head: true }).eq('follower_id', p.id),
        supabase.from('posts').select('*', { count: 'exact', head: true }).eq('author_id', p.id),
        user
          ? supabase
              .from('follows')
              .select('follower_id')
              .eq('follower_id', user.id)
              .eq('following_id', p.id)
              .maybeSingle()
          : Promise.resolve({ data: null }),
      ])
      setStats({ followers: followers ?? 0, following: following ?? 0, posts: posts ?? 0 })
      setIsFollowing(!!followRow.data)
    }
    setLoading(false)
  }, [username, user])

  useEffect(() => {
    load()
  }, [load])

  async function handleSignOut() {
    setSigningOut(true)
    await signOut()
    navigate('/login')
  }

  async function handleToggleFollow() {
    if (!user || !profile || followBusy) return
    setFollowBusy(true)
    const wasFollowing = isFollowing
    // Optimistic update — feels instant, we roll back on error.
    setIsFollowing(!wasFollowing)
    setStats((s) => ({ ...s, followers: s.followers + (wasFollowing ? -1 : 1) }))
    try {
      if (wasFollowing) {
        const { error } = await supabase
          .from('follows')
          .delete()
          .eq('follower_id', user.id)
          .eq('following_id', profile.id)
        if (error) throw error
      } else {
        const { error } = await supabase
          .from('follows')
          .insert({ follower_id: user.id, following_id: profile.id })
        if (error) throw error
      }
    } catch (e) {
      console.error(e)
      // Roll back the optimistic update.
      setIsFollowing(wasFollowing)
      setStats((s) => ({ ...s, followers: s.followers + (wasFollowing ? 1 : -1) }))
    } finally {
      setFollowBusy(false)
    }
  }

  async function handleMessage() {
    if (!user || !profile || messageBusy) return
    setMessageBusy(true)
    try {
      const { data, error } = await supabase.rpc('get_or_create_dm', { other_user: profile.id })
      if (error) throw error
      navigate(`/chats/${data}`)
    } catch (e) {
      console.error(e)
    } finally {
      setMessageBusy(false)
    }
  }

  const tags = ['Minimalism', 'DesignThinking', 'Photography']

  return (
    <PhoneShell>
      <div className="flex-1 overflow-y-auto pb-8">
        <div className="relative h-72">
          {profile?.avatar_url ? (
            <img src={profile.avatar_url} className="absolute inset-0 w-full h-full object-cover" />
          ) : (
            <div className="absolute inset-0 gradient-nova opacity-40" />
          )}
          <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-transparent to-[var(--bg)]" />
          <div className="relative flex items-center justify-between px-5 pt-6">
            <button onClick={() => navigate(-1)} className="p-2 rounded-full bg-black/40 focus-ring" aria-label="Quay lại">
              <ArrowLeft size={18} />
            </button>
            <span className="flex items-center gap-1.5 text-xs bg-black/40 rounded-full px-3 py-1">
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--online)' }} />
              {profile?.status === 'online' ? 'online' : 'offline'}
            </span>
          </div>
        </div>

        <div className="px-5 -mt-8 relative">
          <h1 className="font-display text-2xl font-bold">
            {loading ? 'Đang tải...' : profile?.display_name ?? profile?.username ?? 'Không tìm thấy'}
          </h1>
          <p className="text-sm text-[var(--text-dim)] mb-4">@{profile?.username ?? '...'}</p>

          <div className="flex items-center gap-5 mb-5">
            {[
              ['Followers', stats.followers],
              ['Following', stats.following],
              ['Posts', stats.posts],
            ].map(([label, val]) => (
              <div key={label as string}>
                <p className="font-display font-bold text-lg leading-none">{val}</p>
                <p className="text-[11px] text-[var(--text-dim)] mt-1">{label}</p>
              </div>
            ))}
          </div>

          <p className="font-display font-bold text-lg mb-2">
            "{profile?.bio ? profile.bio.split('.')[0] : 'I create. I think. I develop.'}"
          </p>
          <p className="text-sm text-[var(--text-dim)] whitespace-pre-line mb-4">
            {profile?.bio ?? 'Chưa có tiểu sử.'}
          </p>

          <div className="flex flex-wrap gap-2 mb-6">
            {tags.map((t) => (
              <span key={t} className="text-xs bg-[var(--surface)] border border-[var(--border)] rounded-full px-3 py-1.5">
                #{t}
              </span>
            ))}
          </div>

          <h2 className="font-display font-bold text-lg mb-3">Chats</h2>
          <div className="grid grid-cols-2 gap-3 mb-28">
            {['meow', 'style', 'oasis', 'models'].map((name, i) => (
              <div
                key={name}
                className={`h-24 rounded-2xl p-3 flex items-end justify-between text-sm font-semibold ${
                  i % 2 === 0 ? 'gradient-flame' : 'gradient-nova'
                }`}
              >
                {name}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Floating, fixed action bar — mirrors the reference screens */}
      <div className="absolute bottom-0 left-0 right-0 px-5 pb-6 pt-3 bg-gradient-to-t from-[var(--bg)] to-transparent">
        {isOwnProfile ? (
          <button
            onClick={handleSignOut}
            disabled={signingOut}
            className="w-full bg-[var(--surface)] border border-[var(--border)] text-red-400 font-bold rounded-full py-3.5 focus-ring disabled:opacity-50"
          >
            {signingOut ? 'Đang đăng xuất...' : 'Đăng xuất'}
          </button>
        ) : (
          <div className="flex items-center gap-3">
            <button
              onClick={handleToggleFollow}
              disabled={followBusy || !user || loading}
              className={`flex-1 font-bold rounded-full py-3.5 focus-ring disabled:opacity-50 transition-colors ${
                isFollowing
                  ? 'bg-[var(--surface)] border border-[var(--border)] text-[var(--text)]'
                  : 'gradient-nova text-black'
              }`}
            >
              {followBusy ? '...' : isFollowing ? 'ĐANG THEO DÕI' : 'FOLLOW'}
            </button>
            <button
              onClick={handleMessage}
              disabled={messageBusy || !user || loading}
              aria-label="Nhắn tin"
              className="shrink-0 w-12 h-12 rounded-full bg-[var(--surface)] border border-[var(--border)] flex items-center justify-center focus-ring disabled:opacity-50"
            >
              <MessageCircle size={19} />
            </button>
          </div>
        )}
      </div>
    </PhoneShell>
  )
}