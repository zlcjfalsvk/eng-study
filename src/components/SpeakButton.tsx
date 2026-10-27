import { useEffect, useState } from 'react'
import { speak, isTTSSupported } from '../lib/tts'
import { useStore } from '../store/progress'
import { cx } from './ui'

export function SpeakButton({ text, size = 'md', className, label }: { text: string; size?: 'sm' | 'md' | 'lg'; className?: string; label?: string }) {
  const { rate, voiceURI } = useStore((s) => s.settings)
  const [playing, setPlaying] = useState(false)
  useEffect(() => () => setPlaying(false), [])
  if (!isTTSSupported()) return null
  const dim = { sm: 'size-7', md: 'size-9', lg: 'size-12' }[size]
  const icon = { sm: 14, md: 18, lg: 24 }[size]
  return (
    <button
      type="button"
      aria-label={label ?? `"${text}" 듣기`}
      onClick={(e) => {
        e.stopPropagation()
        setPlaying(true)
        speak(text, { rate, voiceURI, onEnd: () => setPlaying(false) })
        setTimeout(() => setPlaying(false), 15000)
      }}
      className={cx(
        'inline-flex shrink-0 items-center justify-center rounded-full transition active:scale-95',
        playing ? 'bg-brand-600 text-white' : 'bg-brand-50 text-brand-600 hover:bg-brand-100 dark:bg-brand-600/20 dark:text-brand-100',
        dim,
        className,
      )}
    >
      <svg width={icon} height={icon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M11 5L6 9H2v6h4l5 4V5z" />
        <path d="M15.5 8.5a5 5 0 0 1 0 7" />
        {playing && <path d="M19 5a9 9 0 0 1 0 14" />}
      </svg>
    </button>
  )
}
