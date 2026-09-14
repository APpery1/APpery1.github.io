import type { ComponentType, CSSProperties } from 'react'

export type DriftWallItem = {
  image: string
  title?: string
  href?: string
}

type DriftWallProps = {
  items?: DriftWallItem[]
  columns?: number
  tileWidth?: number
  tileHeight?: number
  gap?: number
  radius?: number
  tilt?: number
  turn?: number
  roll?: number
  perspective?: number
  depth?: number
  speed?: number
  direction?: 'up' | 'down'
  variance?: number
  parallax?: number
  pauseOnHover?: boolean
  lift?: number
  fade?: number
  dim?: number
  grayscale?: boolean
  overlayColor?: string
  className?: string
  style?: CSSProperties
  onItemClick?: (item: DriftWallItem) => void
}

declare const DriftWall: ComponentType<DriftWallProps>
export default DriftWall
