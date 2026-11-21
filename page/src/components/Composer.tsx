import type { Ref } from 'preact'
import type { Words } from '../dictionary'
import { useRef } from 'preact/hooks'
import { AvatarDisguiseIcon, ImageDisplayIcon, AttachIcon, ReplyIcon, CloseIcon, StreamingIcon } from './icons'
import type { useReply } from '../use-reply'
import type { useUpload } from '../use-upload'

export function Composer({ words, stream, images, disguiseAvatars, input, onStream, onImages, onDisguiseAvatars, reply, canReply, storageError, onLogin, loginBusy, onViewPost, upload }: {
  words: Words
  stream: boolean
  images: boolean
  disguiseAvatars: boolean
  input: Ref<HTMLTextAreaElement>
  onStream: (stream: boolean) => void
  onImages: (images: boolean) => void
  onDisguiseAvatars: (disguise: boolean) => void
  reply: ReturnType<typeof useReply>
  canReply: boolean
  storageError: boolean
  onLogin: () => void
  loginBusy: boolean
  onViewPost: () => void
  // Absent where the forum takes no pictures from here (V2EX).
  upload: ReturnType<typeof useUpload> | null
}) {
  const picker = useRef<HTMLInputElement>(null)
  const canUpload = upload !== null && canReply && !reply.sending
  const pictures = (list: FileList | null | undefined) => Array.from(list ?? []).filter((file) => file.type.startsWith('image/'))
  const failure = reply.sending ? null : reply.feedback?.failure?.kind ?? (reply.uncertain ? 'unconfirmed' : null)
  const newlineKey = /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Win'
  return (
    <div className="chat-dock">
      <div className="chat-input-card" data-working={reply.sending || undefined}>
        {reply.target && (
          <div className="reply-target" role="group" aria-label={words.replyToComment(reply.target.floor, reply.target.author)}>
            <ReplyIcon />
            <span>{words.replyToComment(reply.target.floor, reply.target.author)}</span>
            <button type="button" className="tool-button" disabled={reply.sending}
              title={words.cancelReplyTarget} aria-label={words.cancelReplyTarget} onClick={() => reply.setTarget(null)}><CloseIcon /></button>
          </div>
        )}
        <textarea ref={input} className="chat-input reply-input" rows={2} maxLength={8000}
          aria-label={words.replyPlaceholder} placeholder={canReply ? words.replyPlaceholder : words.loginToReply}
          value={reply.text} disabled={!canReply || reply.sending}
          onInput={(event) => reply.setText(event.currentTarget.value)}
          onPaste={(event) => {
            const files = pictures(event.clipboardData?.files)
            if (!canUpload || files.length === 0) return
            event.preventDefault()
            void upload.upload(files)
          }}
          onDragOver={(event) => { if (canUpload && event.dataTransfer?.types.includes('Files')) event.preventDefault() }}
          onDrop={(event) => {
            const files = pictures(event.dataTransfer?.files)
            if (!canUpload || files.length === 0) return
            event.preventDefault()
            void upload.upload(files)
          }}
          onKeyDown={(event) => {
            if (event.key !== 'Enter' || event.isComposing || event.keyCode === 229) return
            event.stopPropagation()
            if (event.metaKey) {
              event.preventDefault()
              if (!canReply || reply.sending) return
              const field = event.currentTarget
              if (field.value.length - (field.selectionEnd - field.selectionStart) >= field.maxLength) return
              const caret = field.selectionStart + 1
              field.setRangeText('\n')
              field.setSelectionRange(caret, caret)
              reply.setText(field.value)
              return
            }
            if (event.shiftKey || event.ctrlKey || event.altKey) return
            event.preventDefault()
            if (!event.repeat && canReply) void reply.send()
          }} />
        <div className="chat-options">
          <div className="chat-reading-options" role="group" aria-label={words.readingOptions}>
            <button type="button" className="chat-picker reading-toggle" aria-label={words.stream(stream)} data-tooltip={words.stream(stream)} aria-pressed={stream} onClick={() => onStream(!stream)}>
              <StreamingIcon active={stream} />
            </button>
            <button type="button" className="chat-picker reading-toggle" aria-label={words.images(images)} data-tooltip={words.images(images)} aria-pressed={images} onClick={() => onImages(!images)}>
              <ImageDisplayIcon active={images} />
            </button>
            <button type="button" className="chat-picker reading-toggle" aria-label={words.avatars(disguiseAvatars)} data-tooltip={words.avatars(disguiseAvatars)} aria-pressed={disguiseAvatars} onClick={() => onDisguiseAvatars(!disguiseAvatars)}>
              <AvatarDisguiseIcon active={disguiseAvatars} />
            </button>
          </div>
          {upload && <div className="chat-attach">
            <button type="button" className="chat-picker reading-toggle" aria-label={words.insertPicture} data-tooltip={words.insertPicture} disabled={!canUpload} onClick={() => picker.current?.click()}>
              <AttachIcon />
            </button>
            <input ref={picker} type="file" accept="image/*" multiple hidden onChange={(event) => {
              const files = pictures(event.currentTarget.files)
              event.currentTarget.value = ''
              if (files.length) void upload.upload(files)
            }} />
          </div>}
          <span className="reply-hint muted">{words.replyHint(newlineKey)}</span>
          <button type="button" className="button reply-send" disabled={!canReply || reply.sending || reply.uncertain || reply.cooling || !reply.text.trim() || (upload?.uploading ?? 0) > 0} onClick={() => void reply.send()}>{reply.sending ? words.sendingReply : reply.cooling ? words.replyCooling : words.sendReply}</button>
        </div>
        {upload && upload.uploading > 0 && <p className="reply-feedback" role="status">{words.uploadingPictures(upload.uploading)}</p>}
        {upload?.error && <p className="reply-feedback" data-error="" role="alert">{upload.error}</p>}
        {storageError && <p className="reply-feedback" data-error="" role="alert">{words.draftNotSaved}</p>}
        {reply.uncertain && !reply.sending && !reply.feedback && <p className="reply-feedback" data-error="" role="alert">{words.replyUnconfirmed}</p>}
        {reply.feedback && <p className="reply-feedback" data-error={reply.feedback.error || undefined} role={reply.feedback.error ? 'alert' : 'status'}>{reply.feedback.text || words.replySent}</p>}
        {failure && <div className="reply-recovery">
          {failure === 'login' && <button type="button" className="button" disabled={loginBusy || reply.sending} onClick={onLogin}>{words.loginAgain}</button>}
          {(failure === 'unconfirmed' || failure === 'login' || failure === 'rejected') && <button type="button" className="button" onClick={onViewPost}>{words.viewPost}</button>}
          {failure === 'rate-limit' && <span className="muted">{reply.feedback?.failure?.retryAfter ? words.retryAfter(reply.feedback.failure.retryAfter) : words.rateLimitHint}</span>}
          {reply.uncertain && <button type="button" className="button" disabled={reply.sending} onClick={reply.allowResend}>{words.allowResend}</button>}
        </div>}
      </div>
    </div>
  )
}
