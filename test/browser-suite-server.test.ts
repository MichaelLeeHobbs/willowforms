import { execFile, spawn } from 'node:child_process'
import { once } from 'node:events'
import { mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { createServer } from 'node:net'
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
// Ends a server that no test stopped. As long as both configs give it to start.
const LIMIT = 120_000

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

describe('scripts/serve-playground.mjs', { timeout: 2 * LIMIT }, () => {
  function emptyFolder(): string {
    const folder = mkdtempSync(join(tmpdir(), 'willowforms-bundle-'))
    onTestFinished(() => rmSync(folder, { recursive: true, force: true }))
    return folder
  }

  it('refuses a taken port before it writes a bundle', async () => {
    const outDir = emptyFolder()
    const holder = createServer().listen(0, '127.0.0.1')
    await once(holder, 'listening')
    const address = holder.address()
    if (address === null || typeof address === 'string') throw new Error('no port')
    const port = String(address.port)

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
  })

  it('is ready once it serves the bundle at the address the tests open', async () => {
    const outDir = emptyFolder()
    const child = spawn(
      process.execPath,
      [SCRIPT, '--port', '0', '--out-dir', outDir, '--no-minify'],
      { cwd: root, timeout: LIMIT },
    )
    const exited = once(child, 'exit')
    try {
      const atReady = await new Promise<{ files: string[]; port: string }>((resolve, reject) => {
        let output = ''
        child.stdout.on('data', (data: Buffer) => {
          output += data.toString()
          const port = /on port (\d+)\n/.exec(output)?.[1]
          if (port !== undefined && READY.test(output)) {
            resolve({ files: readdirSync(outDir), port })
          }
        })
        child.stderr.on('data', (data: Buffer) => (output += data.toString()))
        child.on('exit', (code, signal) => {
          reject(new Error(`Not ready, and ended with ${String(signal ?? code)}:\n${output}`))
        })
      })
      expect(atReady.files).toContain('index.html')

      const page = await fetch('http://127.0.0.1:' + atReady.port)
      expect(await page.text()).toContain('/assets/index-')
    } finally {
      child.kill()
      await exited
    }
  })
})
