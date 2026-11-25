import { spawn } from 'node:child_process'
import { once } from 'node:events'
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
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
  const PACKAGES_BUILT = 'the packages are built'

  /** The script in a project of its own, small enough to build at once. */
  function project(main = "console.log('main')"): string {
    // Under `node_modules`, where the script finds Vite and no other tool looks.
    const folder = mkdtempSync(join(root, 'node_modules/.suite-server-'))
    onTestFinished(() => rmSync(folder, { recursive: true, force: true }))
    const write = (path: string, text: string): void => {
      mkdirSync(dirname(join(folder, path)), { recursive: true })
      writeFileSync(join(folder, path), text)
    }

    cpSync(join(root, SCRIPT), join(folder, SCRIPT))
    write('package.json', JSON.stringify({ type: 'module', scripts: { build: 'node build.mjs' } }))
    write(
      'build.mjs',
      "import { writeFileSync } from 'node:fs'\n" +
        "writeFileSync('apps/playground/packages.js', 'document.title')\n" +
        `console.log('${PACKAGES_BUILT}')\n`,
    )
    write(
      'apps/playground/index.html',
      '<title>The bundle, %MODE%</title><script type="module" src="/main.js"></script>',
    )
    write('apps/playground/main.js', main)
    return folder
  }

  interface Run {
    /** Where it serves the bundle, once it has said so. */
    url?: string
    /** How it ended, when it ended first. */
    ended?: unknown
    /** What was in the bundle's folder at that moment. */
    bundle: string[]
    stderr: () => string
  }

  function run(folder: string, ...args: string[]): Promise<Run> {
    const child = spawn(process.execPath, [join(folder, SCRIPT), '--out-dir', 'out', ...args], {
      // Outside every project, so nothing it runs can find one by accident.
      cwd: tmpdir(),
      timeout: LIMIT,
    })
    const closed = once(child, 'close')
    onTestFinished(async () => {
      child.kill()
      await closed
    })
    const outDir = join(folder, 'apps/playground/out')
    const bundle = (): string[] => (existsSync(outDir) ? readdirSync(outDir) : [])

    return new Promise((resolve) => {
      let stdout = ''
      let stderr = ''
      child.stderr.on('data', (data: Buffer) => (stderr += data.toString()))
      child.stdout.on('data', (data: Buffer) => {
        stdout += data.toString()
        const url = /on (http:\S+)\n/.exec(stdout)?.[1]
        if (url !== undefined && READY.test(stdout))
          resolve({ url, bundle: bundle(), stderr: () => stderr })
      })
      // `close` and not `exit`, so nothing it printed is missing.
      child.on('close', (code, signal) =>
        resolve({ ended: signal ?? code, bundle: bundle(), stderr: () => stderr }),
      )
    })
  }

  /** The page at `url`, which has to be the bundle's and not the source's. */
  async function page(url = ''): Promise<string> {
    const text = await (await fetch(url)).text()
    expect(text).toContain('/assets/')
    return text
  }

  it('refuses a taken port before it builds anything', async () => {
    const holder = createServer().listen(0, '127.0.0.1')
    onTestFinished(() => void holder.close())
    await once(holder, 'listening')
    const address = holder.address()
    if (address === null || typeof address === 'string') throw new Error('no port')
    const port = String(address.port)

    const { ended, bundle, stderr } = await run(project(), '--port', port, '--mode', 'dist')

    expect(ended).toBe(1)
    expect(stderr()).toContain(`Port ${port} is already in use`)
    expect(stderr()).not.toContain(PACKAGES_BUILT)
    expect(bundle).toEqual([])
  })

  it('is ready once it serves the bundle at the address the tests open', async () => {
    const address = (url = ''): string => url.slice(0, url.lastIndexOf(':'))

    const { url, ended, bundle, stderr } = await run(project(), '--port', '0', '--no-minify')

    expect(ended, stderr()).toBeUndefined()
    expect(address(url)).toBe(address(suite.use?.baseURL))
    expect(bundle).toContain('index.html')
    expect(await page(url)).toContain('The bundle, production')
    // Only the dist mode needs them.
    expect(stderr()).not.toContain(PACKAGES_BUILT)
  })

  it('builds the packages before the bundle in the dist mode, and shows what that prints', async () => {
    const importsThem = project("import './packages.js'")

    const { url, ended, bundle, stderr } = await run(importsThem, '--port', '0', '--mode', 'dist')

    expect(ended, stderr()).toBeUndefined()
    expect(bundle).toContain('index.html')
    expect(await page(url)).toContain('The bundle, dist')
    // Polled, because stderr and stdout are separate pipes.
    await expect.poll(stderr).toContain(PACKAGES_BUILT)
  })

  it.each([
    ['an empty port', ['--port', '']],
    ['a port that is not a number', ['--port', 'any']],
    ['no port', []],
  ])('refuses %s', async (_name, args) => {
    const { ended, stderr } = await run(project(), ...args)

    expect(ended).toBe(1)
    expect(stderr()).toContain('Usage: serve-playground.mjs')
  })
})
