import { useRef, useState, type CSSProperties } from 'react'
import type { PostMedia } from '../types'

interface MediaCarouselProps {
  media: PostMedia[]
  postId: string
  onTap: () => void
  mediaRef?: (el: HTMLElement | null) => void
}

export default function MediaCarousel({ media, postId, onTap, mediaRef }: MediaCarouselProps) {
  const [active, setActive] = useState(0)
  const scrollerRef = useRef<HTMLDivElement>(null)
  const startXRef = useRef<number | null>(null)

  function handleScroll() {
    const el = scrollerRef.current
    if (!el) return
    const index = Math.round(el.scrollLeft / el.clientWidth)
    if (index !== active) setActive(index)
  }

  if (media.length <= 1) {
    const m = media[0]
    return (
      <div className="absolute inset-0 cursor-pointer overflow-hidden" onClick={onTap}>
        {m?.media_type === 'video' ? (
          <video
            ref={mediaRef as never}
            src={m.media_url}
            className="parallax-media absolute inset-0 w-full h-full object-cover"
            style={{ viewTransitionName: `post-media-${postId}` } as CSSProperties}
            autoPlay
            loop
            muted
            playsInline
          />
        ) : m ? (
          <img
            ref={mediaRef as never}
            src={m.media_url}
            className="parallax-media absolute inset-0 w-full h-full object-cover"
            style={{ viewTransitionName: `post-media-${postId}` } as CSSProperties}
          />
        ) : (
          <div
            ref={mediaRef as never}
            className="parallax-media absolute inset-0 gradient-flame opacity-70"
            style={{ viewTransitionName: `post-media-${postId}` } as CSSProperties}
          />
        )}
      </div>
    )
  }

  return (
    <div className="absolute inset-0 overflow-hidden">
      <div
        ref={scrollerRef}
        onScroll={handleScroll}
        onPointerDown={(e) => (startXRef.current = e.clientX)}
        onPointerUp={(e) => {
          // Chỉ coi là "tap" (mở story-viewer/comment) nếu không kéo, tránh xung đột với vuốt carousel
          if (startXRef.current !== null && Math.abs(e.clientX - startXRef.current) < 6) onTap()
          startXRef.current = null
        }}
        className="absolute inset-0 flex overflow-x-auto snap-x snap-mandatory no-scrollbar cursor-pointer"
      >
        {media.map((m) => (
          <div key={m.id} className="relative w-full h-full shrink-0 snap-center">
            {m.media_type === 'video' ? (
              <video src={m.media_url} className="absolute inset-0 w-full h-full object-cover" autoPlay loop muted playsInline />
            ) : (
              <img src={m.media_url} className="absolute inset-0 w-full h-full object-cover" />
            )}
          </div>
        ))}
      </div>

      <div className="absolute top-3 right-3 text-[11px] font-semibold bg-black/45 text-white rounded-full px-2 py-0.5 pointer-events-none">
        {active + 1}/{media.length}
      </div>
      <div className="absolute bottom-3 inset-x-0 flex items-center justify-center gap-1.5 pointer-events-none">
        {media.map((m, i) => (
          <span key={m.id} className={`h-1.5 rounded-full transition-all ${i === active ? 'w-4 bg-white' : 'w-1.5 bg-white/40'}`} />
        ))}
      </div>
    </div>
  )
}
