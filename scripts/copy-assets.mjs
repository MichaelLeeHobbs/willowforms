// tsc does not emit non-TS files; the designer ships one stylesheet.
import { copyFileSync, mkdirSync } from 'node:fs'

mkdirSync('packages/designer/dist', { recursive: true })
copyFileSync('packages/designer/src/designer.css', 'packages/designer/dist/designer.css')
console.log('copied designer.css')
