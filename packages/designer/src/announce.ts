import { useCallback, useState } from 'react'

const ZERO_WIDTH_SPACE = String.fromCharCode(0x200b)

/**
 * The text of a live region and a stable function that sets it. An unchanged
 * region is never read out, so a message sent twice running differs the second
 * time by a zero-width space.
 */
export function useAnnouncement(): [string, (message: string) => void] {
  const [text, setText] = useState('')
  const announce = useCallback((message: string) => {
    setText((previous) =>
      message !== '' && message === previous ? message + ZERO_WIDTH_SPACE : message,
    )
  }, [])
  return [text, announce]
}
