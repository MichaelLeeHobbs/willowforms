import { execFile } from 'node:child_process'
import { mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import suite from '../playwright.config.js'
import distSuite from '../playwright.dist.config.js'

const root = fileURLToPath(new URL('..', import.meta.url))

describe.each([
  ['playwright.config.ts', suite.webServer],
  ['playwright.dist.config.ts', distSuite.webServer],
])('%s', (_name, server) => {
  // Playwright starts the tests at whichever comes first, and any process can answer on a port.
  it('waits for its own server and not for an answer on the port', () => {
    expect(server).toMatchObject({ wait: { stdout: expect.any(RegExp) as RegExp } })
    expect(server).not.toHaveProperty('url')
    expect(server).not.toHaveProperty('port')
  })
})

describe('scripts/serve-playground.mjs', () => {
  it('refuses a taken port before it writes a bundle', async () => {
    const holder = createServer()
    await new Promise<void>((resolve) => holder.listen(0, '127.0.0.1', resolve))
    const address = holder.address()
    if (address === null || typeof address === 'string') throw new Error('no port')
    const port = String(address.port)
    const outDir = mkdtempSync(join(tmpdir(), 'willowforms-bundle-'))

    try {
      const stderr = await new Promise<string>((resolve) => {
        execFile(
          process.execPath,
          ['scripts/serve-playground.mjs', '--port', port, '--out-dir', outDir],
          // Ends a server that started after all.
          { cwd: root, timeout: 30_000 },
          (_error, _stdout, text) => resolve(text),
        )
      })

      expect(stderr).toContain(`Port ${port} is already in use`)
      expect(readdirSync(outDir)).toEqual([])
    } finally {
      holder.close()
      rmSync(outDir, { recursive: true, force: true })
    }
  }, 60_000)
})
