// tsc does not emit non-TS files, so every stylesheet is copied into dist here.
import { copyFileSync, mkdirSync, readdirSync } from 'node:fs'
import { relative, resolve, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
const slashes = (path) => path.split(sep).join('/')

// Found, not listed, and exported so `check-dist.mjs` checks the same files.
export const ASSETS = readdirSync(resolve(root, 'packages'), { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .flatMap((pkg) => {
    const src = resolve(root, 'packages', pkg.name, 'src')
    return readdirSync(src, { recursive: true, withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith('.css'))
      .map((entry) => {
        const from = resolve(entry.parentPath, entry.name)
        return [
          slashes(relative(root, from)),
          'packages/' + pkg.name + '/dist/' + slashes(relative(src, from)),
        ]
      })
  })

// Copy only when run directly, so importing `ASSETS` copies nothing.
const entry = process.argv[1]
if (entry !== undefined && import.meta.url === pathToFileURL(entry).href) {
  for (const [from, to] of ASSETS) {
    mkdirSync(to.slice(0, to.lastIndexOf('/')), { recursive: true })
    copyFileSync(resolve(root, from), resolve(root, to))
    console.log('copied ' + from.slice(from.lastIndexOf('/') + 1))
  }
}
