import { supabase } from './supabaseClient'

export type UploadJobKind = 'post' | 'story'
export type UploadJobStatus = 'uploading' | 'publishing' | 'done' | 'error'

export interface UploadJob {
  id: string
  kind: UploadJobKind
  status: UploadJobStatus
  /** 0..100 */
  progress: number
  totalFiles: number
  doneFiles: number
  caption: string
  thumbnailUrl: string | null
  error: string | null
  postId?: string
}

type Listener = (jobs: UploadJob[]) => void

const jobs = new Map<string, UploadJob>()
const listeners = new Set<Listener>()

function emit() {
  const list = Array.from(jobs.values())
  listeners.forEach((l) => l(list))
}

function setJob(id: string, patch: Partial<UploadJob>) {
  const current = jobs.get(id)
  if (!current) return
  jobs.set(id, { ...current, ...patch })
  emit()
}

export function subscribeUploads(listener: Listener): () => void {
  listeners.add(listener)
  listener(Array.from(jobs.values()))
  return () => listeners.delete(listener)
}

export function dismissUploadJob(id: string) {
  jobs.delete(id)
  emit()
}

/** Upload thẳng lên Supabase Storage bằng XHR để có % tiến trình thật (supabase-js không expose progress). */
async function uploadFileWithProgress(
  bucket: string,
  path: string,
  file: File,
  onProgress: (fraction: number) => void
): Promise<string> {
  const { data: sessionData } = await supabase.auth.getSession()
  const token = sessionData.session?.access_token
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string
  if (!token) throw new Error('Bạn cần đăng nhập lại để đăng bài.')

  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', `${supabaseUrl}/storage/v1/object/${bucket}/${encodeURI(path)}`)
    xhr.setRequestHeader('Authorization', `Bearer ${token}`)
    xhr.setRequestHeader('apikey', anonKey)
    xhr.setRequestHeader('x-upsert', 'false')
    xhr.setRequestHeader('cache-control', '3600')
    xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream')
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(e.loaded / e.total)
    }
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress(1)
        resolve()
      } else {
        reject(new Error(`Tải lên thất bại (${xhr.status})`))
      }
    }
    xhr.onerror = () => reject(new Error('Lỗi mạng khi tải lên'))
    xhr.send(file)
  })

  const { data: pub } = supabase.storage.from(bucket).getPublicUrl(path)
  return pub.publicUrl
}

function mediaKindOf(file: File): 'image' | 'video' {
  return file.type.startsWith('video/') ? 'video' : 'image'
}

interface StartPostUploadArgs {
  authorId: string
  caption: string
  files: File[]
  onDone?: (postId: string) => void
}

/** Đăng bài chạy nền: đóng composer ngay, job này tự chạy tới cùng và báo tiến trình qua subscribeUploads(). */
export function startPostUpload({ authorId, caption, files, onDone }: StartPostUploadArgs): string {
  const id = `post-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const job: UploadJob = {
    id,
    kind: 'post',
    status: 'uploading',
    progress: 0,
    totalFiles: files.length,
    doneFiles: 0,
    caption,
    thumbnailUrl: files[0] ? URL.createObjectURL(files[0]) : null,
    error: null,
  }
  jobs.set(id, job)
  emit()

  ;(async () => {
    try {
      const uploaded: { url: string; kind: 'image' | 'video' }[] = []
      for (let i = 0; i < files.length; i++) {
        const file = files[i]
        const kind = mediaKindOf(file)
        const path = `${authorId}/${Date.now()}-${i}-${file.name.replace(/\s+/g, '_')}`
        const url = await uploadFileWithProgress('posts', path, file, (fraction) => {
          const overall = ((i + fraction) / files.length) * 100
          setJob(id, { progress: Math.min(99, overall) })
        })
        uploaded.push({ url, kind })
        setJob(id, { doneFiles: i + 1 })
      }

      setJob(id, { status: 'publishing', progress: 99 })

      const { data: postRow, error: postError } = await supabase
        .from('posts')
        .insert({
          author_id: authorId,
          caption: caption.trim() || null,
          media_url: uploaded[0]?.url ?? null,
          media_type: uploaded[0]?.kind ?? null,
        })
        .select()
        .single()
      if (postError) throw postError

      if (uploaded.length > 0) {
        const rows = uploaded.map((m, idx) => ({
          post_id: postRow.id,
          media_url: m.url,
          media_type: m.kind,
          position: idx,
        }))
        const { error: mediaError } = await supabase.from('post_media').insert(rows)
        if (mediaError) throw mediaError
      }

      setJob(id, { status: 'done', progress: 100, postId: postRow.id })
      onDone?.(postRow.id)
      setTimeout(() => dismissUploadJob(id), 3500)
    } catch (e) {
      console.error(e)
      setJob(id, { status: 'error', error: e instanceof Error ? e.message : 'Đăng bài thất bại' })
    }
  })()

  return id
}

interface StartStoryUploadArgs {
  authorId: string
  file: File
  caption: string
  onDone?: (storyId: string) => void
}

export function startStoryUpload({ authorId, file, caption, onDone }: StartStoryUploadArgs): string {
  const id = `story-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const kind = mediaKindOf(file)
  const job: UploadJob = {
    id,
    kind: 'story',
    status: 'uploading',
    progress: 0,
    totalFiles: 1,
    doneFiles: 0,
    caption,
    thumbnailUrl: URL.createObjectURL(file),
    error: null,
  }
  jobs.set(id, job)
  emit()

  ;(async () => {
    try {
      const path = `${authorId}/${Date.now()}-${file.name.replace(/\s+/g, '_')}`
      const url = await uploadFileWithProgress('stories', path, file, (fraction) => {
        setJob(id, { progress: Math.min(99, fraction * 100) })
      })

      setJob(id, { status: 'publishing', progress: 99 })

      const { data: row, error } = await supabase
        .from('stories')
        .insert({ author_id: authorId, media_url: url, media_type: kind, caption: caption.trim() || null })
        .select()
        .single()
      if (error) throw error

      setJob(id, { status: 'done', progress: 100 })
      onDone?.(row.id)
      setTimeout(() => dismissUploadJob(id), 3000)
    } catch (e) {
      console.error(e)
      setJob(id, { status: 'error', error: e instanceof Error ? e.message : 'Đăng tin thất bại' })
    }
  })()

  return id
}
