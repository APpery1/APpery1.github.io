import { useEffect, useRef } from 'react'
import type { CSSProperties } from 'react'
import './ParticleText.css'

type Props = {
  text?: string
  particleSize?: number
  density?: number
  color?: string
  highlightColor?: string
  scatter?: number
  gatherDuration?: number
  stagger?: number
  pointerRepel?: number
  repelRadius?: number
  idleDrift?: number
  trigger?: 'mount' | 'hover' | 'click'
  fontSize?: string | number
  fontWeight?: number
  fontFamily?: string
  glow?: boolean
  className?: string
  style?: CSSProperties
}

type Particle = {
  x: number
  y: number
  startX: number
  startY: number
  targetX: number
  targetY: number
  size: number
  color: string
  seed: number
  depth: number
  delay: number
}

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max)
const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3)

const hexToRgb = (hex: string) => {
  const clean = hex.replace('#', '').trim()
  if (!/^[0-9a-fA-F]{6}$/.test(clean)) return null
  return { r: parseInt(clean.slice(0, 2), 16), g: parseInt(clean.slice(2, 4), 16), b: parseInt(clean.slice(4, 6), 16) }
}

const mixRgb = (from: { r: number; g: number; b: number }, to: { r: number; g: number; b: number }, amount: number) => ({
  r: Math.round(from.r + (to.r - from.r) * amount),
  g: Math.round(from.g + (to.g - from.g) * amount),
  b: Math.round(from.b + (to.b - from.b) * amount),
})

const rgbToCss = (rgb: { r: number; g: number; b: number }) => `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`

const resolveFontSize = (value: string | number, container: HTMLElement, weight: number, family: string) => {
  if (typeof value === 'number') return value
  const probe = document.createElement('span')
  probe.textContent = 'M'
  Object.assign(probe.style, { position: 'absolute', visibility: 'hidden', pointerEvents: 'none', fontSize: value, fontWeight: String(weight), fontFamily: family })
  container.appendChild(probe)
  const size = parseFloat(getComputedStyle(probe).fontSize) || 96
  probe.remove()
  return size
}

const waitForFonts = async (font: string) => {
  if (!('fonts' in document)) return
  try { await document.fonts.load(font) } catch { /* Fall back to the loaded system font. */ }
  await document.fonts.ready
}

export default function ParticleText({
  text = 'React Bits', particleSize = 2, density = 4, color = '#ffffff', highlightColor = '#8b5cf6',
  scatter = 180, gatherDuration = 1600, stagger = 420, pointerRepel = 40, repelRadius = 120,
  idleDrift = 0.7, trigger = 'mount', fontSize = 'clamp(3rem, 12vw, 8rem)', fontWeight = 800,
  fontFamily = 'inherit', glow = true, className = '', style,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const container = containerRef.current
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!container || !canvas || !ctx) return

    let particles: Particle[] = []
    let animationFrame: number | null = null
    let resizeFrame: number | null = null
    let buildId = 0
    let gathering = false
    let gatherStart = 0
    let reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
    let width = 0
    let height = 0
    let dpr = 1
    const pointer = { active: false, x: 0, y: 0, smoothX: 0, smoothY: 0 }

    const startGather = (scatterAgain = true) => {
      if (!particles.length) return
      const spread = reducedMotion ? 0 : scatter
      particles.forEach((particle) => {
        if (scatterAgain && !reducedMotion) {
          const angle = particle.seed * Math.PI * 2
          const distance = scatter * (0.35 + particle.depth * 0.75)
          particle.x = particle.targetX + Math.cos(angle) * distance + (particle.depth - 0.5) * spread * 0.55
          particle.y = particle.targetY + Math.sin(angle) * distance + (particle.seed - 0.5) * spread * 0.55
        }
        particle.startX = particle.x
        particle.startY = particle.y
        particle.delay = reducedMotion ? 0 : particle.seed * stagger
      })
      gatherStart = performance.now()
      gathering = true
    }

    const drawParticle = (particle: Particle) => {
      const size = particle.size
      ctx.fillStyle = particle.color
      if (size <= 2.1) {
        ctx.fillRect(particle.x - size / 2, particle.y - size / 2, size, size)
        return
      }
      ctx.beginPath()
      ctx.arc(particle.x, particle.y, size / 2, 0, Math.PI * 2)
      ctx.fill()
    }

    const render = (now: number) => {
      ctx.clearRect(0, 0, width, height)
      ctx.shadowBlur = glow && !reducedMotion ? particleSize * 3 : 0
      ctx.shadowColor = highlightColor
      pointer.smoothX += (pointer.x - pointer.smoothX) * 0.18
      pointer.smoothY += (pointer.y - pointer.smoothY) * 0.18
      let complete = true

      particles.forEach((particle) => {
        let baseX = particle.targetX
        let baseY = particle.targetY
        let progress = 1
        if (gathering) {
          const local = (now - gatherStart - particle.delay) / Math.max(1, reducedMotion ? 1 : gatherDuration)
          progress = clamp(local, 0, 1)
          const eased = easeOutCubic(progress)
          baseX = particle.startX + (particle.targetX - particle.startX) * eased
          baseY = particle.startY + (particle.targetY - particle.startY) * eased
          if (progress < 1) complete = false
        } else if (!reducedMotion) {
          baseX += Math.sin(now * 0.0009 + particle.seed * 10) * idleDrift * particle.depth
          baseY += Math.cos(now * 0.00075 + particle.depth * 10) * idleDrift * particle.depth
        }
        if (pointer.active && !reducedMotion) {
          const dx = baseX - pointer.smoothX
          const dy = baseY - pointer.smoothY
          const distance = Math.hypot(dx, dy)
          if (distance > 0 && distance < repelRadius) {
            const force = Math.pow(1 - distance / repelRadius, 2) * pointerRepel
            baseX += dx / distance * force
            baseY += dy / distance * force
          }
        }
        particle.x += (baseX - particle.x) * (reducedMotion ? 1 : 0.22)
        particle.y += (baseY - particle.y) * (reducedMotion ? 1 : 0.22)
        ctx.globalAlpha = 0.35 + progress * 0.65
        drawParticle(particle)
      })
      ctx.globalAlpha = 1
      ctx.shadowBlur = 0
      if (gathering && complete) gathering = false
      animationFrame = window.requestAnimationFrame(render)
    }

    const ensureRenderLoop = () => {
      if (animationFrame === null) animationFrame = window.requestAnimationFrame(render)
    }

    const sampleText = async () => {
      const currentBuild = ++buildId
      const rect = container.getBoundingClientRect()
      width = Math.floor(rect.width)
      height = Math.floor(rect.height)
      if (!width || !height) return
      dpr = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = Math.max(1, Math.floor(width * dpr))
      canvas.height = Math.max(1, Math.floor(height * dpr))
      canvas.style.width = '100%'
      canvas.style.height = '100%'
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

      const family = fontFamily === 'inherit' ? getComputedStyle(container).fontFamily : fontFamily
      let size = resolveFontSize(fontSize, container, fontWeight, family)
      let font = `${fontWeight} ${size}px ${family}`
      await waitForFonts(font)
      if (currentBuild !== buildId) return
      const offscreen = document.createElement('canvas')
      const offCtx = offscreen.getContext('2d', { willReadFrequently: true })
      if (!offCtx) return
      offCtx.font = font
      let metrics = offCtx.measureText(text)
      if (metrics.width > width * 0.92) {
        size *= width * 0.92 / metrics.width
        font = `${fontWeight} ${size}px ${family}`
        await waitForFonts(font)
        if (currentBuild !== buildId) return
        offCtx.font = font
        metrics = offCtx.measureText(text)
      }
      const left = Math.ceil(metrics.actualBoundingBoxLeft || 0)
      const right = Math.ceil(metrics.actualBoundingBoxRight || metrics.width)
      const ascent = Math.ceil(metrics.actualBoundingBoxAscent || size * 0.78)
      const descent = Math.ceil(metrics.actualBoundingBoxDescent || size * 0.22)
      const padding = Math.max(12, Math.ceil(size * 0.08))
      offscreen.width = left + right + padding * 2
      offscreen.height = ascent + descent + padding * 2
      offCtx.font = font
      offCtx.textAlign = 'left'
      offCtx.textBaseline = 'alphabetic'
      offCtx.fillStyle = '#fff'
      offCtx.fillText(text, padding - left, padding + ascent)
      const image = offCtx.getImageData(0, 0, offscreen.width, offscreen.height)
      const targets: Array<{ x: number; y: number; alpha: number }> = []
      const step = Math.max(2, Math.floor(density))
      for (let y = 0; y < offscreen.height; y += step) for (let x = 0; x < offscreen.width; x += step) {
        const alpha = image.data[(y * offscreen.width + x) * 4 + 3]
        if (alpha > 40) targets.push({ x: width / 2 - offscreen.width / 2 + x, y: height / 2 - offscreen.height / 2 + y, alpha: alpha / 255 })
      }
      const maxParticles = Math.max(900, Math.min(5200, Math.floor(width * height / 90)))
      const stride = Math.max(1, Math.ceil(targets.length / maxParticles))
      const from = hexToRgb(color)
      const to = hexToRgb(highlightColor)
      particles = targets.filter((_, index) => index % stride === 0).map((target, index) => {
        const seed = ((index * 9301 + 49297) % 233280) / 233280
        const depth = 0.45 + (((index * 233 + 97) % 1000) / 1000) * 0.9
        const blend = clamp(target.x / Math.max(1, width) + (seed - 0.5) * 0.35, 0, 1)
        const angle = seed * Math.PI * 2
        const distance = reducedMotion ? 0 : scatter * (0.35 + depth * 0.75)
        const startX = target.x + Math.cos(angle) * distance + (seed - 0.5) * scatter * 0.45
        const startY = target.y + Math.sin(angle) * distance + (depth - 0.9) * scatter * 0.45
        return { x: reducedMotion ? target.x : startX, y: reducedMotion ? target.y : startY, startX, startY, targetX: target.x, targetY: target.y, size: Math.max(0.6, particleSize * (0.75 + target.alpha * 0.45)), color: from && to ? rgbToCss(mixRgb(from, to, blend)) : color, seed, depth, delay: seed * stagger }
      })
      pointer.x = width / 2
      pointer.y = height / 2
      pointer.smoothX = pointer.x
      pointer.smoothY = pointer.y
      if (reducedMotion) {
        particles.forEach((particle) => {
          particle.x = particle.targetX; particle.y = particle.targetY
          particle.startX = particle.targetX; particle.startY = particle.targetY; particle.delay = 0
        })
        gathering = false
      } else startGather(false)
      ensureRenderLoop()
    }

    const queueResize = () => {
      if (resizeFrame !== null) window.cancelAnimationFrame(resizeFrame)
      resizeFrame = window.requestAnimationFrame(() => { void sampleText() })
    }
    const move = (event: PointerEvent) => { const rect = canvas.getBoundingClientRect(); pointer.x = event.clientX - rect.left; pointer.y = event.clientY - rect.top; pointer.active = true }
    const leave = () => { pointer.active = false }
    const enter = (event: PointerEvent) => { move(event); if (trigger === 'hover') startGather(true) }
    const click = () => { if (trigger === 'click') startGather(true) }
    const reduceMotionQuery = window.matchMedia?.('(prefers-reduced-motion: reduce)')
    const handleReduceMotionChange = (event: MediaQueryListEvent) => { reducedMotion = event.matches; void sampleText() }
    reduceMotionQuery?.addEventListener('change', handleReduceMotionChange)
    const resizeObserver = new ResizeObserver(queueResize)
    resizeObserver.observe(container)
    canvas.addEventListener('pointermove', move)
    canvas.addEventListener('pointerleave', leave)
    canvas.addEventListener('pointerenter', enter)
    canvas.addEventListener('click', click)
    void sampleText()
    return () => {
      buildId += 1
      resizeObserver.disconnect()
      reduceMotionQuery?.removeEventListener('change', handleReduceMotionChange)
      canvas.removeEventListener('pointermove', move); canvas.removeEventListener('pointerleave', leave); canvas.removeEventListener('pointerenter', enter); canvas.removeEventListener('click', click)
      if (animationFrame !== null) window.cancelAnimationFrame(animationFrame)
      if (resizeFrame !== null) window.cancelAnimationFrame(resizeFrame)
    }
  }, [text, particleSize, density, color, highlightColor, scatter, gatherDuration, stagger, pointerRepel, repelRadius, idleDrift, trigger, fontSize, fontWeight, fontFamily, glow])

  return <div ref={containerRef} className={`particle-text ${className}`.trim()} style={style} aria-label={text}><canvas ref={canvasRef} className="particle-text__canvas" aria-hidden="true" /><span className="particle-text__sr">{text}</span></div>
}
