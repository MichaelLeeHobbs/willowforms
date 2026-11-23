/**
 * `eslint.config.test.ts` writes, lints and removes files with this prefix in
 * package `src` folders, because the rules it proves are scoped by path. Test
 * files run in parallel, so a test that walks those folders must skip them.
 */
export const FIXTURE_PREFIX = '__guardrail_fixture_'

export const isFixture = (name: string): boolean => name.startsWith(FIXTURE_PREFIX)
