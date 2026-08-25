// tsc does not emit non-TS files, so every stylesheet is copied into dist here.
import { copyFileSync, mkdirSync } from 'node:fs'

const assets = [
  ['packages/designer/src/designer.css', 'packages/designer/dist/designer.css'],
  ['packages/kit-html/src/kit-html.css', 'packages/kit-html/dist/kit-html.css'],
]

for (const [from, to] of assets) {
  mkdirSync(to.slice(0, to.lastIndexOf('/')), { recursive: true })
  copyFileSync(from, to)
  console.log('copied ' + from.slice(from.lastIndexOf('/') + 1))
}
