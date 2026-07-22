import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import PhoneShell from '../components/PhoneShell'
import { supabase } from '../lib/supabaseClient'

type Mode = 'login' | 'signup' | 'verify'

export default function Login() {
  const navigate = useNavigate()
  const [mode, setMode] = useState<Mode>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [username, setUsername] = useState('')
  const [otp, setOtp] = useState('')
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

  async function handleSignup() {
    if (!username.trim()) {
      setError('Vui lòng nhập tên người dùng')
      return
    }

    setLoading(true)
    try {
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

      // The `profiles` row is created automatically by a database trigger
      // (see supabase/schema.sql: on_auth_user_created), reading `username`
      // from the auth metadata above.

      if (!data.session) {
        // "Confirm email" is on, and the email template now sends a
        // 6-digit code ({{ .Token }}) instead of a link — switch to the
        // OTP-entry screen.
        setInfo(null)
        setMode('verify')
        setLoading(false)
        return
      }

      navigate('/')
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

  async function handleLogin() {
    setLoading(true)
    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password })
      if (signInError) throw signInError
      navigate('/')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Đã có lỗi xảy ra')
    } finally {
      setLoading(false)
    }
  }

  async function handleVerify() {
    if (otp.trim().length !== 6) {
      setError('Vui lòng nhập đủ 6 chữ số')
      return
    }

    setLoading(true)
    setError(null)
    try {
      const { error: verifyError } = await supabase.auth.verifyOtp({
        email,
        token: otp.trim(),
        type: 'signup',
      })
      if (verifyError) throw verifyError
      navigate('/')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Mã xác nhận không đúng hoặc đã hết hạn')
    } finally {
      setLoading(false)
    }
  }

  async function handleResend() {
    setLoading(true)
    setError(null)
    setInfo(null)
    try {
      const { error: resendError } = await supabase.auth.resend({ type: 'signup', email })
      if (resendError) throw resendError
      setInfo('Đã gửi lại mã xác nhận, vui lòng kiểm tra email.')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không gửi lại được, vui lòng thử lại sau ít phút')
    } finally {
      setLoading(false)
    }
  }

  function handleSubmit() {
    setError(null)
    setInfo(null)
    if (mode === 'signup') return handleSignup()
    if (mode === 'verify') return handleVerify()
    return handleLogin()
  }

  return (
    <PhoneShell>
      <div className="flex-1 flex flex-col justify-center px-6">
        <h1 className="font-display text-3xl font-bold mb-1">
          {mode === 'login' && 'Chào mừng trở lại'}
          {mode === 'signup' && 'Tạo tài khoản'}
          {mode === 'verify' && 'Nhập mã xác nhận'}
        </h1>
        <p className="text-sm text-[var(--text-dim)] mb-8">
          {mode === 'verify'
            ? `Chúng tôi đã gửi mã gồm 6 chữ số tới ${email}. Nhập mã để hoàn tất đăng ký.`
            : 'Tham gia các phòng chat theo chủ đề, kết nối cộng đồng của bạn.'}
        </p>

        {mode === 'verify' ? (
          <input
            value={otp}
            onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder="123456"
            inputMode="numeric"
            maxLength={6}
            className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-xl px-4 py-3 text-center text-2xl tracking-[0.5em] outline-none focus-ring"
          />
        ) : (
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
        )}

        {error && <p className="text-xs text-red-400 mt-3">{error}</p>}
        {info && <p className="text-xs text-emerald-400 mt-3">{info}</p>}

        <button
          onClick={handleSubmit}
          disabled={loading}
          className="w-full gradient-nova text-black font-bold rounded-full py-3.5 mt-6 focus-ring disabled:opacity-50"
        >
          {loading
            ? 'Đang xử lý...'
            : mode === 'login'
              ? 'Đăng nhập'
              : mode === 'signup'
                ? 'Đăng ký'
                : 'Xác nhận'}
        </button>

        {mode === 'verify' ? (
          <button
            onClick={handleResend}
            disabled={loading}
            className="text-sm text-[var(--text-dim)] mt-4 focus-ring rounded disabled:opacity-50"
          >
            Chưa nhận được mã? Gửi lại
          </button>
        ) : (
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
        )}
      </div>
    </PhoneShell>
  )
}
