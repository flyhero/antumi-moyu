// Antumi's own line icons, drawn the same way (20px box, 1.6 stroke), so the page reads as the app.
const stroked = {
  viewBox: '0 0 20 20',
  fill: 'none',
  stroke: 'currentColor',
  'stroke-width': 1.6,
  'stroke-linecap': 'round',
  'stroke-linejoin': 'round',
  'aria-hidden': true
} as const

export function EnterIcon() {
  return <svg {...stroked}><path d="M15.5 4.5v5a2.5 2.5 0 0 1-2.5 2.5H4.5M8 8.5 4.5 12 8 15.5" /></svg>
}

// Lines being typed, with the caret still on the last one. A slash means replies arrive all at once.
export function StreamingIcon({ active }: { active: boolean }) {
  return <svg {...stroked}>
    <path d="M3 5h9M3 10h12M3 15h6" />
    <path d="M11 13.2v3.6" />
    {!active && <path d="m3.5 3.5 13 13" />}
  </svg>
}

export function ImageDisplayIcon({ active }: { active: boolean }) {
  return <svg {...stroked}>
    <rect x="3" y="3.5" width="14" height="13" rx="2" />
    <circle cx="7" cy="7.5" r="1" />
    <path d="m4 14 4-4 3 3 2-2 4 4" />
    {!active && <path d="m3.5 3.5 13 13" />}
  </svg>
}

export function HashIcon() {
  return <svg {...stroked}><path d="m8 3-2 14M14 3l-2 14M3 7h14M2 13h14" /></svg>
}

export function LeaveIcon() {
  return <svg {...stroked}><path d="M8 4H4v12h4M9 10h8m-3-3 3 3-3 3" /></svg>
}

export function ChevronDownIcon() {
  return <svg {...stroked}><path d="M6 8l4 4 4-4" /></svg>
}

export function CheckIcon() {
  return <svg {...stroked}><path d="M4.5 10.5l3.5 3.5 7.5-8" /></svg>
}

export function RefreshIcon() {
  return <svg {...stroked}><path d="M15.5 8A6 6 0 0 0 4.7 6.5M4.5 12a6 6 0 0 0 10.8 1.5M4.5 3.5v3h3M15.5 16.5v-3h-3" /></svg>
}

export function ExternalIcon() {
  return <svg {...stroked}><path d="M11.5 4.5h4v4M15.5 4.5 9 11M13.5 11.5v3a1 1 0 0 1-1 1h-7a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1h3" /></svg>
}

export function ReplyIcon() {
  return <svg {...stroked}><path d="M8 5.5 4 9.5l4 4M4.5 9.5h7a4 4 0 0 1 4 4v1" /></svg>
}

export function BellIcon() {
  return <svg {...stroked}><path d="M5 8a5 5 0 0 1 10 0c0 5 2 5 2 6H3c0-1 2-1 2-6Zm3 8a2 2 0 0 0 4 0" /></svg>
}

export function CloseIcon() {
  return <svg {...stroked}><path d="m5.5 5.5 9 9m0-9-9 9" /></svg>
}

export function HeartIcon() {
  return <svg {...stroked}><path d="M10 16s-6-3.6-6-8a3.2 3.2 0 0 1 6-1.6A3.2 3.2 0 0 1 16 8c0 4.4-6 8-6 8Z" /></svg>
}

export function AvatarDisguiseIcon({ active }: { active: boolean }) {
  return <svg {...stroked}>
    <path d="M2.5 6.5C5.2 6.5 7.1 8 10 8s4.8-1.5 7.5-1.5v3.2c0 3-1.8 5.3-4.1 5.3-1.7 0-2.2-1.5-3.4-1.5S8.3 15 6.6 15c-2.3 0-4.1-2.3-4.1-5.3Z" />
    <path d="M5 9.5h2.5M12.5 9.5H15" />
    {!active && <path d="m3.5 3.5 13 13" />}
  </svg>
}

// The assistant's mark, where an agent's logo would be.
export function SparkIcon() {
  return <svg {...stroked}><path d="M10 3.5c.5 3.4 2.6 5.5 6 6-3.4.5-5.5 2.6-6 6-.5-3.4-2.6-5.5-6-6 3.4-.5 5.5-2.6 6-6Z" /></svg>
}

// Antumi's "thinking" brain (Lucide's, ISC licence), with the signal and sparks that move while it works.
export function ThinkingIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z" />
      <path d="M12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z" />
      <path d="M17.599 6.5a3 3 0 0 0 .399-1.375M6.003 5.125A3 3 0 0 0 6.401 6.5M3.477 10.896a4 4 0 0 1 .585-.396M19.938 10.5a4 4 0 0 1 .585.396M6 18a4 4 0 0 1-1.967-.516M19.967 17.484A4 4 0 0 1 18 18" />
      <path className="chat-working-signal" d="M15 13a4.5 4.5 0 0 1-3-4 4.5 4.5 0 0 1-3 4" />
      <circle className="chat-working-spark" cx="7" cy="9" r="1.3" stroke="none" />
      <circle className="chat-working-spark" cx="17" cy="9.5" r="1.3" stroke="none" />
      <circle className="chat-working-spark" cx="12" cy="15.5" r="1.3" stroke="none" />
    </svg>
  )
}

// Antumi's "writing the reply": three lines drawn one after another.
export function ReplyingIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true">
      <path className="chat-working-line" d="M2.5 4h11" />
      <path className="chat-working-line" d="M2.5 8h11" />
      <path className="chat-working-line" d="M2.5 12h7" />
    </svg>
  )
}
