/**
 * Three tests run under the console gate, two of which must fail.
 *
 * Outside the main suite on purpose: two of these are supposed to be red, so
 * `vitest.config.ts` excludes `test/fixtures/` and `test/console-errors.test.ts`
 * runs this file through its own config and reads the result.
 */
import { describe, expect, it } from 'vitest'

import { expectConsoleError } from '../../console-errors.js'

const reactBoundaryCall = (): void => {
  // The shape React 19 logs with: a format string, then the substitutions.
  console.error('%o\n\n%s\n\n%s\n', new Error('kit exploded'), 'in <Boom>', 'recreate')
}

describe('the console gate', () => {
  it('fails a test that logged something nobody declared', () => {
    reactBoundaryCall()
    expect(1).toBe(1)
  })

  it('fails a test whose declaration never came true', () => {
    expectConsoleError(/nothing logs this/)
    expect(1).toBe(1)
  })

  it('passes a test that declared what it logged', () => {
    expectConsoleError(/kit exploded/)
    reactBoundaryCall()
    expect(1).toBe(1)
  })
})
