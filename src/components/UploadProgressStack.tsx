import { useEffect, useState } from 'react'
import { AlertCircle, Check, X } from 'lucide-react'
import { dismissUploadJob, subscribeUploads, type UploadJob } from '../lib/uploadManager'

export default function UploadProgressStack() {
  const [jobs, setJobs] = useState<UploadJob[]>([])

  useEffect(() => subscribeUploads(setJobs), [])

  if (jobs.length === 0) return null

  return (
    <div className="fixed inset-x-0 top-0 z-[220] pointer-events-none flex justify-center" aria-live="polite">
      <div className="w-full sm:max-w-[420px] flex flex-col gap-2 px-4 pt-[calc(env(safe-area-inset-top,0px)+14px)]">
        {jobs.map((job) => (
          <UploadCard key={job.id} job={job} />
        ))}
      </div>
    </div>
  )
}

function UploadCard({ job }: { job: UploadJob }) {
  const label =
    job.kind === 'post'
      ? job.status === 'uploading'
        ? `Đang tải ${job.doneFiles}/${job.totalFiles} tệp lên...`
        : job.status === 'publishing'
          ? 'Đang đăng bài viết...'
          : job.status === 'done'
            ? 'Đã đăng bài viết'
            : 'Đăng bài thất bại'
      : job.status === 'uploading'
        ? 'Đang tải tin lên...'
        : job.status === 'publishing'
          ? 'Đang chia sẻ tin...'
          : job.status === 'done'
            ? 'Đã chia sẻ tin'
            : 'Đăng tin thất bại'

  return (
    <div className="pointer-events-auto w-full flex items-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)]/95 backdrop-blur-md px-3.5 py-3 shadow-xl toast-enter">
      <div className="relative w-11 h-11 rounded-xl overflow-hidden bg-[var(--surface-2)] shrink-0">
        {job.thumbnailUrl && <img src={job.thumbnailUrl} className="w-full h-full object-cover" />}
        {job.status !== 'done' && job.status !== 'error' && (
          <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
            <svg className="w-5 h-5 animate-spin text-white" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
              <path className="opacity-90" fill="currentColor" d="M4 12a8 8 0 018-8v3a5 5 0 00-5 5H4z" />
            </svg>
          </div>
        )}
        {job.status === 'done' && (
          <div className="absolute inset-0 bg-emerald-500/70 flex items-center justify-center">
            <Check size={18} className="text-white" />
          </div>
        )}
        {job.status === 'error' && (
          <div className="absolute inset-0 bg-rose-500/70 flex items-center justify-center">
            <AlertCircle size={18} className="text-white" />
          </div>
        )}
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold truncate">{label}</p>
        {job.status !== 'error' ? (
          <div className="mt-1.5 h-1.5 rounded-full bg-[var(--surface-2)] overflow-hidden">
            <div
              className="h-full rounded-full gradient-nova transition-all duration-200"
              style={{ width: `${Math.max(6, job.progress)}%` }}
            />
          </div>
        ) : (
          <p className="text-xs text-rose-400 truncate mt-0.5">{job.error}</p>
        )}
      </div>

      {(job.status === 'done' || job.status === 'error') && (
        <button
          onClick={() => dismissUploadJob(job.id)}
          aria-label="Đóng"
          className="shrink-0 p-1 rounded-full focus-ring text-[var(--text-dim)]"
        >
          <X size={14} />
        </button>
      )}
    </div>
  )
}
