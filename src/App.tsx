import { useCallback, useEffect, useRef, useState } from 'react'
import GhostFibers from './components/GhostFibers'
import { LoadingIntro } from './components/LoadingIntro'
import { Pager } from './components/Pager'
import { SkipLink } from './components/SkipLink'
import { Topbar } from './components/Topbar'
import TargetCursor from './components/TargetCursor.jsx'
import { parseHash } from './lib/hash'
import { ContactPage } from './pages/ContactPage'
import { IntroPage } from './pages/IntroPage'
import { WorkPage } from './pages/WorkPage'
import type { PageId, PanelId } from './types'

export default function App() {
  const [showIntro, setShowIntro] = useState(() => sessionStorage.getItem('appery-intro-seen') !== '1')
  const [panel, setPanel] = useState<PanelId | null>(() => parseHash(window.location.hash).panel)
  const [page, setPage] = useState<PageId>(() => parseHash(window.location.hash).page)
  const scrollerRef = useRef<HTMLElement | null>(null)

  const syncFromHash = useCallback(() => {
    const next = parseHash(window.location.hash)
    setPanel(next.panel)
    setPage(next.page)
    const target = document.getElementById(next.page)
    target?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [])

  useEffect(() => {
    syncFromHash()
    window.addEventListener('hashchange', syncFromHash)
    return () => window.removeEventListener('hashchange', syncFromHash)
  }, [syncFromHash])

  useEffect(() => {
    const root = scrollerRef.current
    if (!root) return

    const sections = Array.from(root.querySelectorAll<HTMLElement>('.page'))
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0]
        const id = visible?.target.id
        if (id !== 'about' && id !== 'work' && id !== 'contact') return

        setPage(id)
        if (id !== 'work') setPanel(null)
        const current = parseHash(window.location.hash)
        if (current.page !== id) history.replaceState(null, '', `#${id}`)
      },
      { root, threshold: 0.55 },
    )

    sections.forEach((section) => observer.observe(section))
    return () => observer.disconnect()
  }, [])

  const openPanel = useCallback((id: PanelId) => {
    window.location.hash = id
  }, [])

  const closePanel = useCallback(() => {
    window.location.hash = 'work'
  }, [])

  const finishIntro = useCallback(() => {
    sessionStorage.setItem('appery-intro-seen', '1')
    setShowIntro(false)
  }, [])

  return (
    <>
      {showIntro && <LoadingIntro onComplete={finishIntro} />}
      <div className="site-background" aria-hidden="true">
        <GhostFibers
          lineColor="#140E35"
          glowColor="#3437A0"
          speed={0.2}
          scale={2}
          rotation={0}
          rotationSpeed={0.25}
          layers={4}
          waveAmplitude={0.015}
          waveFrequency={3}
          waveSpeed={0.15}
          layerSpeed={0.08}
          twist={0.1}
          twistFrequency={5}
          twistSpeed={1.2}
          lineFrequency={5}
          lineSpacing={2}
          lineSharpness={16}
          glowFalloff={10}
          glowIntensity={1.6}
          brightness={2}
          blueBoost={1.25}
          vignette={0.8}
          grain={0.05}
          dpr={1}
          fps={30}
        />
      </div>
      <SkipLink />
      <Topbar />
      <TargetCursor
        targetSelector=".cursor-target"
        spinDuration={2}
        hideDefaultCursor
        hoverDuration={0.2}
        parallaxOn
        cursorColor="#ffffff"
        cursorColorOnTarget="#9b8cff"
      />
      <Pager active={page} />
      <main id="main" className={showIntro ? 'pages is-intro-active' : 'pages'} ref={scrollerRef}>
        <div className={page === 'about' ? 'page-slot is-active' : 'page-slot'}><IntroPage /></div>
        <div className={page === 'work' ? 'page-slot is-active' : 'page-slot'}><WorkPage panel={panel} onOpen={openPanel} onClose={closePanel} /></div>
        <div className={page === 'contact' ? 'page-slot is-active' : 'page-slot'}><ContactPage /></div>
      </main>
    </>
  )
}
