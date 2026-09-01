# formsmith — MIT visual form designer for React

An open-source drag-and-drop form designer. The whole point is that the **designer** is MIT, not just the
renderer, because every competitor paywalls exactly that piece.

> Working agreement and personal defaults live in the global `~/.claude/CLAUDE.md`. This file is repo
> facts only.

> **Mid build-out.** Frozen queue, run status and the `/goal` line: `docs/build-out/queue.md`. Run
> contract: `docs/build-out/RUN.md`. Decisions: `docs/decisions.md`. If no goal is active, tell me to
> paste the line at the top of the queue file.

## Read first

- `docs/spec/README.md` — the specification, one file per contract, each section carrying a status.
  It is also the roadmap. Read the relevant contract before changing behaviour it describes.
- `docs/ARCHITECTURE.md` — the kit seam, the document model, why the tree is the source of truth. Read
  before changing anything in `core`.
- `docs/ROADMAP.md` — a pointer at the spec, which carries the status. Check there before assuming a
  feature exists.
- `docs/prior-art/README.md` — what the competitor study found, the gaps it set as targets, and the
  ground rules for using any of it.
- `docs/accessibility.md` — what is checked, how, and what is still missing. Several of those checks
  fail the build, so read it before changing a colour token or a keyboard handler.

## Layout

```
packages/core       document model, tree ops, validation. No React, runs in Node.
packages/renderer   runtime renderer. Ships without the designer.
packages/designer   the builder. No UI-library dependency; chrome is plain CSS.
packages/kit-mui    Material UI kit. Reference implementation of the kit contract.
packages/kit-html   Dependency-free HTML kit. Proves a kit is a package, not a rewrite.
apps/playground     Vite demo, port 5180
apps/demo-server    Hono, port 5181. A demo, not a product.
```

## Invariants

Breaking any of these is a design regression, not a refactor. The first three are enforced rather than
merely documented: 1 and 2 by `no-restricted-imports` blocks in `eslint.config.js`, 3 by
`packages/designer/src/designer.css.test.ts`, which parses the stylesheet and fails on the shape of the
mistake. Each error explains why the rule exists. Read that before silencing one.

1. **`@formsmith/core` imports no React and no component library.** Server-side validation depends on it.
2. **`@formsmith/designer` imports no component library.** It consumes `ComponentDef` metadata only. If
   you find yourself importing MUI into the designer, the abstraction has leaked.
3. **Designer CSS styles the designer's own markup and nothing else.** Every selector must name an
   `fs-` class, and a selector that descends from a scope containing the form (`.fs-shell`,
   `.fs-canvas` and anything under them that is not chrome) must end on one — so `.fs-shell` itself is
   fine and carries the theme tokens, while `.fs-shell input` or `.fs-canvas__frame input` reaches into
   the kit's components on the canvas and breaks them. That has already happened once, to MUI's notched
   outline. Two exceptions are allowlisted in the test, each pinned to the properties it may set.
4. **Tree operations are immutable.** Undo holds references to prior documents.
5. **Only `required` fails on an empty value.** Every other rule passes when the value is empty.
6. **No `eval` default for computed values.** The host injects an evaluator and owns the sandbox.

## Commands

```bash
pnpm dev           # playground on :5180
pnpm test          # vitest, 2338 tests
pnpm lint          # eslint, including the invariant guardrails
pnpm format:check  # prettier
pnpm typecheck     # build configs, then tsconfig.eslint.json for tests and configs
pnpm build         # tsc --build, then copies designer.css
pnpm e2e           # playwright, 78 tests in a real browser
```

CI runs every one of these, then `node scripts/check-dist.mjs`, which reads the packages off
the directory and asserts each emitted `dist/index.js` and `dist/index.d.ts`, and that every stylesheet
`copy-assets.mjs` names arrived. The end-to-end suite runs last, after the build, against the playground on port 5180
with `--strictPort`, so a busy port fails loudly rather than serving from somewhere else. CI's order is
format, lint, typecheck, test, build, end-to-end -- the cheapest gates first, so a formatting slip does
not wait behind a browser download -- and the list above is alphabetical-by-habit rather than an order;
saying "in that order" here was wrong about a workflow anybody can read. Anything
positional belongs there: jsdom has no layout engine, so drop geometry, selection frames, and focus
order cannot be checked anywhere else. `pnpm typecheck` is two passes on purpose: the per-package configs exclude tests so
they stay out of `dist`, which left every test file unchecked until `tsconfig.eslint.json` picked them
up. It found a type error in the first test file it ever saw.

`aliases.ts` at the root maps `@formsmith/*` to `src` for vitest and the playground, so in-repo edits
need no rebuild. Published packages resolve through `dist`. The five bare package entries are anchored
regexes on purpose -- the two stylesheet subpaths are plain strings, because an exact specifier needs no
anchoring -- and the reason is that a
plain string alias also rewrites `@formsmith/designer/styles.css` and breaks the build.

## Conventions

- Node 22.6+ to develop -- the demo server runs on `--experimental-strip-types`, which is where that
  arrived -- and Node 20+ to consume a published package, which is what the five manifests declare.
  pnpm 10, React 19, TypeScript strict with `exactOptionalPropertyTypes` and
  `noUncheckedIndexedAccess`. Both are on deliberately; do not relax them to make a type fit.
- Tests live beside the source as `*.test.ts`, or `*.test.tsx` for component tests. Node is the default
  vitest environment, deliberately, so core keeps proving it runs without a DOM; a component test opts
  into jsdom with an `@vitest-environment jsdom` docblock. jsdom has no layout engine, so anything
  measuring geometry has to be checked in a real browser instead.
  **Read [.claude/skills/write-tests/SKILL.md](.claude/skills/write-tests/SKILL.md) before writing one.**
  It is the list of ways a test here has passed while proving nothing, each one taken from a real
  incident in this repository.
- This is a public MIT repo. No proprietary references, no employer material.
