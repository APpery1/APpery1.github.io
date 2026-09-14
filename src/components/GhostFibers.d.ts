import type { ComponentType } from 'react'

export type GhostFibersProps = {
  lineColor?: string
  glowColor?: string
  speed?: number
  scale?: number
  rotation?: number
  rotationSpeed?: number
  layers?: number
  waveAmplitude?: number
  waveFrequency?: number
  waveSpeed?: number
  layerSpeed?: number
  twist?: number
  twistFrequency?: number
  twistSpeed?: number
  lineFrequency?: number
  lineSpacing?: number
  lineSharpness?: number
  glowFalloff?: number
  glowIntensity?: number
  brightness?: number
  blueBoost?: number
  vignette?: number
  grain?: number
  lightMode?: boolean
  dpr?: number
  fps?: number
  paused?: boolean
  className?: string
}

declare const GhostFibers: ComponentType<GhostFibersProps>
export default GhostFibers
