// tsc does not emit non-TS files, so every stylesheet is copied into dist here.
import { copyFileSync, mkdirSync, readdirSync } from 'node:fs'
import { relative, resolve, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
const slashes = (path) => path.split(sep).join('/')

/**
 * Every stylesheet under a package's `src`, found rather than listed.
 *
 * This was a literal array, and the CI step that proved the build shipped its
 * stylesheets was a second literal array. They disagreed: this one had grown
 * `kit-html.css` and the check still named only `designer.css`, so a build that
 * shipped a kit with no styles would have passed. Exporting the list fixed the
 * disagreement; deriving it fixes the reason there could be one. Add a third
 * stylesheet tomorrow and both the copy and the check pick it up with no edit.
 *
 * Exported so `check-dist.mjs` asserts these arrived.
 */
export const ASSETS = readdirSync(resolve(root, 'packages'), { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .flatMap((pkg) => {
    /*
     * Built from the root, not from the `Dirent`. `parentPath` exists from Node
     * 20.12 and is what this needs, but the directory is already known here --
     * so depending on a field whose name changed once (`path` before it) buys
     * nothing and dates the script.
     */
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

/*
 * Only when this file is the thing that was run, so importing the list above
 * does not copy anything. `pnpm build` still calls it as a script.
 */
const entry = process.argv[1]
if (entry !== undefined && import.meta.url === pathToFileURL(entry).href) {
  for (const [from, to] of ASSETS) {
    mkdirSync(to.slice(0, to.lastIndexOf('/')), { recursive: true })
    copyFileSync(resolve(root, from), resolve(root, to))
    console.log('copied ' + from.slice(from.lastIndexOf('/') + 1))
  }
}
