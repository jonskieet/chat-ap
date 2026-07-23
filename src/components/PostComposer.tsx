import { useMemo, useRef, useState } from 'react'
import { Film, GripVertical, ImagePlus, Trash2, X } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { startPostUpload } from '../lib/uploadManager'

const MAX_FILES = 10
const MAX_IMAGE_MB = 15
const MAX_VIDEO_MB = 100

interface PickedFile {
  id: string
  file: File
  url: string
  kind: 'image' | 'video'
}

export default function PostComposer({ onClose }: { onClose: () => void }) {
  const { user, profile: me } = useAuth()
  const { showToast } = useToast()
  const [caption, setCaption] = useState('')
  const [items, setItems] = useState<PickedFile[]>([])
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const hasVideo = useMemo(() => items.some((i) => i.kind === 'video'), [items])
  const canSubmit = (caption.trim().length > 0 || items.length > 0) && !!user

  function addFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return
    const incoming = Array.from(fileList)
    const next: PickedFile[] = []

    for (const file of incoming) {
      if (items.length + next.length >= MAX_FILES) {
        showToast(`Tối đa ${MAX_FILES} ảnh/video mỗi bài viết`, 'error')
        break
      }
      const isVideo = file.type.startsWith('video/')
      const isImage = file.type.startsWith('image/')
      if (!isVideo && !isImage) continue
      const sizeMb = file.size / (1024 * 1024)
      if (isVideo && sizeMb > MAX_VIDEO_MB) {
        showToast(`Video "${file.name}" vượt quá ${MAX_VIDEO_MB}MB`, 'error')
        continue
      }
      if (isImage && sizeMb > MAX_IMAGE_MB) {
        showToast(`Ảnh "${file.name}" vượt quá ${MAX_IMAGE_MB}MB`, 'error')
        continue
      }
      // Chỉ cho phép 1 video mỗi bài (giống Instagram/FB khi trộn ảnh+video trong 1 post)
      if (isVideo && (hasVideo || next.some((n) => n.kind === 'video'))) {
        showToast('Mỗi bài viết chỉ được đăng 1 video', 'error')
        continue
      }
      next.push({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        file,
        url: URL.createObjectURL(file),
        kind: isVideo ? 'video' : 'image',
      })
    }

    setItems((prev) => [...prev, ...next])
  }

  function removeItem(id: string) {
    setItems((prev) => prev.filter((i) => i.id !== id))
  }

  function handleDrop(targetIndex: number) {
    if (dragIndex === null || dragIndex === targetIndex) return
    setItems((prev) => {
      const next = [...prev]
      const [moved] = next.splice(dragIndex, 1)
      next.splice(targetIndex, 0, moved)
      return next
    })
    setDragIndex(null)
  }

  function submit() {
    if (!user || !canSubmit) return
    // Đăng ở nền: đóng composer NGAY, tiến trình sẽ hiện qua UploadProgressStack
    // (giống Facebook) thay vì bắt người dùng ngồi chờ ở màn hình này.
    startPostUpload({
      authorId: user.id,
      caption,
      files: items.map((i) => i.file),
    })
    showToast('Đang đăng bài viết của bạn...', 'info')
    onClose()
  }

  return (
    <div className="absolute inset-0 z-30 bg-[var(--bg)] flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-[calc(env(safe-area-inset-top,0px)+14px)] pb-3 border-b border-[var(--border)] shrink-0">
        <button onClick={onClose} aria-label="Đóng" className="w-9 h-9 rounded-full flex items-center justify-center focus-ring hover:bg-[var(--surface)]">
          <X size={19} />
        </button>
        <h2 className="font-display font-bold text-base">Bài viết mới</h2>
        <button
          onClick={submit}
          disabled={!canSubmit}
          className="gradient-nova text-black font-bold text-sm rounded-full px-4 py-2 focus-ring disabled:opacity-35 disabled:pointer-events-none"
        >
          Đăng
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Author row */}
        <div className="flex items-center gap-2.5 px-4 pt-4">
          <div className="w-10 h-10 rounded-full bg-[var(--surface-2)] border border-[var(--border)] overflow-hidden flex items-center justify-center text-sm font-semibold shrink-0">
            {me?.avatar_url ? <img src={me.avatar_url} className="w-full h-full object-cover" /> : me?.username?.slice(0, 1).toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold truncate">{me?.display_name || me?.username || 'Bạn'}</p>
            <span className="inline-flex items-center text-[11px] text-[var(--text-dim)] bg-[var(--surface)] border border-[var(--border)] rounded-full px-2 py-0.5 mt-0.5">
              Công khai
            </span>
          </div>
        </div>

        {/* Caption */}
        <textarea
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          placeholder="Bạn đang nghĩ gì?"
          rows={items.length > 0 ? 2 : 5}
          autoFocus
          maxLength={2200}
          className="w-full bg-transparent px-4 py-3 text-[15px] outline-none resize-none placeholder:text-[var(--text-dim)]"
        />

        {/* Media grid */}
        {items.length > 0 && (
          <div className="px-4 pb-2">
            <div className="grid grid-cols-3 gap-2">
              {items.map((item, index) => (
                <div
                  key={item.id}
                  draggable
                  onDragStart={() => setDragIndex(index)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => handleDrop(index)}
                  className="relative aspect-square rounded-xl overflow-hidden bg-[var(--surface-2)] group"
                >
                  {item.kind === 'video' ? (
                    <video src={item.url} className="w-full h-full object-cover" muted playsInline />
                  ) : (
                    <img src={item.url} className="w-full h-full object-cover" />
                  )}
                  {item.kind === 'video' && (
                    <div className="absolute bottom-1 left-1 w-5 h-5 rounded-full bg-black/55 flex items-center justify-center">
                      <Film size={11} className="text-white" />
                    </div>
                  )}
                  {items.length > 1 && (
                    <div className="absolute top-1 left-1 w-5 h-5 rounded-full bg-black/45 flex items-center justify-center cursor-grab active:cursor-grabbing">
                      <GripVertical size={11} className="text-white" />
                    </div>
                  )}
                  <button
                    onClick={() => removeItem(item.id)}
                    aria-label="Xoá ảnh/video này"
                    className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/55 flex items-center justify-center focus-ring"
                  >
                    <Trash2 size={11} className="text-white" />
                  </button>
                  {index === 0 && items.length > 1 && (
                    <span className="absolute bottom-1 right-1 text-[9px] font-bold bg-black/55 text-white rounded-full px-1.5 py-0.5">
                      Bìa
                    </span>
                  )}
                </div>
              ))}
              {items.length < MAX_FILES && (
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="aspect-square rounded-xl border-2 border-dashed border-[var(--border)] flex flex-col items-center justify-center gap-1 text-[var(--text-dim)] focus-ring"
                >
                  <ImagePlus size={18} />
                  <span className="text-[10px] font-medium">Thêm</span>
                </button>
              )}
            </div>
            <p className="text-[11px] text-[var(--text-dim)] mt-2">
              {items.length}/{MAX_FILES} tệp{items.length > 1 ? ' · kéo để sắp xếp lại thứ tự' : ''}
            </p>
          </div>
        )}
      </div>

      {/* Bottom toolbar */}
      <div className="shrink-0 border-t border-[var(--border)] px-4 py-3 pb-[calc(env(safe-area-inset-bottom,0px)+12px)]">
        <button
          onClick={() => fileInputRef.current?.click()}
          className="w-full flex items-center justify-center gap-2 rounded-xl border border-[var(--border)] py-3 text-sm font-semibold focus-ring"
        >
          <ImagePlus size={18} className="text-emerald-400" />
          Ảnh/Video
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,video/*"
          multiple
          className="hidden"
          onChange={(e) => {
            addFiles(e.target.files)
            e.target.value = ''
          }}
        />
      </div>
    </div>
  )
}
