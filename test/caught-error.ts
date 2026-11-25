import { version } from 'react'

import { expectConsoleError } from './console-errors.js'

/**
 * Declares the log React writes for an error a boundary caught. React 19 puts the error and the
 * component in one entry; React 18's entry names only the component.
 */
export function expectCaughtError(component: string, message: RegExp): void {
  const where = `The above error occurred in the <${component}> component`
  expectConsoleError(
    version.startsWith('18.')
      ? new RegExp(`^${where}:`)
      : new RegExp(`(?:${message.source})[\\s\\S]*${where}\\.`, message.flags),
  )
}
