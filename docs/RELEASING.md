# Release procedure

No package is published from an unreviewed workstation state. A release candidate is cut only from a
clean commit whose specification status matches the implementation.

## Checklist

1. Confirm the branch contains only intended changes and update user-facing release notes.
2. Run `pnpm install --frozen-lockfile` on Node 24, the version CI runs.
3. Run `pnpm audit --audit-level high`, `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, and
   `pnpm test`.
4. Run `pnpm build` and `node scripts/check-dist.mjs`.
5. Run `pnpm e2e` and `pnpm e2e:dist`. The second command builds the playground through package export
   maps and opens the production bundle in Chromium.
6. Inspect every `npm pack --dry-run --json` result produced by the distribution check when package
   contents changed.
7. Verify package versions, peer ranges, changelog entries, and document migrations as one change.
8. Tag the reviewed commit, publish with provenance from CI, then install the published packages into a
   fresh consumer before promoting the release.

## Local browser ports

For concurrent local development, set `WILLOWFORMS_E2E_PORT` or `WILLOWFORMS_E2E_DIST_PORT` to an unused port before running the respective browser suite. Both suites still start their own server, and fail when another server already answers on its port. Each keeps its results in its own folder under `test-results/`, named for its port.

## Stop conditions

Do not publish with a failing or skipped gate, an unexplained audit finding, a `Partial` contract being
advertised as complete, an untested migration, or a code-action evaluator bundled into WillowForms.

Rollback means deprecating or replacing a bad package version; npm packages are immutable and must not
be silently republished under the same version.
