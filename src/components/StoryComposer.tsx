import { useRef, useState } from 'react'
import { ImagePlus, Type, X } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { startStoryUpload } from '../lib/uploadManager'

const MAX_IMAGE_MB = 15
const MAX_VIDEO_MB = 100

export default function StoryComposer({ onClose }: { onClose: () => void }) {
  const { user, profile: me } = useAuth()
  const { showToast } = useToast()
  const [file, setFile] = useState<File | null>(null)
  const [url, setUrl] = useState<string | null>(null)
  const [kind, setKind] = useState<'image' | 'video'>('image')
  const [caption, setCaption] = useState('')
  const [showCaptionInput, setShowCaptionInput] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  function pick(f: File | null) {
    if (!f) return
    const isVideo = f.type.startsWith('video/')
    const isImage = f.type.startsWith('image/')
    if (!isVideo && !isImage) return
    const sizeMb = f.size / (1024 * 1024)
    if (isVideo && sizeMb > MAX_VIDEO_MB) return showToast(`Video vượt quá ${MAX_VIDEO_MB}MB`, 'error')
    if (isImage && sizeMb > MAX_IMAGE_MB) return showToast(`Ảnh vượt quá ${MAX_IMAGE_MB}MB`, 'error')
    setFile(f)
    setUrl(URL.createObjectURL(f))
    setKind(isVideo ? 'video' : 'image')
  }

  function submit() {
    if (!user || !file) return
    startStoryUpload({ authorId: user.id, file, caption })
    showToast('Đang chia sẻ tin của bạn...', 'info')
    onClose()
  }

  return (
    <div className="absolute inset-0 z-30 bg-black flex flex-col">
      <input
        ref={inputRef}
        type="file"
        accept="image/*,video/*"
        className="hidden"
        onChange={(e) => {
          pick(e.target.files?.[0] ?? null)
          e.target.value = ''
        }}
      />

      {!url ? (
        // Bước chọn media: full-screen picker giống Instagram Add Story
        <div className="flex-1 flex flex-col items-center justify-center gap-5 px-8">
          <button onClick={onClose} aria-label="Đóng" className="absolute top-[calc(env(safe-area-inset-top,0px)+14px)] left-4 w-9 h-9 rounded-full bg-white/10 flex items-center justify-center focus-ring">
            <X size={18} className="text-white" />
          </button>
          <div className="w-16 h-16 rounded-full bg-white/10 flex items-center justify-center">
            <ImagePlus size={26} className="text-white" />
          </div>
          <p className="text-white/70 text-sm text-center">Chọn 1 ảnh hoặc video cho tin của bạn. Tin sẽ tự biến mất sau 24 giờ.</p>
          <button
            onClick={() => inputRef.current?.click()}
            className="gradient-nova text-black font-bold rounded-full px-6 py-3 focus-ring"
          >
            Chọn ảnh/video
          </button>
        </div>
      ) : (
        <>
          {/* Preview full-bleed */}
          <div className="relative flex-1 min-h-0">
            {kind === 'video' ? (
              <video src={url} className="absolute inset-0 w-full h-full object-cover" autoPlay loop muted playsInline />
            ) : (
              <img src={url} className="absolute inset-0 w-full h-full object-cover" />
            )}
            <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-transparent to-black/60" />

            <div className="absolute top-[calc(env(safe-area-inset-top,0px)+14px)] inset-x-4 flex items-center justify-between">
              <button onClick={onClose} aria-label="Đóng" className="w-9 h-9 rounded-full bg-black/40 backdrop-blur-md flex items-center justify-center focus-ring">
                <X size={18} className="text-white" />
              </button>
              <button
                onClick={() => setShowCaptionInput((v) => !v)}
                aria-label="Thêm chữ"
                className="w-9 h-9 rounded-full bg-black/40 backdrop-blur-md flex items-center justify-center focus-ring"
              >
                <Type size={17} className="text-white" />
              </button>
            </div>

            {(showCaptionInput || caption) && (
              <div className="absolute inset-x-6 top-1/2 -translate-y-1/2 text-center">
                <input
                  autoFocus={showCaptionInput}
                  value={caption}
                  onChange={(e) => setCaption(e.target.value)}
                  placeholder="Nhập chữ..."
                  maxLength={120}
                  className="w-full bg-transparent text-center text-white font-display font-bold text-2xl outline-none placeholder:text-white/50"
                />
              </div>
            )}

            <div className="absolute bottom-5 inset-x-4 flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full border border-white/30 overflow-hidden flex items-center justify-center text-xs font-semibold text-white shrink-0">
                {me?.avatar_url ? <img src={me.avatar_url} className="w-full h-full object-cover" /> : me?.username?.slice(0, 1).toUpperCase()}
              </div>
              <span className="text-xs font-semibold text-white flex-1 truncate">Tin của bạn</span>
              <button
                onClick={submit}
                className="gradient-nova text-black font-bold text-sm rounded-full px-5 py-2.5 focus-ring shrink-0"
              >
                Chia sẻ tin
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
