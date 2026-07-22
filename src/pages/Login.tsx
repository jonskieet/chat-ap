import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import PhoneShell from '../components/PhoneShell'
import { supabase } from '../lib/supabaseClient'

export default function Login() {
  const navigate = useNavigate()
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [username, setUsername] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  function isUsernameTaken(err: unknown) {
    const message = err instanceof Error ? err.message.toLowerCase() : ''
    return (
      message.includes('duplicate key') ||
      message.includes('profiles_username_key') ||
      (message.includes('username') && message.includes('unique'))
    )
  }

  async function handleSubmit() {
    setError(null)
    setInfo(null)

    if (mode === 'signup' && !username.trim()) {
      setError('Vui lòng nhập tên người dùng')
      return
    }

    setLoading(true)
    try {
      if (mode === 'signup') {
        // Check username availability first, before creating the auth user.
        const { data: existing } = await supabase
          .from('profiles')
          .select('id')
          .eq('username', username.trim())
          .maybeSingle()

        if (existing) {
          setError('Tên người dùng đã tồn tại')
          setLoading(false)
          return
        }

        const { data, error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { username: username.trim() } },
        })
        if (signUpError) throw signUpError

        // The `profiles` row is created automatically by a database
        // trigger (see supabase/schema.sql: on_auth_user_created), reading
        // `username` from the auth metadata above. This works even when
        // "Confirm email" is on and signUp() returns no active session,
        // which a client-side insert here could not do (RLS would reject
        // an unauthenticated insert).

        // If Supabase's "Confirm email" setting is enabled (the default),
        // signUp does NOT return an active session — the user must confirm
        // their email before they can sign in.
        if (!data.session) {
          setInfo('Đăng ký thành công! Vui lòng kiểm tra email để xác nhận tài khoản trước khi đăng nhập.')
          setMode('login')
          setPassword('')
          setLoading(false)
          return
        }

        navigate('/')
      } else {
        const { error: signInError } = await supabase.auth.signInWithPassword({ email, password })
        if (signInError) throw signInError
        navigate('/')
      }
    } catch (e) {
      if (isUsernameTaken(e)) {
        setError('Tên người dùng đã tồn tại')
      } else {
        setError(e instanceof Error ? e.message : 'Đã có lỗi xảy ra')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <PhoneShell>
      <div className="flex-1 flex flex-col justify-center px-6">
        <h1 className="font-display text-3xl font-bold mb-1">
          {mode === 'login' ? 'Chào mừng trở lại' : 'Tạo tài khoản'}
        </h1>
        <p className="text-sm text-[var(--text-dim)] mb-8">
          Tham gia các phòng chat theo chủ đề, kết nối cộng đồng của bạn.
        </p>

        <div className="space-y-3">
          {mode === 'signup' && (
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Tên người dùng"
              className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-xl px-4 py-3 text-sm outline-none focus-ring"
            />
          )}
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            type="email"
            className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-xl px-4 py-3 text-sm outline-none focus-ring"
          />
          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Mật khẩu"
            type="password"
            className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-xl px-4 py-3 text-sm outline-none focus-ring"
          />
        </div>

        {error && <p className="text-xs text-red-400 mt-3">{error}</p>}
        {info && <p className="text-xs text-emerald-400 mt-3">{info}</p>}

        <button
          onClick={handleSubmit}
          disabled={loading}
          className="w-full gradient-nova text-black font-bold rounded-full py-3.5 mt-6 focus-ring disabled:opacity-50"
        >
          {loading ? 'Đang xử lý...' : mode === 'login' ? 'Đăng nhập' : 'Đăng ký'}
        </button>

        <button
          onClick={() => {
            setMode(mode === 'login' ? 'signup' : 'login')
            setError(null)
            setInfo(null)
          }}
          className="text-sm text-[var(--text-dim)] mt-4 focus-ring rounded"
        >
          {mode === 'login' ? 'Chưa có tài khoản? Đăng ký' : 'Đã có tài khoản? Đăng nhập'}
        </button>
      </div>
    </PhoneShell>
  )
}
