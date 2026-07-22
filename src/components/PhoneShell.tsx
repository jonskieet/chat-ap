import type { ReactNode } from 'react'

export default function PhoneShell({ children }: { children: ReactNode }) {
  return (
    <div className="h-dvh w-full bg-black flex items-center justify-center sm:py-6">
      <div
        className="relative w-full h-dvh sm:h-[860px] sm:max-w-[420px] bg-[var(--bg)]
          overflow-hidden flex flex-col
          rounded-none sm:rounded-[2.5rem]
          border-0 sm:border sm:border-[var(--border)]
          shadow-none sm:shadow-2xl"
      >
        {children}
      </div>
    </div>
  )
}
