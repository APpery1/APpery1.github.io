import type { ComponentType, ReactNode } from 'react'

type ClickSparkProps = {
  sparkColor?: string
  sparkSize?: number
  sparkRadius?: number
  sparkCount?: number
  duration?: number
  easing?: string
  extraScale?: number
  children?: ReactNode
}

declare const ClickSpark: ComponentType<ClickSparkProps>
export default ClickSpark
