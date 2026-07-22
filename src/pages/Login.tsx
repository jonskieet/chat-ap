import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import PhoneShell from '../components/PhoneShell'
import { supabase } from '../lib/supabaseClient'

type Mode = 'login' | 'signup' | 'verify'

// The Supabase Auth server can legitimately take a while to answer a
// signUp() call (it waits for the email to be dispatched). If it takes
// too long we want a clear, actionable Vietnamese error instead of the
// raw "Failed to fetch" / 504 the browser throws.
const REQUEST_TIMEOUT_MS = 15000

function withTimeout<T>(promise: PromiseLike<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('TIMEOUT')), ms)
    Promise.resolve(promise).then(
      (v) => {
        clearTimeout(timer)
        resolve(v)
      },
      (e) => {
        clearTimeout(timer)
        reject(e)
      }
    )
  })
}

function EyeIcon({ off }: { off: boolean }) {
  return off ? (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 3l18 18" />
      <path d="M10.6 5.1A10.9 10.9 0 0 1 12 5c6 0 9.5 5.5 9.9 6.4a1 1 0 0 1 0 .8 15 15 0 0 1-2.9 3.6M6.6 6.6C3.9 8.3 2.3 10.8 2.1 11.6a1 1 0 0 0 0 .8C2.5 13.3 6 18.8 12 18.8c1.2 0 2.3-.2 3.3-.6" />
      <path d="M9.9 10a3 3 0 0 0 4.2 4.2" />
    </svg>
  ) : (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2.1 12.4C2.5 13.3 6 18.8 12 18.8s9.5-5.5 9.9-6.4a1 1 0 0 0 0-.8C21.5 10.7 18 5.2 12 5.2S2.5 10.7 2.1 11.6a1 1 0 0 0 0 .8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  )
}

function Field({
  label,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-[var(--text-dim)] mb-1.5 ml-1">{label}</span>
      <input
        {...props}
        className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-xl px-4 py-3 text-sm text-[var(--text)] placeholder:text-[var(--text-dim)]/60 outline-none focus-ring transition-colors focus:border-[var(--accent-nova-2)]"
      />
    </label>
  )
}

export default function Login() {
  const navigate = useNavigate()
  const [mode, setMode] = useState<Mode>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [username, setUsername] = useState('')
  const [otp, setOtp] = useState('')
  const [showPassword, setShowPassword] = useState(false)
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

  function friendlyError(e: unknown) {
    const msg = e instanceof Error ? e.message : ''
    if (msg === 'TIMEOUT') {
      return 'Máy chủ phản hồi quá lâu (có thể do cấu hình gửi email/SMTP hoặc dự án Supabase đang "ngủ"). Vui lòng thử lại sau vài giây.'
    }
    if (msg.toLowerCase().includes('fetch') || msg.toLowerCase().includes('network')) {
      return 'Không kết nối được tới máy chủ. Kiểm tra mạng hoặc thử lại sau.'
    }
    return msg || 'Đã có lỗi xảy ra'
  }

  async function handleSignup() {
    if (!username.trim()) {
      setError('Vui lòng nhập tên người dùng')
      return
    }
    if (!email.trim() || !password) {
      setError('Vui lòng nhập đầy đủ email và mật khẩu')
      return
    }
    if (password.length < 6) {
      setError('Mật khẩu cần tối thiểu 6 ký tự')
      return
    }

    setLoading(true)
    try {
      const { data: existing } = await withTimeout(
        supabase.from('profiles').select('id').eq('username', username.trim()).maybeSingle(),
        REQUEST_TIMEOUT_MS
      )

      if (existing) {
        setError('Tên người dùng đã tồn tại')
        setLoading(false)
        return
      }

      const { data, error: signUpError } = await withTimeout(
        supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { data: { username: username.trim() } },
        }),
        REQUEST_TIMEOUT_MS
      )
      if (signUpError) throw signUpError

      if (!data.session) {
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
        setError(friendlyError(e))
      }
    } finally {
      setLoading(false)
    }
  }

  async function handleLogin() {
    if (!email.trim() || !password) {
      setError('Vui lòng nhập đầy đủ email và mật khẩu')
      return
    }
    setLoading(true)
    try {
      const { error: signInError } = await withTimeout(
        supabase.auth.signInWithPassword({ email: email.trim(), password }),
        REQUEST_TIMEOUT_MS
      )
      if (signInError) throw signInError
      navigate('/')
    } catch (e) {
      setError(friendlyError(e))
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
      const { error: verifyError } = await withTimeout(
        supabase.auth.verifyOtp({ email: email.trim(), token: otp.trim(), type: 'signup' }),
        REQUEST_TIMEOUT_MS
      )
      if (verifyError) throw verifyError
      navigate('/')
    } catch (e) {
      setError(friendlyError(e) || 'Mã xác nhận không đúng hoặc đã hết hạn')
    } finally {
      setLoading(false)
    }
  }

  async function handleResend() {
    setLoading(true)
    setError(null)
    setInfo(null)
    try {
      const { error: resendError } = await withTimeout(
        supabase.auth.resend({ type: 'signup', email: email.trim() }),
        REQUEST_TIMEOUT_MS
      )
      if (resendError) throw resendError
      setInfo('Đã gửi lại mã xác nhận, vui lòng kiểm tra email.')
    } catch (e) {
      setError(friendlyError(e) || 'Không gửi lại được, vui lòng thử lại sau ít phút')
    } finally {
      setLoading(false)
    }
  }

  function handleSubmit(e?: React.FormEvent) {
    e?.preventDefault()
    setError(null)
    setInfo(null)
    if (mode === 'signup') return handleSignup()
    if (mode === 'verify') return handleVerify()
    return handleLogin()
  }

  return (
    <PhoneShell>
      <form onSubmit={handleSubmit} className="flex-1 flex flex-col justify-center px-7 py-10 overflow-y-auto">
        <div className="flex flex-col items-center mb-8">
          <div className="w-14 h-14 rounded-2xl gradient-nova flex items-center justify-center shadow-lg shadow-black/40">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 5.5h16a1.5 1.5 0 0 1 1.5 1.5v9a1.5 1.5 0 0 1-1.5 1.5H9l-4.3 3.3a.6.6 0 0 1-1-.47V17.5h-.2A1.5 1.5 0 0 1 2 16V7a1.5 1.5 0 0 1 1.5-1.5Z" />
            </svg>
          </div>
          <p className="mt-3 text-sm font-bold tracking-wide text-[var(--text)]">KFLARE</p>
        </div>

        {mode !== 'login' && (
          <button
            type="button"
            onClick={() => {
              setMode(mode === 'verify' ? 'signup' : 'login')
              setError(null)
              setInfo(null)
            }}
            className="self-start mb-4 -ml-1 p-1.5 rounded-full text-[var(--text-dim)] hover:text-[var(--text)] hover:bg-[var(--surface)] transition-colors focus-ring"
            aria-label="Quay lại"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </button>
        )}

        <h1 className="font-display text-2xl font-bold mb-1.5 text-center">
          {mode === 'login' && 'Chào mừng trở lại'}
          {mode === 'signup' && 'Tạo tài khoản'}
          {mode === 'verify' && 'Nhập mã xác nhận'}
        </h1>
        <p className="text-sm text-[var(--text-dim)] mb-7 text-center leading-relaxed">
          {mode === 'login' && 'Đăng nhập để tiếp tục trò chuyện trong các phòng chat của bạn.'}
          {mode === 'signup' && 'Tham gia các phòng chat theo chủ đề, kết nối cộng đồng của bạn.'}
          {mode === 'verify' && (
            <>
              Chúng tôi đã gửi mã gồm 6 chữ số tới{' '}
              <span className="text-[var(--text)] font-medium">{email}</span>. Nhập mã để hoàn tất đăng ký.
            </>
          )}
        </p>

        {mode === 'verify' ? (
          <input
            value={otp}
            onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder="000000"
            inputMode="numeric"
            autoFocus
            maxLength={6}
            className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-xl px-4 py-3.5 text-center text-3xl font-semibold tracking-[0.5em] text-[var(--text)] outline-none focus-ring focus:border-[var(--accent-nova-2)] transition-colors"
          />
        ) : (
          <div className="space-y-3.5">
            {mode === 'signup' && (
              <Field
                label="Tên người dùng"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="vd: huitkai"
                autoComplete="username"
              />
            )}
            <Field
              label="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="ban@vidu.com"
              type="email"
              autoComplete="email"
            />
            <label className="block">
              <span className="block text-xs font-medium text-[var(--text-dim)] mb-1.5 ml-1">Mật khẩu</span>
              <div className="relative">
                <input
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                  className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-xl px-4 py-3 pr-11 text-sm text-[var(--text)] placeholder:text-[var(--text-dim)]/60 outline-none focus-ring transition-colors focus:border-[var(--accent-nova-2)]"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((s) => !s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-dim)] hover:text-[var(--text)] transition-colors"
                  aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                  tabIndex={-1}
                >
                  <EyeIcon off={showPassword} />
                </button>
              </div>
            </label>

            {mode === 'login' && (
              <div className="flex justify-end -mt-1">
                <button type="button" className="text-xs text-[var(--text-dim)] hover:text-[var(--text)] transition-colors focus-ring rounded">
                  Quên mật khẩu?
                </button>
              </div>
            )}
          </div>
        )}

        {error && (
          <p className="text-xs text-red-400 mt-4 bg-red-400/10 border border-red-400/20 rounded-lg px-3 py-2 leading-relaxed">
            {error}
          </p>
        )}
        {info && (
          <p className="text-xs text-emerald-400 mt-4 bg-emerald-400/10 border border-emerald-400/20 rounded-lg px-3 py-2 leading-relaxed">
            {info}
          </p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full gradient-nova text-black font-bold rounded-full py-3.5 mt-6 focus-ring disabled:opacity-50 transition-transform active:scale-[0.98] flex items-center justify-center gap-2"
        >
          {loading && (
            <svg className="animate-spin" width="16" height="16" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="9" stroke="black" strokeOpacity="0.25" strokeWidth="3" />
              <path d="M21 12a9 9 0 0 0-9-9" stroke="black" strokeWidth="3" strokeLinecap="round" />
            </svg>
          )}
          {loading ? 'Đang xử lý...' : mode === 'login' ? 'Đăng nhập' : mode === 'signup' ? 'Đăng ký' : 'Xác nhận'}
        </button>

        {mode === 'verify' ? (
          <button
            type="button"
            onClick={handleResend}
            disabled={loading}
            className="text-sm text-[var(--text-dim)] hover:text-[var(--text)] mt-5 mx-auto focus-ring rounded disabled:opacity-50 transition-colors"
          >
            Chưa nhận được mã? <span className="text-[var(--accent-nova-2)] font-medium">Gửi lại</span>
          </button>
        ) : (
          <button
            type="button"
            onClick={() => {
              setMode(mode === 'login' ? 'signup' : 'login')
              setError(null)
              setInfo(null)
            }}
            className="text-sm text-[var(--text-dim)] hover:text-[var(--text)] mt-5 mx-auto focus-ring rounded transition-colors"
          >
            {mode === 'login' ? (
              <>Chưa có tài khoản? <span className="text-[var(--accent-nova-2)] font-medium">Đăng ký</span></>
            ) : (
              <>Đã có tài khoản? <span className="text-[var(--accent-nova-2)] font-medium">Đăng nhập</span></>
            )}
          </button>
        )}
      </form>
    </PhoneShell>
  )
}
