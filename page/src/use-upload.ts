import { useRef, useState } from 'preact/hooks'
import type { RefObject } from 'preact'
import { UploadResult } from '../../src/community'
import type { Words } from './dictionary'
import type { PageHost } from './host'
import { PictureError, preparePicture } from './picture-upload'
import { callReader, errorMessage } from './reader-client'

const MAX_TEXT = 8000

// Pictures for the reply being written: each is uploaded to the forum, and its markdown goes into
// the draft where the caret was when it finished, as the forum's own composer does.
export function useUpload(host: PageHost, words: Words, input: RefObject<HTMLTextAreaElement | null>, draftKey: string, text: string, setText: (text: string) => void) {
  const [uploading, setUploading] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const latest = useRef(text)
  latest.current = text
  const draft = useRef(draftKey)
  draft.current = draftKey

  const insert = (markdown: string) => {
    const current = latest.current
    const field = input.current
    const at = field && document.activeElement === field ? field.selectionEnd : current.length
    const before = current.slice(0, at)
    const after = current.slice(at)
    const piece = `${before && !before.endsWith('\n') ? '\n' : ''}${markdown}${after.startsWith('\n') ? '' : '\n'}`
    if (current.length + piece.length > MAX_TEXT) { setError(words.uploadNoRoom); return }
    const next = before + piece + after
    latest.current = next
    setText(next)
    if (field && document.activeElement === field) requestAnimationFrame(() => field.setSelectionRange(at + piece.length, at + piece.length))
  }

  const upload = async (files: readonly File[]) => {
    const pictures = files.filter((file) => file.type.startsWith('image/'))
    if (pictures.length === 0) return
    setError(null)
    setUploading((count) => count + pictures.length)
    // One at a time, in order: the forum limits how fast it takes them, and the draft reads in order.
    const started = draft.current
    for (const file of pictures) {
      try {
        const prepared = await preparePicture(file)
        const result = UploadResult.parse(await callReader(host, 'upload', prepared))
        if (result.state === 'failed') setError(result.failure.message)
        // Another topic open now: its draft is not where this picture was meant to go.
        else if (draft.current !== started) setError(words.uploadTopicChanged)
        else insert(result.markdown)
      } catch (failure) {
        setError(failure instanceof PictureError ? (failure.reason === 'not-image' ? words.notAPicture : words.pictureTooLarge) : errorMessage(failure))
      } finally {
        setUploading((count) => count - 1)
      }
    }
  }
  return { uploading, error, upload, clearError: () => setError(null) }
}
