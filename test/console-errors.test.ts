/**
 * The gate's own proof that it can fail.
 *
 * `test/console-errors.ts` fails a test that wrote to `console.error` without
 * declaring it, and fails a declaration nothing satisfied. Neither direction can
 * be checked from inside the suite it gates -- a test that proves the gate fails
 * would itself be a failing test -- so this spawns vitest on a fixture whose
 * three cases are two reds and a green, and reads the result.
 *
 * Without this, the gate is a guard with no evidence it can ever fire, which is
 * the shape of every silent pass this repository has already found once. The
 * first version of the gate matched `args[0]` rather than `util.format(...args)`
 * and so could never match React's own boundary log: it would have gone in
 * green, allowed everything, and looked like it was working.
 */
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

const repoRoot = fileURLToPath(new URL('..', import.meta.url))

/** Runs the fixture and hands back whatever vitest said, red or green. */
function runFixture(): string {
  try {
    return execFileSync(
      'node',
      [
        'node_modules/vitest/vitest.mjs',
        'run',
        '--config',
        'test/fixtures/console-gate/vitest.config.ts',
      ],
      { cwd: repoRoot, encoding: 'utf8', stdio: 'pipe' },
    )
  } catch (error) {
    // The expected path: two of the three cases fail, so vitest exits non-zero.
    const result = error as { status?: number; stdout?: string; stderr?: string }
    if (result.status === undefined) throw error
    return (result.stdout ?? '') + (result.stderr ?? '')
  }
}

describe('the console gate can fail', () => {
  const output = runFixture()

  it('fails the test that logged what nobody declared', () => {
    expect(output).toContain('console.error was called and no test expected it')
    expect(output).toContain('fails a test that logged something nobody declared')
  })

  it('fails the test whose declaration never came true', () => {
    expect(output).toContain(
      'expectConsoleError(/nothing logs this/) but nothing matching was logged',
    )
  })

  it('leaves the test that declared what it logged alone', () => {
    // Two red and one green. A gate that failed all three would satisfy the two
    // assertions above while making every declaration useless.
    expect(output).toMatch(/2 failed[\s\S]*1 passed/)
  })
})
