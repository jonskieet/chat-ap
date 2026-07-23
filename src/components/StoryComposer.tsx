import { useRef, useState } from 'react'
import {
  ImagePlus,
  Type,
  X,
  Smile,
  Pencil,
  SlidersHorizontal,
  Palette,
  Undo2,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Check,
  ChevronLeft,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { startStoryUpload } from '../lib/uploadManager'

const MAX_IMAGE_MB = 15
const MAX_VIDEO_MB = 100
const CANVAS_W = 1080
const CANVAS_H = 1920
const PREVIEW_TEXT_BASE = 26 // px, at scale = 1, in the preview DOM
const PREVIEW_EMOJI_BASE = 60 // px, at scale = 1, in the preview DOM

type FontKey = 'sans' | 'display' | 'serif'
const FONT_CSS: Record<FontKey, string> = {
  sans: 'Inter, sans-serif',
  display: '"Space Grotesk", sans-serif',
  serif: 'Georgia, "Times New Roman", serif',
}
const FONT_ORDER: FontKey[] = ['sans', 'display', 'serif']

const TEXT_COLORS = ['#ffffff', '#0a0a0c', '#ff4f9a', '#7c3aed', '#f97316', '#34d399', '#38bdf8', '#facc15']
const DRAW_COLORS = ['#ffffff', '#0a0a0c', '#ff4f9a', '#f97316', '#facc15', '#34d399', '#38bdf8', '#7c3aed']
const DRAW_SIZES = [4, 9, 16]

type Background = { kind: 'solid'; color: string } | { kind: 'gradient'; from: string; to: string }
const BACKGROUNDS: Background[] = [
  { kind: 'gradient', from: '#7c3aed', to: '#f97316' },
  { kind: 'gradient', from: '#ff5a36', to: '#c81e3a' },
  { kind: 'gradient', from: '#0ea5e9', to: '#34d399' },
  { kind: 'gradient', from: '#ff4f9a', to: '#7c3aed' },
  { kind: 'solid', color: '#0a0a0c' },
  { kind: 'solid', color: '#16161a' },
  { kind: 'solid', color: '#ff4f9a' },
  { kind: 'solid', color: '#0ea5e9' },
]

const FILTERS: { key: string; label: string; css: string }[] = [
  { key: 'normal', label: 'Gốc', css: 'none' },
  { key: 'vivid', label: 'Rực rỡ', css: 'saturate(1.5) contrast(1.08)' },
  { key: 'mono', label: 'Đen trắng', css: 'grayscale(1) contrast(1.05)' },
  { key: 'warm', label: 'Ấm', css: 'sepia(0.35) saturate(1.2) brightness(1.03)' },
  { key: 'cool', label: 'Lạnh', css: 'hue-rotate(-12deg) saturate(1.15) brightness(1.02)' },
  { key: 'fade', label: 'Phai', css: 'contrast(0.9) brightness(1.08) saturate(0.85)' },
]

const EMOJIS = [
  '😂', '❤️', '🔥', '😍', '🥳', '😎', '👏', '🙌', '😢', '😮', '💯', '✨',
  '🎉', '😅', '🤔', '😴', '🥰', '😇', '🤩', '😜', '👍', '🙏', '💖', '⭐',
]

interface TextLayer {
  id: string
  kind: 'text'
  text: string
  x: number
  y: number
  scale: number
  color: string
  font: FontKey
  align: 'left' | 'center' | 'right'
  bg: boolean
}
interface StickerLayer {
  id: string
  kind: 'sticker'
  emoji: string
  x: number
  y: number
  scale: number
}
type Layer = TextLayer | StickerLayer

interface Stroke {
  id: string
  color: string
  size: number
  points: { x: number; y: number }[]
}

let uidCounter = 0
function uid() {
  uidCounter += 1
  return `l${Date.now().toString(36)}${uidCounter}`
}

type Panel = 'none' | 'text-edit' | 'stickers' | 'draw' | 'filters' | 'backgrounds'

export default function StoryComposer({ onClose }: { onClose: () => void }) {
  const { user, profile: me } = useAuth()
  const { showToast } = useToast()

  const [entry, setEntry] = useState<'choose' | 'edit'>('choose')
  const [storyKind, setStoryKind] = useState<'media' | 'text'>('media')

  const [file, setFile] = useState<File | null>(null)
  const [url, setUrl] = useState<string | null>(null)
  const [mediaType, setMediaType] = useState<'image' | 'video'>('image')
  const [filterKey, setFilterKey] = useState('normal')
  const [bgIndex, setBgIndex] = useState(0)

  const [layers, setLayers] = useState<Layer[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [strokes, setStrokes] = useState<Stroke[]>([])
  const [history, setHistory] = useState<{ kind: 'layer' | 'stroke'; id: string }[]>([])

  const [panel, setPanel] = useState<Panel>('none')
  const [drawColor, setDrawColor] = useState(DRAW_COLORS[0])
  const [drawSize, setDrawSize] = useState(DRAW_SIZES[1])
  const drawingRef = useRef<Stroke | null>(null)

  const [textDraft, setTextDraft] = useState('')
  const [textColor, setTextColor] = useState(TEXT_COLORS[0])
  const [textFont, setTextFont] = useState<FontKey>('sans')
  const [textAlign, setTextAlign] = useState<'left' | 'center' | 'right'>('center')
  const [textBg, setTextBg] = useState(false)

  const [submitting, setSubmitting] = useState(false)

  const inputRef = useRef<HTMLInputElement>(null)
  const previewRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ id: string; startX: number; startY: number; layerX: number; layerY: number } | null>(null)
  const resizeRef = useRef<{ id: string; startY: number; startScale: number } | null>(null)

  const selectedLayer = layers.find((l) => l.id === selectedId) ?? null

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
    setMediaType(isVideo ? 'video' : 'image')
    setStoryKind('media')
    setEntry('edit')
  }

  function startTextOnly() {
    setStoryKind('text')
    setFile(null)
    setUrl(null)
    setBgIndex(Math.floor(Math.random() * BACKGROUNDS.length))
    setEntry('edit')
  }

  function reset() {
    setEntry('choose')
    setFile(null)
    setUrl(null)
    setLayers([])
    setStrokes([])
    setHistory([])
    setSelectedId(null)
    setPanel('none')
    setFilterKey('normal')
  }

  // ---------- layers ----------
  function addTextLayer() {
    if (!textDraft.trim()) {
      setPanel('none')
      return
    }
    const id = uid()
    const layer: TextLayer = {
      id,
      kind: 'text',
      text: textDraft.trim(),
      x: 50,
      y: 45,
      scale: 1,
      color: textColor,
      font: textFont,
      align: textAlign,
      bg: textBg,
    }
    setLayers((prev) => [...prev, layer])
    setHistory((prev) => [...prev, { kind: 'layer', id }])
    setTextDraft('')
    setPanel('none')
    setSelectedId(id)
  }

  function openEditFor(layer: TextLayer) {
    setTextDraft(layer.text)
    setTextColor(layer.color)
    setTextFont(layer.font)
    setTextAlign(layer.align)
    setTextBg(layer.bg)
    setPanel('text-edit')
  }

  function commitTextEdit() {
    if (!selectedLayer || selectedLayer.kind !== 'text') {
      addTextLayer()
      return
    }
    if (!textDraft.trim()) {
      deleteLayer(selectedLayer.id)
      setPanel('none')
      return
    }
    const id = selectedLayer.id
    setLayers((prev) =>
      prev.map((l) =>
        l.id === id && l.kind === 'text'
          ? { ...l, text: textDraft.trim(), color: textColor, font: textFont, align: textAlign, bg: textBg }
          : l
      )
    )
    setPanel('none')
  }

  function addSticker(emoji: string) {
    const id = uid()
    const layer: StickerLayer = { id, kind: 'sticker', emoji, x: 50, y: 45, scale: 1 }
    setLayers((prev) => [...prev, layer])
    setHistory((prev) => [...prev, { kind: 'layer', id }])
    setPanel('none')
    setSelectedId(id)
  }

  function deleteLayer(id: string) {
    setLayers((prev) => prev.filter((l) => l.id !== id))
    setHistory((prev) => prev.filter((h) => !(h.kind === 'layer' && h.id === id)))
    if (selectedId === id) setSelectedId(null)
  }

  function patchLayer(id: string, patch: Partial<TextLayer> & Partial<StickerLayer>) {
    setLayers((prev) => prev.map((l) => (l.id === id ? ({ ...l, ...patch } as Layer) : l)))
  }

  function undo() {
    setHistory((prev) => {
      if (prev.length === 0) return prev
      const last = prev[prev.length - 1]
      if (last.kind === 'layer') {
        setLayers((ls) => ls.filter((l) => l.id !== last.id))
        setSelectedId((cur) => (cur === last.id ? null : cur))
      } else {
        setStrokes((ss) => ss.filter((s) => s.id !== last.id))
      }
      return prev.slice(0, -1)
    })
  }

  // ---------- drag / resize ----------
  function relPercent(clientX: number, clientY: number) {
    const rect = previewRef.current?.getBoundingClientRect()
    if (!rect) return { x: 0, y: 0 }
    return {
      x: ((clientX - rect.left) / rect.width) * 100,
      y: ((clientY - rect.top) / rect.height) * 100,
    }
  }

  function onLayerPointerDown(e: React.PointerEvent, layer: Layer) {
    if (panel === 'draw') return
    e.stopPropagation()
    setSelectedId(layer.id)
    ;(e.target as Element).setPointerCapture(e.pointerId)
    dragRef.current = { id: layer.id, startX: e.clientX, startY: e.clientY, layerX: layer.x, layerY: layer.y }
  }
  function onLayerPointerMove(e: React.PointerEvent) {
    const d = dragRef.current
    if (!d) return
    const rect = previewRef.current?.getBoundingClientRect()
    if (!rect) return
    const dx = ((e.clientX - d.startX) / rect.width) * 100
    const dy = ((e.clientY - d.startY) / rect.height) * 100
    patchLayer(d.id, {
      x: Math.min(96, Math.max(4, d.layerX + dx)),
      y: Math.min(96, Math.max(4, d.layerY + dy)),
    })
  }
  function onLayerPointerUp() {
    dragRef.current = null
  }

  function onResizePointerDown(e: React.PointerEvent, layer: Layer) {
    e.stopPropagation()
    ;(e.target as Element).setPointerCapture(e.pointerId)
    resizeRef.current = { id: layer.id, startY: e.clientY, startScale: layer.scale }
  }
  function onResizePointerMove(e: React.PointerEvent) {
    const r = resizeRef.current
    if (!r) return
    const delta = r.startY - e.clientY
    const scale = Math.min(3, Math.max(0.4, r.startScale + delta * 0.006))
    patchLayer(r.id, { scale })
  }
  function onResizePointerUp() {
    resizeRef.current = null
  }

  // ---------- drawing ----------
  function onCanvasPointerDown(e: React.PointerEvent) {
    if (panel !== 'draw') return
    ;(e.target as Element).setPointerCapture(e.pointerId)
    const p = relPercent(e.clientX, e.clientY)
    const stroke: Stroke = { id: uid(), color: drawColor, size: drawSize, points: [p] }
    drawingRef.current = stroke
    setStrokes((prev) => [...prev, stroke])
  }
  function onCanvasPointerMove(e: React.PointerEvent) {
    const s = drawingRef.current
    if (!s || panel !== 'draw') return
    const p = relPercent(e.clientX, e.clientY)
    s.points.push(p)
    setStrokes((prev) => prev.map((st) => (st.id === s.id ? { ...st, points: [...s.points] } : st)))
  }
  function onCanvasPointerUp() {
    const s = drawingRef.current
    if (s) setHistory((prev) => [...prev, { kind: 'stroke', id: s.id }])
    drawingRef.current = null
  }

  // ---------- export ----------
  function backgroundCssStyle(b: Background): React.CSSProperties {
    return b.kind === 'solid' ? { background: b.color } : { background: `linear-gradient(150deg, ${b.from}, ${b.to})` }
  }

  async function flattenToFile(): Promise<File> {
    const canvas = document.createElement('canvas')
    canvas.width = CANVAS_W
    canvas.height = CANVAS_H
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('canvas unsupported')

    if (storyKind === 'text') {
      const bg = BACKGROUNDS[bgIndex]
      if (bg.kind === 'solid') {
        ctx.fillStyle = bg.color
        ctx.fillRect(0, 0, CANVAS_W, CANVAS_H)
      } else {
        const grad = ctx.createLinearGradient(0, 0, CANVAS_W, CANVAS_H)
        grad.addColorStop(0, bg.from)
        grad.addColorStop(1, bg.to)
        ctx.fillStyle = grad
        ctx.fillRect(0, 0, CANVAS_W, CANVAS_H)
      }
    } else if (url) {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const im = new Image()
        im.onload = () => resolve(im)
        im.onerror = reject
        im.src = url
      })
      const scale = Math.max(CANVAS_W / img.width, CANVAS_H / img.height)
      const dw = img.width * scale
      const dh = img.height * scale
      const dx = (CANVAS_W - dw) / 2
      const dy = (CANVAS_H - dh) / 2
      const filter = FILTERS.find((f) => f.key === filterKey)?.css ?? 'none'
      ctx.filter = filter
      ctx.drawImage(img, dx, dy, dw, dh)
      ctx.filter = 'none'
    }

    const rect = previewRef.current?.getBoundingClientRect()
    const k = rect ? CANVAS_W / rect.width : CANVAS_W / 380

    for (const stroke of strokes) {
      ctx.strokeStyle = stroke.color
      ctx.lineWidth = stroke.size * k
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      ctx.beginPath()
      stroke.points.forEach((p, i) => {
        const px = (p.x / 100) * CANVAS_W
        const py = (p.y / 100) * CANVAS_H
        if (i === 0) ctx.moveTo(px, py)
        else ctx.lineTo(px, py)
      })
      ctx.stroke()
    }

    for (const layer of layers) {
      const px = (layer.x / 100) * CANVAS_W
      const py = (layer.y / 100) * CANVAS_H
      if (layer.kind === 'sticker') {
        const size = PREVIEW_EMOJI_BASE * layer.scale * k
        ctx.font = `${size}px sans-serif`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(layer.emoji, px, py)
      } else {
        const size = PREVIEW_TEXT_BASE * layer.scale * k
        const lineHeight = size * 1.3
        const lines = layer.text.split('\n')
        ctx.font = `700 ${size}px ${FONT_CSS[layer.font]}`
        ctx.textAlign = layer.align
        ctx.textBaseline = 'middle'
        const totalH = lines.length * lineHeight
        const startY = py - totalH / 2 + lineHeight / 2
        if (layer.bg) {
          let maxW = 0
          for (const line of lines) maxW = Math.max(maxW, ctx.measureText(line).width)
          const padX = size * 0.45
          const padY = size * 0.35
          const anchorX = layer.align === 'left' ? px : layer.align === 'right' ? px - maxW : px - maxW / 2
          ctx.fillStyle = 'rgba(10,10,12,0.45)'
          const radius = size * 0.25
          const bx = anchorX - padX
          const by = startY - lineHeight / 2 - padY
          const bw = maxW + padX * 2
          const bh = totalH + padY * 2
          ctx.beginPath()
          ctx.moveTo(bx + radius, by)
          ctx.arcTo(bx + bw, by, bx + bw, by + bh, radius)
          ctx.arcTo(bx + bw, by + bh, bx, by + bh, radius)
          ctx.arcTo(bx, by + bh, bx, by, radius)
          ctx.arcTo(bx, by, bx + bw, by, radius)
          ctx.closePath()
          ctx.fill()
        }
        ctx.fillStyle = layer.color
        lines.forEach((line, i) => {
          ctx.fillText(line, px, startY + i * lineHeight)
        })
      }
    }

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png', 0.92))
    if (!blob) throw new Error('export failed')
    return new File([blob], `story-${Date.now()}.png`, { type: 'image/png' })
  }

  async function submit() {
    if (!user || submitting) return
    if (storyKind === 'media' && !file) return
    setSubmitting(true)
    try {
      if (storyKind === 'text' || (storyKind === 'media' && mediaType === 'image')) {
        const flat = await flattenToFile()
        startStoryUpload({ authorId: user.id, file: flat, caption: '' })
      } else if (file) {
        const firstText = layers.find((l): l is TextLayer => l.kind === 'text')
        startStoryUpload({ authorId: user.id, file, caption: firstText?.text ?? '' })
      }
      showToast('Đang chia sẻ tin của bạn...', 'info')
      onClose()
    } catch (e) {
      console.error(e)
      showToast('Không thể xử lý tin, thử lại nhé', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  // ================= RENDER =================

  if (entry === 'choose') {
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
        <button
          onClick={onClose}
          aria-label="Đóng"
          className="absolute top-[calc(env(safe-area-inset-top,0px)+14px)] left-4 w-9 h-9 rounded-full bg-white/10 flex items-center justify-center focus-ring"
        >
          <X size={18} className="text-white" />
        </button>
        <div className="flex-1 flex flex-col items-center justify-center gap-4 px-8">
          <h2 className="font-display font-bold text-xl text-white mb-2">Tạo tin mới</h2>
          <button
            onClick={() => inputRef.current?.click()}
            className="w-full max-w-xs flex items-center gap-4 bg-white/10 hover:bg-white/15 transition rounded-2xl px-5 py-4 focus-ring"
          >
            <div className="w-11 h-11 rounded-full gradient-nova flex items-center justify-center shrink-0">
              <ImagePlus size={20} className="text-black" />
            </div>
            <div className="text-left">
              <p className="text-white font-semibold text-sm">Ảnh / Video</p>
              <p className="text-white/50 text-xs">Thêm chữ, sticker, vẽ tay, bộ lọc</p>
            </div>
          </button>
          <button
            onClick={startTextOnly}
            className="w-full max-w-xs flex items-center gap-4 bg-white/10 hover:bg-white/15 transition rounded-2xl px-5 py-4 focus-ring"
          >
            <div className="w-11 h-11 rounded-full bg-white/15 flex items-center justify-center shrink-0">
              <Type size={20} className="text-white" />
            </div>
            <div className="text-left">
              <p className="text-white font-semibold text-sm">Văn bản</p>
              <p className="text-white/50 text-xs">Nền màu / gradient, không cần ảnh</p>
            </div>
          </button>
          <p className="text-white/40 text-xs text-center pt-2">Tin sẽ tự biến mất sau 24 giờ.</p>
        </div>
      </div>
    )
  }

  const isVideoNoEdit = storyKind === 'media' && mediaType === 'video'
  const activeFilterCss = FILTERS.find((f) => f.key === filterKey)?.css ?? 'none'
  const bg = BACKGROUNDS[bgIndex]

  return (
    <div className="absolute inset-0 z-30 bg-black flex flex-col">
      <div
        ref={previewRef}
        className="relative flex-1 min-h-0 overflow-hidden select-none touch-none"
        onPointerDown={onCanvasPointerDown}
        onPointerMove={(e) => {
          onCanvasPointerMove(e)
          onLayerPointerMove(e)
          onResizePointerMove(e)
        }}
        onPointerUp={() => {
          onCanvasPointerUp()
          onLayerPointerUp()
          onResizePointerUp()
        }}
      >
        {storyKind === 'text' ? (
          <div className="absolute inset-0" style={backgroundCssStyle(bg)} />
        ) : mediaType === 'video' ? (
          <video src={url ?? undefined} className="absolute inset-0 w-full h-full object-cover" autoPlay loop muted playsInline />
        ) : (
          <img src={url ?? undefined} className="absolute inset-0 w-full h-full object-cover" style={{ filter: activeFilterCss }} />
        )}
        <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-transparent to-black/50 pointer-events-none" />

        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 w-full h-full" style={{ pointerEvents: 'none' }}>
          {strokes.map((s) => (
            <polyline
              key={s.id}
              points={s.points.map((p) => `${p.x},${p.y}`).join(' ')}
              fill="none"
              stroke={s.color}
              strokeWidth={s.size}
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
          ))}
        </svg>

        {layers.map((layer) => {
          const selected = selectedId === layer.id
          return (
            <div
              key={layer.id}
              onPointerDown={(e) => onLayerPointerDown(e, layer)}
              onClick={(e) => {
                e.stopPropagation()
                if (layer.kind === 'text' && selected) openEditFor(layer)
              }}
              className={`absolute cursor-grab active:cursor-grabbing ${selected ? 'outline outline-2 outline-dashed outline-white/70 rounded-lg' : ''}`}
              style={{
                left: `${layer.x}%`,
                top: `${layer.y}%`,
                transform: 'translate(-50%, -50%)',
                padding: selected ? 6 : 0,
                touchAction: 'none',
                maxWidth: '85%',
              }}
            >
              {layer.kind === 'sticker' ? (
                <span style={{ fontSize: PREVIEW_EMOJI_BASE * layer.scale, lineHeight: 1, display: 'block' }}>{layer.emoji}</span>
              ) : (
                <p
                  style={{
                    fontFamily: FONT_CSS[layer.font],
                    color: layer.color,
                    fontSize: PREVIEW_TEXT_BASE * layer.scale,
                    fontWeight: 700,
                    textAlign: layer.align,
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                    background: layer.bg ? 'rgba(10,10,12,0.45)' : 'transparent',
                    borderRadius: layer.bg ? 10 : 0,
                    padding: layer.bg ? '0.25em 0.55em' : 0,
                    textShadow: layer.bg ? 'none' : '0 1px 6px rgba(0,0,0,0.35)',
                    margin: 0,
                  }}
                >
                  {layer.text}
                </p>
              )}
              {selected && (
                <>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      deleteLayer(layer.id)
                    }}
                    aria-label="Xoá lớp"
                    className="absolute -top-3 -right-3 w-6 h-6 rounded-full bg-black/70 border border-white/30 flex items-center justify-center"
                  >
                    <X size={12} className="text-white" />
                  </button>
                  <div
                    onPointerDown={(e) => onResizePointerDown(e, layer)}
                    aria-label="Kéo để phóng to/thu nhỏ"
                    className="absolute -bottom-3 -right-3 w-6 h-6 rounded-full bg-white border border-black/10 cursor-nwse-resize"
                    style={{ touchAction: 'none' }}
                  />
                </>
              )}
            </div>
          )
        })}

        <div className="absolute top-[calc(env(safe-area-inset-top,0px)+14px)] inset-x-4 flex items-center justify-between">
          <button onClick={reset} aria-label="Quay lại" className="w-9 h-9 rounded-full bg-black/40 backdrop-blur-md flex items-center justify-center focus-ring">
            <ChevronLeft size={19} className="text-white" />
          </button>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPanel(panel === 'text-edit' ? 'none' : 'text-edit')}
              aria-label="Thêm chữ"
              className={`w-9 h-9 rounded-full backdrop-blur-md flex items-center justify-center focus-ring ${panel === 'text-edit' ? 'bg-white text-black' : 'bg-black/40 text-white'}`}
            >
              <Type size={16} />
            </button>
            <button
              onClick={() => setPanel(panel === 'stickers' ? 'none' : 'stickers')}
              aria-label="Sticker"
              className={`w-9 h-9 rounded-full backdrop-blur-md flex items-center justify-center focus-ring ${panel === 'stickers' ? 'bg-white text-black' : 'bg-black/40 text-white'}`}
            >
              <Smile size={16} />
            </button>
            <button
              onClick={() => setPanel(panel === 'draw' ? 'none' : 'draw')}
              aria-label="Vẽ"
              className={`w-9 h-9 rounded-full backdrop-blur-md flex items-center justify-center focus-ring ${panel === 'draw' ? 'bg-white text-black' : 'bg-black/40 text-white'}`}
            >
              <Pencil size={16} />
            </button>
            {storyKind === 'media' && mediaType === 'image' && (
              <button
                onClick={() => setPanel(panel === 'filters' ? 'none' : 'filters')}
                aria-label="Bộ lọc"
                className={`w-9 h-9 rounded-full backdrop-blur-md flex items-center justify-center focus-ring ${panel === 'filters' ? 'bg-white text-black' : 'bg-black/40 text-white'}`}
              >
                <SlidersHorizontal size={16} />
              </button>
            )}
            {storyKind === 'text' && (
              <button
                onClick={() => setPanel(panel === 'backgrounds' ? 'none' : 'backgrounds')}
                aria-label="Đổi nền"
                className={`w-9 h-9 rounded-full backdrop-blur-md flex items-center justify-center focus-ring ${panel === 'backgrounds' ? 'bg-white text-black' : 'bg-black/40 text-white'}`}
              >
                <Palette size={16} />
              </button>
            )}
            <button
              onClick={undo}
              disabled={history.length === 0}
              aria-label="Hoàn tác"
              className="w-9 h-9 rounded-full bg-black/40 backdrop-blur-md flex items-center justify-center focus-ring disabled:opacity-30 text-white"
            >
              <Undo2 size={16} />
            </button>
          </div>
        </div>

        {panel === 'none' && selectedLayer?.kind === 'text' && (
          <div className="absolute bottom-3 inset-x-4 flex items-center justify-center gap-1.5 bg-black/50 backdrop-blur-md rounded-full py-2 px-2 overflow-x-auto no-scrollbar">
            {TEXT_COLORS.map((c) => (
              <button
                key={c}
                onClick={() => patchLayer(selectedLayer.id, { color: c })}
                aria-label={`Màu ${c}`}
                className={`w-6 h-6 rounded-full shrink-0 border-2 ${selectedLayer.color === c ? 'border-white' : 'border-transparent'}`}
                style={{ background: c }}
              />
            ))}
            <div className="w-px h-5 bg-white/25 mx-1 shrink-0" />
            <button
              onClick={() => {
                const idx = FONT_ORDER.indexOf(selectedLayer.font)
                patchLayer(selectedLayer.id, { font: FONT_ORDER[(idx + 1) % FONT_ORDER.length] })
              }}
              className="w-8 h-6 rounded-full bg-white/15 text-white text-xs font-bold shrink-0"
              style={{ fontFamily: FONT_CSS[selectedLayer.font] }}
            >
              Aa
            </button>
            <button
              onClick={() => {
                const order: Array<'left' | 'center' | 'right'> = ['left', 'center', 'right']
                const idx = order.indexOf(selectedLayer.align)
                patchLayer(selectedLayer.id, { align: order[(idx + 1) % order.length] })
              }}
              className="w-7 h-6 rounded-full bg-white/15 text-white flex items-center justify-center shrink-0"
            >
              {selectedLayer.align === 'left' ? <AlignLeft size={13} /> : selectedLayer.align === 'right' ? <AlignRight size={13} /> : <AlignCenter size={13} />}
            </button>
            <button
              onClick={() => patchLayer(selectedLayer.id, { bg: !selectedLayer.bg })}
              className={`px-2.5 h-6 rounded-full text-[10px] font-bold shrink-0 ${selectedLayer.bg ? 'bg-white text-black' : 'bg-white/15 text-white'}`}
            >
              Nền
            </button>
          </div>
        )}

        {panel === 'text-edit' && (
          <div className="absolute inset-0 bg-black/55 flex flex-col justify-center px-6 gap-4" onPointerDown={(e) => e.stopPropagation()}>
            <textarea
              autoFocus
              value={textDraft}
              onChange={(e) => setTextDraft(e.target.value)}
              placeholder="Nhập chữ..."
              rows={3}
              maxLength={200}
              className="w-full bg-transparent text-center outline-none resize-none placeholder:text-white/50"
              style={{ fontFamily: FONT_CSS[textFont], color: textColor, fontWeight: 700, fontSize: 28, textAlign: textAlign }}
            />
            <div className="flex items-center justify-center gap-2 flex-wrap">
              {TEXT_COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => setTextColor(c)}
                  aria-label={`Màu ${c}`}
                  className={`w-7 h-7 rounded-full border-2 ${textColor === c ? 'border-white' : 'border-transparent'}`}
                  style={{ background: c }}
                />
              ))}
            </div>
            <div className="flex items-center justify-center gap-3">
              <button
                onClick={() => {
                  const idx = FONT_ORDER.indexOf(textFont)
                  setTextFont(FONT_ORDER[(idx + 1) % FONT_ORDER.length])
                }}
                className="px-4 py-2 rounded-full bg-white/15 text-white text-sm font-bold"
                style={{ fontFamily: FONT_CSS[textFont] }}
              >
                Phông chữ
              </button>
              <button
                onClick={() => {
                  const order: Array<'left' | 'center' | 'right'> = ['left', 'center', 'right']
                  const idx = order.indexOf(textAlign)
                  setTextAlign(order[(idx + 1) % order.length])
                }}
                className="w-10 h-10 rounded-full bg-white/15 text-white flex items-center justify-center"
              >
                {textAlign === 'left' ? <AlignLeft size={16} /> : textAlign === 'right' ? <AlignRight size={16} /> : <AlignCenter size={16} />}
              </button>
              <button
                onClick={() => setTextBg((v) => !v)}
                className={`px-4 py-2 rounded-full text-sm font-bold ${textBg ? 'bg-white text-black' : 'bg-white/15 text-white'}`}
              >
                Nền chữ
              </button>
            </div>
            <div className="flex items-center justify-center gap-3 pt-2">
              <button onClick={() => setPanel('none')} className="px-5 py-2.5 rounded-full bg-white/15 text-white text-sm font-semibold">
                Huỷ
              </button>
              <button onClick={commitTextEdit} className="px-6 py-2.5 rounded-full gradient-nova text-black text-sm font-bold flex items-center gap-1.5">
                <Check size={15} /> Xong
              </button>
            </div>
          </div>
        )}

        {panel === 'stickers' && (
          <div className="absolute bottom-0 inset-x-0 bg-[var(--surface)] rounded-t-3xl p-4 max-h-[45%] overflow-y-auto" onPointerDown={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-semibold">Sticker</p>
              <button onClick={() => setPanel('none')} className="w-7 h-7 rounded-full bg-[var(--surface-2)] flex items-center justify-center">
                <X size={14} />
              </button>
            </div>
            <div className="grid grid-cols-6 gap-2">
              {EMOJIS.map((e) => (
                <button key={e} onClick={() => addSticker(e)} className="text-3xl aspect-square rounded-xl hover:bg-[var(--surface-2)] flex items-center justify-center focus-ring">
                  {e}
                </button>
              ))}
            </div>
          </div>
        )}

        {panel === 'draw' && (
          <div className="absolute bottom-3 inset-x-4 flex flex-col gap-2.5" onPointerDown={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-center gap-2 bg-black/50 backdrop-blur-md rounded-full py-2 px-3">
              {DRAW_COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => setDrawColor(c)}
                  aria-label={`Màu vẽ ${c}`}
                  className={`w-6 h-6 rounded-full border-2 ${drawColor === c ? 'border-white' : 'border-transparent'}`}
                  style={{ background: c }}
                />
              ))}
              <div className="w-px h-5 bg-white/25 mx-1" />
              {DRAW_SIZES.map((s) => (
                <button
                  key={s}
                  onClick={() => setDrawSize(s)}
                  aria-label={`Cỡ nét ${s}`}
                  className="w-7 h-7 rounded-full flex items-center justify-center"
                  style={{ background: drawSize === s ? 'rgba(255,255,255,0.25)' : 'transparent' }}
                >
                  <span className="rounded-full bg-white block" style={{ width: 4 + s * 0.7, height: 4 + s * 0.7 }} />
                </button>
              ))}
            </div>
            <div className="flex justify-center">
              <button onClick={() => setPanel('none')} className="px-6 py-2 rounded-full gradient-nova text-black text-sm font-bold">
                Xong
              </button>
            </div>
          </div>
        )}

        {panel === 'filters' && (
          <div className="absolute bottom-3 inset-x-0 flex gap-3 overflow-x-auto no-scrollbar px-4" onPointerDown={(e) => e.stopPropagation()}>
            {FILTERS.map((f) => (
              <button key={f.key} onClick={() => setFilterKey(f.key)} className="flex flex-col items-center gap-1.5 shrink-0">
                <div className={`w-14 h-14 rounded-2xl overflow-hidden border-2 ${filterKey === f.key ? 'border-white' : 'border-transparent'}`}>
                  {url && <img src={url} className="w-full h-full object-cover" style={{ filter: f.css }} />}
                </div>
                <span className="text-[10px] text-white font-medium">{f.label}</span>
              </button>
            ))}
          </div>
        )}

        {panel === 'backgrounds' && (
          <div className="absolute bottom-3 inset-x-0 flex gap-3 overflow-x-auto no-scrollbar px-4" onPointerDown={(e) => e.stopPropagation()}>
            {BACKGROUNDS.map((b, i) => (
              <button
                key={i}
                onClick={() => setBgIndex(i)}
                className={`w-11 h-11 rounded-full shrink-0 border-2 ${bgIndex === i ? 'border-white' : 'border-transparent'}`}
                style={backgroundCssStyle(b)}
              />
            ))}
          </div>
        )}

        {isVideoNoEdit && panel === 'none' && (
          <p className="absolute top-16 inset-x-4 text-center text-[11px] text-white/50">
            Video: chữ/sticker/vẽ chỉ áp dụng đầy đủ cho ảnh. Lớp chữ đầu tiên sẽ được dùng làm chú thích.
          </p>
        )}

        {panel === 'none' && !selectedLayer && (
          <div className="absolute bottom-5 inset-x-4 flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full border border-white/30 overflow-hidden flex items-center justify-center text-xs font-semibold text-white shrink-0">
              {me?.avatar_url ? <img src={me.avatar_url} className="w-full h-full object-cover" /> : me?.username?.slice(0, 1).toUpperCase()}
            </div>
            <span className="text-xs font-semibold text-white flex-1 truncate">Tin của bạn</span>
            <button
              onClick={submit}
              disabled={submitting}
              className="gradient-nova text-black font-bold text-sm rounded-full px-5 py-2.5 focus-ring shrink-0 disabled:opacity-50"
            >
              {submitting ? 'Đang xử lý...' : 'Chia sẻ tin'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
