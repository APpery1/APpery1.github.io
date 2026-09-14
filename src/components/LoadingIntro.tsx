import { useEffect, useRef, useState } from 'react'
import Typist from 'react-typist-component'

const EXIT_DELAY = 1000
const EXIT_DURATION = 900

type Props = {
  onComplete: () => void
}

export function LoadingIntro({ onComplete }: Props) {
  const [exiting, setExiting] = useState(false)
  const typingTimerRef = useRef<number | null>(null)
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

  useEffect(() => {
    if (!reducedMotion) return
    const timer = window.setTimeout(() => setExiting(true), EXIT_DELAY)
    return () => window.clearTimeout(timer)
  }, [reducedMotion])

  useEffect(() => {
    if (!exiting) return
    const timer = window.setTimeout(onComplete, reducedMotion ? 0 : EXIT_DURATION)
    return () => window.clearTimeout(timer)
  }, [exiting, onComplete, reducedMotion])

  useEffect(() => () => {
    if (typingTimerRef.current !== null) window.clearTimeout(typingTimerRef.current)
  }, [])

  const handleTypingDone = () => {
    if (reducedMotion) return
    typingTimerRef.current = window.setTimeout(() => setExiting(true), EXIT_DELAY)
  }

  return (
    <div className={exiting ? 'loading-intro is-exiting' : 'loading-intro'} role="status" aria-live="polite">
      <div className="loading-intro__panel loading-intro__panel--left" />
      <div className="loading-intro__panel loading-intro__panel--right" />
      <div className="loading-intro__text" aria-label="Hi,I am APpery">
        <Typist
          typingDelay={105}
          startDelay={320}
          onTypingDone={handleTypingDone}
          cursor={<span className="loading-intro__cursor">|</span>}
          hideCursorWhenDone={false}
          disabled={reducedMotion}
        >
          Hi,I am APpery
        </Typist>
      </div>
    </div>
  )
}
