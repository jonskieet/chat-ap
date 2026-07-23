import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react'
import { CheckCircle2, Info, X, XCircle } from 'lucide-react'

export type ToastType = 'success' | 'error' | 'info'

interface ToastItem {
  id: number
  message: string
  type: ToastType
}

interface ToastContextValue {
  showToast: (message: string, type?: ToastType) => void
}

const ToastContext = createContext<ToastContextValue | undefined>(undefined)

const ICONS: Record<ToastType, typeof CheckCircle2> = {
  success: CheckCircle2,
  error: XCircle,
  info: Info,
}

const ACCENTS: Record<ToastType, string> = {
  success: 'border-emerald-400/30 text-emerald-300',
  error: 'border-rose-400/30 text-rose-300',
  info: 'border-white/15 text-white',
}

const DURATION_MS = 3200

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const idRef = useRef(0)

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const showToast = useCallback(
    (message: string, type: ToastType = 'info') => {
      const id = ++idRef.current
      setToasts((prev) => [...prev, { id, message, type }])
      setTimeout(() => dismiss(id), DURATION_MS)
    },
    [dismiss]
  )

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}

      {/* Toast stack — căn giữa theo đúng khung phone-shell (sm:max-w-420px) để không bị lệch trên desktop */}
      <div className="fixed inset-0 z-[200] pointer-events-none flex justify-center sm:py-6" aria-live="polite">
        <div className="w-full sm:max-w-[420px] flex flex-col items-center gap-2 px-4 pt-[calc(env(safe-area-inset-top,0px)+14px)]">
          {toasts.map((t) => {
            const Icon = ICONS[t.type]
            return (
              <div
                key={t.id}
                role="status"
                className={`pointer-events-auto w-full flex items-center gap-2.5 rounded-2xl border bg-[var(--surface)]/95 backdrop-blur-md px-4 py-3 shadow-xl toast-enter ${ACCENTS[t.type]}`}
              >
                <Icon size={17} className="shrink-0" />
                <p className="flex-1 text-sm font-medium text-[var(--text)]">{t.message}</p>
                <button
                  onClick={() => dismiss(t.id)}
                  aria-label="Đóng thông báo"
                  className="shrink-0 p-1 rounded-full focus-ring text-[var(--text-dim)]"
                >
                  <X size={14} />
                </button>
              </div>
            )
          })}
        </div>
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast phải được dùng bên trong ToastProvider')
  return ctx
}
