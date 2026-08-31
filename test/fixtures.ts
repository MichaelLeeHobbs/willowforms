/**
 * The one name a test may write into a package's `src`, shared by the test that
 * writes it and the tests that have to ignore it.
 *
 * `eslint.config.test.ts` writes a file into `packages/core/src` and
 * `packages/designer/src` for each guardrail case, lints it, and removes it in
 * a `finally`. It has to be a real file in a real package, because the rules
 * being proven are scoped by path.
 *
 * Vitest runs test files in parallel, so any test that enumerates those
 * directories can see one of these files and then find it gone a moment later.
 * `docs.test.ts` walks every package `src` and reads each file it finds; it hit
 * exactly that, and the failure would have been nine unrelated cases going red
 * on a run where nothing changed.
 *
 * Two files agreeing about a string by copying it is the mistake this repository
 * keeps finding in its own guards, so the string lives here and both import it.
 */
export const FIXTURE_PREFIX = '__guardrail_fixture_'

/** Whether a file name is one of those temporary fixtures. */
export const isFixture = (name: string): boolean => name.startsWith(FIXTURE_PREFIX)
