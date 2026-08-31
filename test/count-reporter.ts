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

import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Reporter } from 'vitest/reporters'

const root = new URL('../', import.meta.url)

const read = (path: string): string => readFileSync(fileURLToPath(new URL(path, root)), 'utf8')

/**
 * The documents that state the size of the unit suite.
 *
 * Exported, and `docs.test.ts` imports it rather than keeping its own. It kept
 * its own: a five-entry list against this three-entry one, and two of its five
 * quoted no total at all, which its check had no way to notice. Two lists of
 * documents that state one number is the shape every CRITICAL in this review
 * turned out to have.
 */
export const DOCS = ['README.md', 'CLAUDE.md', 'docs/ROADMAP.md']

/**
 * Every "N tests" figure a document quotes as the size of the whole suite.
 *
 * Exported for the same reason as `DOCS`. The comment here used to say this
 * pattern "has to stay the same" as the one in `docs.test.ts`, which is a note
 * asking somebody to remember something rather than a mechanism. There is one
 * pattern now.
 *
 * `\d+` rather than `\d{2,4}`. The bounded form stopped matching at 9 999, and
 * what it did then was not fail -- it matched nothing, so the document quoting
 * a five-digit figure counted as quoting none, and the guard went quiet exactly
 * when the suite got big enough for a stale number to be hard to spot by eye.
 * The `>= 100` filter below is what excludes the end-to-end figure, and it is
 * the filter doing that job rather than the digit count.
 */
export function totals(text: string): number[] {
  const counts: number[] = []
  for (const match of text.matchAll(
    /(?:vitest, |pnpm test\s+#[^\n]*?|\b)(\d+) (?:unit |end-to-end )?tests\b/g,
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

/**
 * Where the reporter records that it ran at all.
 *
 * A reporter that stops being called does not fail; it goes quiet, and a quiet
 * guard reads exactly like a passing one. That is not hypothetical here: the
 * finish hook was named `onFinished`, which is the vitest 2 API, and a version
 * bump that renames it would leave this file loaded, constructed, and never
 * asked anything -- with the suite green and the documented counts free to rot.
 *
 * `globalThis` cannot carry the answer, because a reporter runs in the main
 * process and tests run in workers. A file can. `docs.test.ts` reads it, checks
 * it is from this run, and deletes it, so a stale marker cannot pass for a live
 * one.
 */
export const REPORTER_MARK = join(tmpdir(), 'formsmith-count-reporter.json')

export default class DocumentedCountReporter implements Reporter {
  /** Set once the report has been written, so two hook names cannot both run it. */
  private reported = false

  onInit(): void {
    this.reported = false
    try {
      /*
       * The pid, not a timestamp. A timestamp only says the reporter ran
       * recently, and "recently" cannot tell this run from the one a few seconds
       * before it -- which was measured: a marker left by a previous filtered run
       * let a deliberately disabled reporter pass. A worker is either this
       * process (the threads pool) or its child (forks), so the pid identifies
       * the run exactly in both.
       */
      writeFileSync(REPORTER_MARK, JSON.stringify({ pid: process.pid }), 'utf8')
    } catch {
      // A temp directory this process cannot write to is not a reason to fail a
      // test run. `docs.test.ts` reports the missing marker instead.
    }
  }

  /** vitest 2. */
  onFinished(files: CountedTask[] = []): void {
    this.report(files)
  }

  /**
   * vitest 3, which renamed it.
   *
   * Both, deliberately. A reporter implementing only the name the installed
   * vitest happens to call is a guard with a version number attached, and the
   * failure on the day that changes is silence.
   */
  onTestRunEnd(files: CountedTask[] = []): void {
    this.report(files)
  }

  private report(files: CountedTask[]): void {
    if (this.reported) return
    this.reported = true

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

    /*
     * Counted after the filtered-run check, not before it.
     *
     * `if (ran === 0) return` came first and made the reporter inert on the one
     * run that most needs reporting: every file on disk collected, and nothing
     * inside them executed. That is a broken suite reading as a passing one.
     */
    const ran = countTests(files)
    if (ran === 0) {
      console.error(
        '\n[docs] every test file on disk was collected and no test ran. ' +
          'A suite that asserts nothing cannot be green.\n',
      )
      process.exitCode = 1
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
