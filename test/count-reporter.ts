/**
 * The documented suite size, checked against the suite.
 *
 * `docs.test.ts` compares the totals quoted in README.md, CLAUDE.md and the
 * roadmap with each other, and that is all it ever did: three documents can
 * agree perfectly on a number that has been wrong for months, which is the drift
 * the check was written for. Nothing inside a test can count the run it is part
 * of, because the count is not known until every file has finished.
 *
 * A reporter is told. This one runs at the end and fails the process when the
 * number the documents quote is not the number that ran.
 *
 * Only when the whole suite ran. A filtered run (`vitest run packages/core`)
 * collects a handful of files, and failing it for disagreeing with a figure
 * about the whole repository would make the fast loop unusable. So the check is
 * skipped unless the run collected every test file on disk, and says so.
 */

import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { Reporter } from 'vitest/reporters'

const root = new URL('../', import.meta.url)

const read = (path: string): string => readFileSync(fileURLToPath(new URL(path, root)), 'utf8')

/** The documents that state the size of the unit suite. */
const DOCS = ['README.md', 'CLAUDE.md', 'docs/ROADMAP.md']

/**
 * The same pattern `docs.test.ts` reads totals with, and it has to stay the
 * same: a figure one of them matches and the other does not is a figure that is
 * checked by neither.
 */
function totals(text: string): number[] {
  const counts: number[] = []
  for (const match of text.matchAll(
    /(?:vitest, |pnpm test\s+#[^\n]*?|\b)(\d{2,4}) (?:unit |end-to-end )?tests\b/g,
  )) {
    const value = Number(match[1])
    if (value >= 100) counts.push(value)
  }
  return counts
}

/** Every test file vitest would collect, counted without collecting it. */
function testFilesOnDisk(): number {
  let found = 0

  const walk = (dir: string): void => {
    for (const entry of readdirSync(fileURLToPath(new URL(dir, root)), { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name === 'dist') continue
      const path = dir + entry.name
      if (entry.isDirectory()) {
        walk(path + '/')
        continue
      }
      if (/\.test\.tsx?$/.test(entry.name)) found += 1
    }
  }

  for (const entry of readdirSync(fileURLToPath(new URL('packages', root)), {
    withFileTypes: true,
  })) {
    if (entry.isDirectory()) walk('packages/' + entry.name + '/src/')
  }
  for (const entry of readdirSync(fileURLToPath(new URL('apps', root)), { withFileTypes: true })) {
    if (entry.isDirectory()) walk('apps/' + entry.name + '/src/')
  }
  walk('test/')
  return found
}

interface CountedTask {
  type?: string
  mode?: string
  result?: { state?: string }
  tasks?: CountedTask[]
}

/** Every test that reported a result, however deeply nested in describes. */
function countTests(tasks: CountedTask[] | undefined): number {
  let total = 0
  for (const task of tasks ?? []) {
    if (task.type === 'test' || task.type === 'custom') {
      // A skipped test is not a test that ran, and the documents are quoting
      // what runs. Nothing in this repository is skipped, which is deliberate.
      if (task.mode !== 'skip' && task.mode !== 'todo') total += 1
      continue
    }
    total += countTests(task.tasks)
  }
  return total
}

export default class DocumentedCountReporter implements Reporter {
  onFinished(files: CountedTask[] = []): void {
    const ran = countTests(files)
    if (ran === 0) return

    const collected = files.length
    const onDisk = testFilesOnDisk()
    if (collected !== onDisk) {
      console.warn(
        '[docs] suite-size check skipped: ' +
          String(collected) +
          ' of ' +
          String(onDisk) +
          ' test files ran, so this was a filtered run.',
      )
      return
    }

    const quoted = DOCS.map((path) => ({ path, counts: totals(read(path)) }))
    const wrong = quoted.filter((entry) => entry.counts.some((count) => count !== ran))
    const silent = quoted.filter((entry) => entry.counts.length === 0)

    if (wrong.length === 0 && silent.length === 0) return

    console.error(
      '\n[docs] the documented suite size is wrong. ' +
        String(ran) +
        ' tests ran.\n' +
        quoted
          .map(
            (entry) =>
              '  ' +
              entry.path +
              ': ' +
              (entry.counts.length === 0 ? 'quotes no total' : entry.counts.join(', ')),
          )
          .join('\n') +
        '\n',
    )
    process.exitCode = 1
  }
}
