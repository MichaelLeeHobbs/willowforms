/**
 * A test proving the gate fails would itself fail, so this spawns vitest on a
 * fixture with two failing cases and one passing, and reads the output.
 */
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

const repoRoot = fileURLToPath(new URL('..', import.meta.url))

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
    expect(output).toMatch(/2 failed[\s\S]*1 passed/)
  })
})
