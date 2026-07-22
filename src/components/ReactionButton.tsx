import { useRef, useState } from 'react'
import type { ReactionEmotion } from '../types'

const EMOTIONS: { key: ReactionEmotion; emoji: string; label: string }[] = [
  { key: 'love', emoji: '❤️', label: 'Yêu thích' },
  { key: 'fire', emoji: '🔥', label: 'Cực đỉnh' },
  { key: 'haha', emoji: '😂', label: 'Buồn cười' },
  { key: 'wow', emoji: '😮', label: 'Bất ngờ' },
  { key: 'sad', emoji: '😢', label: 'Buồn' },
]

const EMOJI_BY_KEY: Record<ReactionEmotion, string> = {
  love: '❤️',
  fire: '🔥',
  haha: '😂',
  wow: '😮',
  sad: '😢',
}

export default function ReactionButton({
  myReaction,
  count,
  onReact,
}: {
  myReaction: ReactionEmotion | null
  count: number
  onReact: (emotion: ReactionEmotion | null) => void
}) {
  const [pickerOpen, setPickerOpen] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  function startPress() {
    timerRef.current = setTimeout(() => setPickerOpen(true), 350)
  }

  function endPress() {
    if (timerRef.current) clearTimeout(timerRef.current)
    if (!pickerOpen) {
      // quick tap: toggle default love reaction
      onReact(myReaction ? null : 'love')
    }
  }

  function choose(emotion: ReactionEmotion) {
    onReact(myReaction === emotion ? null : emotion)
    setPickerOpen(false)
  }

  return (
    <div className="relative flex flex-col items-center gap-1">
      {pickerOpen && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setPickerOpen(false)} />
          <div className="absolute bottom-full mb-2 z-20 flex gap-1 bg-[var(--surface)] border border-[var(--border)] rounded-full px-2 py-1.5 shadow-xl">
            {EMOTIONS.map((e) => (
              <button
                key={e.key}
                onClick={() => choose(e.key)}
                aria-label={e.label}
                className="text-xl w-9 h-9 flex items-center justify-center rounded-full hover:bg-[var(--surface-2)] hover:scale-125 transition-transform focus-ring"
              >
                {e.emoji}
              </button>
            ))}
          </div>
        </>
      )}
      <button
        onMouseDown={startPress}
        onMouseUp={endPress}
        onMouseLeave={() => timerRef.current && clearTimeout(timerRef.current)}
        onTouchStart={startPress}
        onTouchEnd={endPress}
        aria-label="Thả cảm xúc"
        className={`w-11 h-11 rounded-full flex items-center justify-center text-lg backdrop-blur focus-ring transition ${
          myReaction ? 'bg-white text-black' : 'bg-black/30 text-white'
        }`}
      >
        {myReaction ? EMOJI_BY_KEY[myReaction] : '🤍'}
      </button>
      <span className="text-xs text-white/90 font-medium drop-shadow">{count}</span>
    </div>
  )
}
