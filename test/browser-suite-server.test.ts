import { execFile, spawn } from 'node:child_process'
import { once } from 'node:events'
import { mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { createServer } from 'node:net'
import type { Server } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import type { PlaywrightTestConfig } from '@playwright/test'
import { describe, expect, it, onTestFinished } from 'vitest'

import suite from '../playwright.config.js'
import distSuite from '../playwright.dist.config.js'

const root = fileURLToPath(new URL('..', import.meta.url))
const SCRIPT = 'scripts/serve-playground.mjs'
const READY = /Bundle ready/
// Ends a server that no test stopped.
const LIMIT = 30_000

type WebServer = Exclude<NonNullable<PlaywrightTestConfig['webServer']>, unknown[]>

function serverOf({ webServer }: PlaywrightTestConfig): WebServer {
  if (webServer === undefined || Array.isArray(webServer)) throw new Error('not one web server')
  return webServer
}

describe.each([
  ['playwright.config.ts', suite],
  ['playwright.dist.config.ts', distSuite],
])('%s', (_name, config) => {
  const server = serverOf(config)

  // Playwright starts the tests at whichever comes first, and any process can answer on a port.
  it('waits for its own server and not for an answer on the port', () => {
    expect(server.command.split(' --')[0]).toBe('node ' + SCRIPT)
    expect(server.wait).toEqual({ stdout: READY })
    expect(server).not.toHaveProperty('url')
    expect(server).not.toHaveProperty('port')
  })

  it('opens the address and the port its server takes', () => {
    const port = /--port (\d+)/.exec(server.command)?.[1]

    expect(config.use?.baseURL).toBe('http://127.0.0.1:' + String(port))
  })
})

describe('scripts/serve-playground.mjs', () => {
  function emptyFolder(): string {
    const folder = mkdtempSync(join(tmpdir(), 'willowforms-bundle-'))
    onTestFinished(() => rmSync(folder, { recursive: true, force: true }))
    return folder
  }

  async function holdPort(): Promise<[Server, string]> {
    const holder = createServer().listen(0, '127.0.0.1')
    await once(holder, 'listening')
    const address = holder.address()
    if (address === null || typeof address === 'string') throw new Error('no port')
    return [holder, String(address.port)]
  }

  it(
    'refuses a taken port before it writes a bundle',
    async () => {
      const outDir = emptyFolder()
      const [holder, port] = await holdPort()

      const run = await new Promise((resolve) => {
        execFile(
          process.execPath,
          [SCRIPT, '--port', port, '--out-dir', outDir],
          { cwd: root, timeout: LIMIT },
          (error, _stdout, stderr) => resolve({ killed: error?.killed, stderr }),
        )
      })
      holder.close()

      expect(run).toEqual({
        killed: false,
        stderr: expect.stringContaining(`Port ${port} is already in use`) as string,
      })
      expect(readdirSync(outDir)).toEqual([])
    },
    2 * LIMIT,
  )

  it(
    'is ready once it serves the bundle at the address the tests open',
    async () => {
      const outDir = emptyFolder()
      const [holder, port] = await holdPort()
      holder.close()
      await once(holder, 'close')

      const child = spawn(
        process.execPath,
        [SCRIPT, '--port', port, '--out-dir', outDir, '--no-minify'],
        { cwd: root, timeout: LIMIT },
      )
      const exited = once(child, 'exit')
      try {
        const written = await new Promise<string[]>((resolve, reject) => {
          let output = ''
          child.stdout.on('data', (data: Buffer) => {
            output += data.toString()
            if (READY.test(output)) resolve(readdirSync(outDir))
          })
          child.stderr.on('data', (data: Buffer) => (output += data.toString()))
          child.on('exit', () => reject(new Error('It ended before it was ready:\n' + output)))
        })
        expect(written).toContain('index.html')

        const page = await fetch('http://127.0.0.1:' + port)
        expect(await page.text()).toContain('/assets/index-')
      } finally {
        child.kill()
        await exited
      }
    },
    2 * LIMIT,
  )
})
