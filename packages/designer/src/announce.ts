import { useCallback, useLayoutEffect, useRef, useState } from 'react'

const ZERO_WIDTH_SPACE = String.fromCharCode(0x200b)

/**
 * The text of a live region and a stable function that sets it. An unchanged
 * region is never read out, so a message already on screen is sent again with a
 * zero-width space. Compared with what is on screen, not with the last message
 * sent: clearing the region and refilling it in one event changes nothing there.
 */
export function useAnnouncement(): [string, (message: string) => void] {
  const [text, setText] = useState('')
  const shown = useRef('')

  useLayoutEffect(() => {
    shown.current = text
  }, [text])

  const announce = useCallback((message: string) => {
    setText(message !== '' && message === shown.current ? message + ZERO_WIDTH_SPACE : message)
  }, [])

  return [text, announce]
}
