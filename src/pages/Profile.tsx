import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowLeft, Camera, MessageCircle, Pencil, Settings, Star, X } from 'lucide-react'
import { useNavigate, useParams } from 'react-router-dom'
import PhoneShell from '../components/PhoneShell'
import BottomNav from '../components/BottomNav'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import type { Post, Profile as ProfileType } from '../types'

export default function Profile() {
  const { username } = useParams()
  const navigate = useNavigate()
  const { user, signOut, refreshProfile } = useAuth()
  const { showToast } = useToast()
  const [profile, setProfile] = useState<ProfileType | null>(null)
  const [stats, setStats] = useState({ followers: 0, following: 0, posts: 0 })
  const [isFollowing, setIsFollowing] = useState(false)
  const [followBusy, setFollowBusy] = useState(false)
  const [messageBusy, setMessageBusy] = useState(false)
  const [signingOut, setSigningOut] = useState(false)
  const [loading, setLoading] = useState(true)

  // My-profile-only state
  const [myPosts, setMyPosts] = useState<Post[]>([])
  const [editOpen, setEditOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [editDisplayName, setEditDisplayName] = useState('')
  const [editBio, setEditBio] = useState('')
  const [editInterests, setEditInterests] = useState<string[]>([])
  const [interestDraft, setInterestDraft] = useState('')
  const [avatarFile, setAvatarFile] = useState<File | null>(null)
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const isOwnProfile = !!user && !!profile && user.id === profile.id

  const load = useCallback(async () => {
    if (!username) return
    setLoading(true)
    const { data: p } = await supabase.from('profiles').select('*').eq('username', username).single()
    setProfile(p)
    if (p) {
      const ownView = !!user && user.id === p.id
      const [{ count: followers }, { count: following }, { count: posts }, followRow, postsRes] = await Promise.all([
        supabase.from('follows').select('*', { count: 'exact', head: true }).eq('following_id', p.id),
        supabase.from('follows').select('*', { count: 'exact', head: true }).eq('follower_id', p.id),
        supabase.from('posts').select('*', { count: 'exact', head: true }).eq('author_id', p.id),
        user && !ownView
          ? supabase
              .from('follows')
              .select('follower_id')
              .eq('follower_id', user.id)
              .eq('following_id', p.id)
              .maybeSingle()
          : Promise.resolve({ data: null }),
        ownView
          ? supabase
              .from('posts')
              .select('*')
              .eq('author_id', p.id)
              .order('created_at', { ascending: false })
          : Promise.resolve({ data: [] }),
      ])
      setStats({ followers: followers ?? 0, following: following ?? 0, posts: posts ?? 0 })
      setIsFollowing(!!followRow.data)
      setMyPosts((postsRes.data as Post[]) ?? [])
    }
    setLoading(false)
  }, [username, user])

  useEffect(() => {
    load()
  }, [load])

  function openEdit() {
    if (!profile) return
    setEditDisplayName(profile.display_name ?? '')
    setEditBio(profile.bio ?? '')
    setEditInterests(profile.interests ?? [])
    setInterestDraft('')
    setAvatarFile(null)
    setAvatarPreview(profile.avatar_url ?? null)
    setSaveError(null)
    setEditOpen(true)
  }

  function onPickAvatar(file: File | null) {
    setAvatarFile(file)
    if (file) setAvatarPreview(URL.createObjectURL(file))
  }

  async function handleSaveProfile() {
    if (!user || !profile || saving) return
    setSaving(true)
    setSaveError(null)
    try {
      let avatar_url = profile.avatar_url
      if (avatarFile) {
        const ext = avatarFile.name.split('.').pop()
        const path = `${user.id}/avatar-${Date.now()}.${ext}`
        const { error: uploadError } = await supabase.storage
          .from('avatars')
          .upload(path, avatarFile, { upsert: true })
        if (uploadError) throw uploadError
        const { data: pub } = supabase.storage.from('avatars').getPublicUrl(path)
        avatar_url = pub.publicUrl
      }
      const { error } = await supabase
        .from('profiles')
        .update({
          display_name: editDisplayName.trim() || null,
          bio: editBio.trim() || null,
          interests: editInterests,
          avatar_url,
        })
        .eq('id', user.id)
      if (error) throw error
      await refreshProfile()
      await load()
      setEditOpen(false)
    } catch (e) {
      console.error(e)
      setSaveError('Không thể lưu thay đổi. Vui lòng thử lại.')
    } finally {
      setSaving(false)
    }
  }

  function addInterest() {
    const value = interestDraft.trim().replace(/^#/, '')
    if (!value) return
    if (editInterests.some((t) => t.toLowerCase() === value.toLowerCase())) {
      setInterestDraft('')
      return
    }
    if (editInterests.length >= 8) return
    setEditInterests((prev) => [...prev, value])
    setInterestDraft('')
  }

  function removeInterest(value: string) {
    setEditInterests((prev) => prev.filter((t) => t !== value))
  }

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
      showToast(wasFollowing ? 'Không thể bỏ theo dõi, thử lại nhé' : 'Không thể theo dõi, thử lại nhé', 'error')
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
      showToast('Không thể mở đoạn chat, thử lại nhé', 'error')
    } finally {
      setMessageBusy(false)
    }
  }

  const tags = profile?.interests && profile.interests.length > 0 ? profile.interests : []

  return (
    <PhoneShell>
      <div className={`flex-1 overflow-y-auto ${isOwnProfile ? 'pb-32' : 'pb-8'}`}>
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
            {isOwnProfile ? (
              <div className="flex items-center gap-2">
                <span className="flex items-center gap-1.5 text-xs bg-black/40 rounded-full px-3 py-1">
                  <span className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--online)' }} />
                  online
                </span>
                <button
                  onClick={() => setSettingsOpen(true)}
                  className="p-2 rounded-full bg-black/40 focus-ring"
                  aria-label="Cài đặt"
                >
                  <Settings size={16} />
                </button>
              </div>
            ) : (
              <span className="flex items-center gap-1.5 text-xs bg-black/40 rounded-full px-3 py-1">
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--online)' }} />
                {profile?.status === 'online' ? 'online' : 'offline'}
              </span>
            )}
          </div>
        </div>

        <div className="px-5 -mt-8 relative">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h1 className="font-display text-2xl font-bold">
                {loading ? 'Đang tải...' : profile?.display_name ?? profile?.username ?? 'Không tìm thấy'}
              </h1>
              <p className="text-sm text-[var(--text-dim)] mb-4">@{profile?.username ?? '...'}</p>
            </div>
            {isOwnProfile && !loading && (
              <button
                onClick={openEdit}
                className="shrink-0 flex items-center gap-1.5 text-xs font-semibold bg-[var(--surface)] border border-[var(--border)] rounded-full px-3 py-2 focus-ring"
              >
                <Pencil size={13} />
                Chỉnh sửa
              </button>
            )}
          </div>

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

          {!isOwnProfile && (
            <>
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
              <div className="grid grid-cols-2 gap-3 mb-6">
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
            </>
          )}

          {isOwnProfile && (
            <>
              <p className="text-sm text-[var(--text-dim)] whitespace-pre-line mb-6">
                {profile?.bio || 'Bạn chưa có tiểu sử. Nhấn "Chỉnh sửa" để thêm.'}
              </p>

              <h2 className="font-display font-bold text-lg mb-3">Bài viết của bạn</h2>
              {myPosts.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-[var(--border)] py-10 text-center mb-6">
                  <p className="text-sm text-[var(--text-dim)] mb-3">Bạn chưa đăng bài nào.</p>
                  <button
                    onClick={() => navigate('/')}
                    className="text-xs font-semibold gradient-nova text-black rounded-full px-4 py-2 focus-ring"
                  >
                    Đăng bài đầu tiên
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-1.5 mb-6">
                  {myPosts.map((p) => (
                    <div key={p.id} className="relative aspect-square rounded-lg overflow-hidden bg-[var(--surface)]">
                      {p.media_url ? (
                        <img src={p.media_url} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full gradient-flame flex items-center justify-center p-2">
                          <p className="text-[10px] leading-snug line-clamp-4">{p.caption}</p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Floating, fixed action bar — mirrors the reference screens */}
      {!isOwnProfile && (
        <div className="absolute bottom-0 left-0 right-0 px-5 pb-6 pt-3 bg-gradient-to-t from-[var(--bg)] to-transparent">
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
        </div>
      )}

      {isOwnProfile && <BottomNav />}

      {/* Edit profile sheet */}
      {editOpen && (
        <div className="absolute inset-0 z-30 bg-black/70 flex items-end">
          <div className="w-full max-h-[85%] overflow-y-auto bg-[var(--surface)] rounded-t-3xl p-5 border-t border-[var(--border)]">
            <div className="flex items-center justify-between mb-5">
              <h2 className="font-display font-bold text-lg">Chỉnh sửa hồ sơ</h2>
              <button onClick={() => setEditOpen(false)} className="p-1 focus-ring rounded-full" aria-label="Đóng">
                <X size={18} />
              </button>
            </div>

            <div className="flex flex-col items-center mb-6">
              <button
                onClick={() => fileInputRef.current?.click()}
                className="relative w-24 h-24 rounded-full overflow-hidden bg-[var(--surface-2)] border border-[var(--border)] focus-ring flex items-center justify-center"
                aria-label="Đổi ảnh đại diện"
              >
                {avatarPreview ? (
                  <img src={avatarPreview} className="w-full h-full object-cover" />
                ) : (
                  <span className="text-2xl font-bold">{profile?.username?.slice(0, 1).toUpperCase()}</span>
                )}
                <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
                  <Camera size={20} />
                </div>
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => onPickAvatar(e.target.files?.[0] ?? null)}
              />
              <p className="text-xs text-[var(--text-dim)] mt-2">Nhấn để đổi ảnh</p>
            </div>

            <label className="block text-xs font-semibold text-[var(--text-dim)] mb-1.5">Tên hiển thị</label>
            <input
              value={editDisplayName}
              onChange={(e) => setEditDisplayName(e.target.value)}
              placeholder="Tên hiển thị của bạn"
              maxLength={60}
              className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-xl px-4 py-3 text-sm outline-none focus-ring mb-4"
            />

            <label className="block text-xs font-semibold text-[var(--text-dim)] mb-1.5">Tiểu sử</label>
            <textarea
              value={editBio}
              onChange={(e) => setEditBio(e.target.value)}
              placeholder="Vài dòng giới thiệu về bạn..."
              rows={4}
              maxLength={280}
              className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-xl px-4 py-3 text-sm outline-none focus-ring resize-none mb-1"
            />
            <p className="text-[11px] text-[var(--text-dim)] text-right mb-4">{editBio.length}/280</p>

            <label className="block text-xs font-semibold text-[var(--text-dim)] mb-1.5">
              Chủ đề quan tâm <span className="font-normal">(tối đa 8, dùng để gợi ý cộng đồng phù hợp)</span>
            </label>
            {editInterests.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-2">
                {editInterests.map((t) => (
                  <span
                    key={t}
                    className="flex items-center gap-1 text-xs bg-[var(--surface-2)] border border-[var(--border)] rounded-full pl-3 pr-1.5 py-1"
                  >
                    #{t}
                    <button
                      onClick={() => removeInterest(t)}
                      className="p-0.5 rounded-full hover:bg-[var(--border)] focus-ring"
                      aria-label={`Xóa ${t}`}
                    >
                      <X size={11} />
                    </button>
                  </span>
                ))}
              </div>
            )}
            <div className="flex items-center gap-2 mb-4">
              <input
                value={interestDraft}
                onChange={(e) => setInterestDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    addInterest()
                  }
                }}
                placeholder="vd: photography"
                maxLength={24}
                disabled={editInterests.length >= 8}
                className="flex-1 bg-[var(--surface-2)] border border-[var(--border)] rounded-xl px-4 py-2.5 text-sm outline-none focus-ring disabled:opacity-50"
              />
              <button
                onClick={addInterest}
                disabled={!interestDraft.trim() || editInterests.length >= 8}
                className="shrink-0 text-xs font-semibold bg-[var(--surface-2)] border border-[var(--border)] rounded-full px-3 py-2.5 focus-ring disabled:opacity-50"
              >
                Thêm
              </button>
            </div>

            {saveError && <p className="text-xs text-red-400 mb-3">{saveError}</p>}

            <button
              onClick={handleSaveProfile}
              disabled={saving}
              className="w-full gradient-nova text-black font-bold rounded-full py-3.5 focus-ring disabled:opacity-50"
            >
              {saving ? 'Đang lưu...' : 'Lưu thay đổi'}
            </button>
          </div>
        </div>
      )}

      {/* Settings sheet */}
      {settingsOpen && (
        <div className="absolute inset-0 z-30 bg-black/70 flex items-end" onClick={() => setSettingsOpen(false)}>
          <div
            className="w-full bg-[var(--surface)] rounded-t-3xl p-5 border-t border-[var(--border)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-5">
              <h2 className="font-display font-bold text-lg">Cài đặt</h2>
              <button onClick={() => setSettingsOpen(false)} className="p-1 focus-ring rounded-full" aria-label="Đóng">
                <X size={18} />
              </button>
            </div>
            <button
              onClick={() => {
                setSettingsOpen(false)
                openEdit()
              }}
              className="w-full text-left px-4 py-3.5 rounded-xl bg-[var(--surface-2)] border border-[var(--border)] mb-3 focus-ring flex items-center gap-3"
            >
              <Pencil size={16} />
              <span className="text-sm font-medium">Chỉnh sửa hồ sơ</span>
            </button>
            <button
              onClick={() => {
                setSettingsOpen(false)
                navigate('/saved')
              }}
              className="w-full text-left px-4 py-3.5 rounded-xl bg-[var(--surface-2)] border border-[var(--border)] mb-3 focus-ring flex items-center gap-3"
            >
              <Star size={16} />
              <span className="text-sm font-medium">Bài đã lưu</span>
            </button>
            <button
              onClick={handleSignOut}
              disabled={signingOut}
              className="w-full text-left px-4 py-3.5 rounded-xl bg-[var(--surface-2)] border border-[var(--border)] text-red-400 font-bold focus-ring disabled:opacity-50"
            >
              {signingOut ? 'Đang đăng xuất...' : 'Đăng xuất'}
            </button>
          </div>
        </div>
      )}
    </PhoneShell>
  )
}
