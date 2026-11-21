import { useEffect, useState } from 'preact/hooks'
import type { CommunityId, Post } from '../../../src/community'
import type { Words } from '../dictionary'
import { HeartIcon } from './icons'

// A post's heart: its count for anyone, a like for a signed-in reader. V2EX's thanks cost coins
// and stay sent, so there the first click only asks.
export function LikeButton({ post, community, words, canLike, liking, onLike }: {
  post: Post
  community: CommunityId
  words: Words
  canLike: boolean
  liking: boolean
  onLike: (post: Post) => void
}) {
  const likes = post.likes ?? 0
  const liked = post.liked === true
  const thanks = community === 'v2ex'
  const [asking, setAsking] = useState(false)
  useEffect(() => {
    if (!asking) return
    const timer = setTimeout(() => setAsking(false), 3000)
    return () => clearTimeout(timer)
  }, [asking])
  if (!canLike && likes === 0) return null
  const settled = thanks && liked
  const title = !canLike ? (likes > 0 ? words.likes(likes) : words.loginToLike)
    : settled ? words.thanked : asking ? words.confirmThank
    : liked ? words.unlike : thanks ? words.thank(post.floor, post.author) : words.like(post.floor, post.author)
  const click = () => {
    if (thanks && !asking) { setAsking(true); return }
    setAsking(false)
    onLike(post)
  }
  return (
    <button type="button" className="chat-turn-like" data-liked={liked || undefined} data-asking={asking || undefined}
      data-count={likes > 0 || undefined}
      aria-pressed={liked} disabled={!canLike || liking || settled} title={title} aria-label={title} onClick={click}>
      <HeartIcon filled={liked} />
      {asking ? <span>{words.confirmThank}</span> : likes > 0 && <span>{likes}</span>}
    </button>
  )
}
