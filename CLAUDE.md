# formsmith — MIT visual form designer for React

An open-source drag-and-drop form designer. The whole point is that the **designer** is MIT, not just the
renderer, because every competitor paywalls exactly that piece.

> Working agreement and personal defaults live in the global `~/.claude/CLAUDE.md`. This file is repo
> facts only.

## Read first

- `docs/ARCHITECTURE.md` — the kit seam, the document model, why the tree is the source of truth. Read
  before changing anything in `core`.
- `docs/ROADMAP.md` — honest status. Most of the designer is not built. Check here before assuming a
  feature exists.
- `docs/prior-art/README.md` — the FormEngine teardown and the rules for using it.

## Layout

```
packages/core       document model, tree ops, validation. No React, runs in Node.
packages/renderer   runtime renderer. Ships without the designer.
packages/designer   the builder. No UI-library dependency; chrome is plain CSS.
packages/kit-mui    Material UI kit. Reference implementation of the kit contract.
apps/playground     Vite demo, port 5180
apps/demo-server    Hono, port 5181. A demo, not a product.
```

## Invariants

Breaking any of these is a design regression, not a refactor.

1. **`@formsmith/core` imports no React and no component library.** Server-side validation depends on it.
2. **`@formsmith/designer` imports no component library.** It consumes `ComponentDef` metadata only. If
   you find yourself importing MUI into the designer, the abstraction has leaked.
3. **Designer CSS is scoped to `.fs-toolbar`, `.fs-panel`, `.fs-canvas__bar` — never `.fs-shell`.** A
   bare `.fs-shell input` rule reaches into the kit's components on the canvas and breaks them. This has
   already happened once.
4. **Tree operations are immutable.** Undo holds references to prior documents.
5. **Only `required` fails on an empty value.** Every other rule passes when the value is empty.
6. **No `eval` default for computed values.** The host injects an evaluator and owns the sandbox.

## Commands

```bash
pnpm dev        # playground on :5180
pnpm test       # vitest, 52 tests
pnpm build      # tsc --build, then copies designer.css
pnpm typecheck  # tsc --build --force
```

`aliases.ts` at the root maps `@formsmith/*` to `src` for vitest and the playground, so in-repo edits
need no rebuild. Published packages resolve through `dist`. Entries are anchored regexes on purpose: a
plain string alias also rewrites `@formsmith/designer/styles.css` and breaks the build.

## Conventions

- Node 22+, pnpm 10, React 19, TypeScript strict with `exactOptionalPropertyTypes` and
  `noUncheckedIndexedAccess`. Both are on deliberately; do not relax them to make a type fit.
- Tests live beside the source as `*.test.ts`. Everything currently tested is a pure function; there is
  no component-test setup yet.
- This is a public MIT repo. No proprietary references, no employer material.
