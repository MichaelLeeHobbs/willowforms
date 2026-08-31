// tsc does not emit non-TS files, so every stylesheet is copied into dist here.
import { copyFileSync, mkdirSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

/**
 * Exported so `check-dist.mjs` can assert these arrived.
 *
 * One list. The CI step that proved the build shipped its stylesheets named
 * `designer.css` and stopped there, while this file had grown `kit-html.css` --
 * a file that package's own `exports` map publishes, so a broken build would
 * have shipped a kit with no styles and passed. A second list is a second thing
 * to remember, and this is what happens when somebody does not.
 */
export const ASSETS = [
  ['packages/designer/src/designer.css', 'packages/designer/dist/designer.css'],
  ['packages/kit-html/src/kit-html.css', 'packages/kit-html/dist/kit-html.css'],
]

/*
 * Only when this file is the thing that was run, so importing the list above
 * does not copy anything. `pnpm build` still calls it as a script.
 */
const entry = process.argv[1]
if (entry !== undefined && import.meta.url === pathToFileURL(entry).href) {
  for (const [from, to] of ASSETS) {
    mkdirSync(to.slice(0, to.lastIndexOf('/')), { recursive: true })
    copyFileSync(from, to)
    console.log('copied ' + from.slice(from.lastIndexOf('/') + 1))
  }
}
