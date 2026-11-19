import { useEffect, useRef } from 'preact/hooks'
import type { ForumNotification } from '../../../src/community'
import type { Words } from '../dictionary'
import type { PageHost } from '../host'
import type { Notifications } from '../use-notifications'
import { absoluteTime, relativeTime } from '../relative-time'
import { BellIcon, CheckIcon, CloseIcon, RefreshIcon } from './icons'

export function NotificationsMenu({ inbox, words, locale, now, onSelect }: {
  inbox: Notifications; words: Words; locale: PageHost['locale']; now: number; onSelect: (notification: ForumNotification) => void
}) {
  const root = useRef<HTMLDivElement>(null)
  const bell = useRef<HTMLButtonElement>(null)
  const panel = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!inbox.open) return
    panel.current?.focus()
    const outside = (event: PointerEvent) => { if (event.target instanceof Node && !root.current?.contains(event.target)) inbox.close() }
    document.addEventListener('pointerdown', outside)
    return () => document.removeEventListener('pointerdown', outside)
  }, [inbox.open])
  return <div className="menu-anchor notifications-anchor" ref={root}
    onKeyDown={(event) => {
      if (event.key !== 'Escape' || !inbox.open) return
      event.preventDefault(); event.stopPropagation(); inbox.close(); bell.current?.focus()
    }}>
    <button ref={bell} type="button" className="tool-button notification-bell" aria-label={inbox.unread !== null && inbox.unread > 0 ? words.notificationCount(inbox.unread) : words.myNotifications}
      title={!inbox.enabled ? words.loginForNotifications : inbox.unread === null ? words.myNotifications : words.notificationCount(inbox.unread)}
      aria-expanded={inbox.open} aria-haspopup="dialog" disabled={!inbox.enabled} onClick={inbox.toggle}>
      <BellIcon />
      {inbox.enabled && inbox.unread !== null && inbox.unread > 0 && <span className="notification-badge">{inbox.unread > 99 ? '99+' : inbox.unread}</span>}
    </button>
    {inbox.open && <div ref={panel} className="notifications-popover" data-notifications-panel="" role="dialog" aria-label={words.myNotifications} tabIndex={-1}>
      <div className="notifications-head">
        <strong>{words.myNotifications}</strong>
        <button type="button" className="tool-button" title={words.refreshNotifications} aria-label={words.refreshNotifications} disabled={inbox.loading || inbox.reading !== null} onClick={inbox.refresh}><RefreshIcon /></button>
        <button type="button" className="tool-button" title={words.closeNotifications} aria-label={words.closeNotifications} onClick={() => { inbox.close(); bell.current?.focus() }}><CloseIcon /></button>
      </div>
      {inbox.readOnOpen && <p className="notifications-hint">{words.notificationsReadOnOpen}</p>}
      <ul className="notifications-list">
        {inbox.items.map((item) => <li key={item.id} className="notification-row" data-unread={item.read === false || undefined}>
          <button type="button" className="notification-open" onClick={() => { inbox.close(); onSelect(item) }}>
            <span className="notification-action">{words.notificationAction(item.kind, item.actor)}</span>
            <span className="notification-title">{item.title || words.communityNotification}</span>
            {item.excerpt && <span className="notification-excerpt">{item.excerpt}</span>}
            {(item.time !== null || item.timeLabel) && <span className="notification-time" title={item.time !== null ? absoluteTime(item.time) : undefined}>{item.time !== null ? relativeTime(item.time, now, locale) : item.timeLabel}</span>}
          </button>
          {item.read === false && !inbox.readOnOpen && <button type="button" className="tool-button notification-mark" disabled={inbox.reading !== null || inbox.loading}
            title={words.markNotificationRead} aria-label={`${words.markNotificationRead}：${item.title || words.communityNotification}`} onClick={() => void inbox.markRead(item)}><CheckIcon /></button>}
        </li>)}
      </ul>
      {inbox.loading && <p className="notifications-hint" role="status">{words.loading}</p>}
      {!inbox.loading && !inbox.error && inbox.items.length === 0 && <p className="notifications-hint">{words.noNotifications}</p>}
      {inbox.error && <div className="notifications-error" role="alert">{inbox.error}<button type="button" className="link-button" disabled={inbox.loading} onClick={inbox.retry}>{words.retry}</button></div>}
      {inbox.readError && <p className="notifications-error" role="alert">{words.notificationReadFailed(inbox.readError)}</p>}
      {inbox.more && !inbox.error && <button type="button" className="button notifications-more" disabled={inbox.loading || inbox.reading !== null} onClick={inbox.next}>{words.loadMoreNotifications}</button>}
    </div>}
  </div>
}
