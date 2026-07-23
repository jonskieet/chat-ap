import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'
import PostComposer from '../components/PostComposer'
import StoryComposer from '../components/StoryComposer'
import UploadProgressStack from '../components/UploadProgressStack'

interface ComposerContextValue {
  openPostComposer: () => void
  openStoryComposer: () => void
}

const ComposerContext = createContext<ComposerContextValue | undefined>(undefined)

export function ComposerProvider({ children }: { children: ReactNode }) {
  const [postOpen, setPostOpen] = useState(false)
  const [storyOpen, setStoryOpen] = useState(false)

  const openPostComposer = useCallback(() => setPostOpen(true), [])
  const openStoryComposer = useCallback(() => setStoryOpen(true), [])

  return (
    <ComposerContext.Provider value={{ openPostComposer, openStoryComposer }}>
      {children}
      {postOpen && <PostComposer onClose={() => setPostOpen(false)} />}
      {storyOpen && <StoryComposer onClose={() => setStoryOpen(false)} />}
      <UploadProgressStack />
    </ComposerContext.Provider>
  )
}

export function useComposer() {
  const ctx = useContext(ComposerContext)
  if (!ctx) throw new Error('useComposer phải được dùng bên trong ComposerProvider')
  return ctx
}
