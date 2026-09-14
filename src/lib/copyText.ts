function selectNodeText(node: HTMLElement): boolean {
  const selection = window.getSelection()
  if (!selection) {
    return false
  }
  try {
    const range = document.createRange()
    range.selectNodeContents(node)
    selection.removeAllRanges()
    selection.addRange(range)
    return true
  } catch {
    return false
  }
}

export async function copyText(text: string, fallbackNode?: HTMLElement | null): Promise<boolean> {
  if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch {
      /* fall through */
    }
  }

  if (fallbackNode && selectNodeText(fallbackNode) && document.execCommand('copy')) {
    return true
  }

  return false
}
