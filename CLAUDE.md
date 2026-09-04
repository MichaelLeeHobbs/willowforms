# Formsmith — MIT visual form designer for React

Formsmith is an open-source drag-and-drop form designer. The designer and renderer are both MIT.

## Read first

- `docs/spec/README.md` is the product contract and roadmap. Read the relevant contract before changing behaviour.
- `docs/ARCHITECTURE.md` defines package boundaries and the document model.
- `docs/accessibility.md` defines accessibility requirements and verification.
- `SECURITY.md` and `docs/THREAT_MODEL.md` define security reporting and trust boundaries.
- `docs/decisions.md` records the small set of current architectural decisions.

## Layout

```
packages/core       document model, tree operations, validation; no React
packages/renderer   runtime renderer
packages/designer   visual builder; no UI-library dependency
packages/kit-mui    Material UI reference kit
packages/kit-html   dependency-free HTML kit
apps/playground     Vite demonstration app, port 5180
apps/demo-server    demonstration server, port 5181
```

## Invariants

1. `@formsmith/core` imports no React or component library.
2. `@formsmith/designer` imports no component library.
3. Designer CSS styles only designer markup and never reaches into kit components.
4. Tree operations are immutable and preserve structural sharing.
5. Only the `required` rule fails on an empty value.
6. Core provides no default evaluator for author-controlled code.
7. The specification is not weakened to fit an implementation. Ambiguity is resolved in the specification first.
8. Imported documents cross one validation and normalization boundary before normal runtime use.

The first three invariants have automated lint or CSS guards. Security controls and trust assumptions are
documented in `docs/THREAT_MODEL.md`.

## Commands

```bash
pnpm dev
pnpm test
pnpm lint
pnpm format:check
pnpm typecheck
pnpm build
pnpm e2e
node scripts/check-dist.mjs
```

CI runs formatting, linting, typechecking, unit and integration tests, package builds, browser tests, and
published-artifact checks. Positional browser behaviour belongs in Playwright because jsdom has no layout
engine. `pnpm typecheck` checks package output separately from tests and repository configuration.

`aliases.ts` maps workspace package imports to source during development. Published packages resolve
through package exports and are verified independently.

## Conventions

- Develop on Node 22 and pnpm 10. Published package engine requirements live in each package manifest.
- TypeScript uses `strict`, `exactOptionalPropertyTypes`, and `noUncheckedIndexedAccess`.
- Unit tests live beside source. Cross-package contract tests live in `test/`; browser tests live in
  `e2e/`.
- Read `.claude/skills/write-tests/SKILL.md` before writing or changing tests.
- Prefer focused changes with one product outcome. Update implementation, specification status, tests, and
  public examples together.
- Comments explain a current contract, invariant, or non-obvious constraint. Review history, prior
  failures, and security payloads belong in Git history, tests, or the threat model.
- This is a public MIT repository. Do not include proprietary material, credentials, or private customer
  data.
