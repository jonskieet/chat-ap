import type { ReactNode } from 'react'

export default function PhoneShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen w-full bg-black flex items-center justify-center py-6">
      <div className="relative w-full max-w-[420px] h-[860px] bg-[var(--bg)] rounded-[2.5rem] overflow-hidden shadow-2xl border border-[var(--border)] flex flex-col">
        {children}
      </div>
    </div>
  )
}
