import type { Ref } from 'preact'
import type { Words } from '../dictionary'
import { AvatarDisguiseIcon, ImageDisplayIcon, ReplyIcon, CloseIcon, StreamingIcon } from './icons'
import type { useReply } from '../use-reply'

export function Composer({ words, stream, images, disguiseAvatars, input, onStream, onImages, onDisguiseAvatars, reply, canReply, storageError, onLogin, loginBusy, onViewPost }: {
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
}) {
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
            <button type="button" className="chat-picker reading-toggle" aria-label={words.streaming} title={words.stream(stream)} aria-pressed={stream} onClick={() => onStream(!stream)}>
              <StreamingIcon active={stream} />
            </button>
            <button type="button" className="chat-picker reading-toggle" aria-label={words.showImages} title={words.images(images)} aria-pressed={images} onClick={() => onImages(!images)}>
              <ImageDisplayIcon active={images} />
            </button>
            <button type="button" className="chat-picker reading-toggle" aria-label={words.avatarDisguise} title={words.avatars(disguiseAvatars)} aria-pressed={disguiseAvatars} onClick={() => onDisguiseAvatars(!disguiseAvatars)}>
              <AvatarDisguiseIcon active={disguiseAvatars} />
            </button>
          </div>
          <span className="reply-hint muted">{words.replyHint(newlineKey)}</span>
          <button type="button" className="button reply-send" disabled={!canReply || reply.sending || reply.uncertain || reply.cooling || !reply.text.trim()} onClick={() => void reply.send()}>{reply.sending ? words.sendingReply : reply.cooling ? words.replyCooling : words.sendReply}</button>
        </div>
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
