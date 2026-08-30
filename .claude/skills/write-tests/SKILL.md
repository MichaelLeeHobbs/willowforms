---
name: write-tests
description: Write or fix a test in Formsmith without writing one that passes while proving nothing — vacuous assertions, tests that encode the bug, green from two cancelling faults, unscoped queries, fixtures the product never produces, fixtures whose two names are the same string so the branch under test is invisible, geometry or browser behaviour checked in jsdom, and guards that name a DOM scope the DOM has since moved. Use whenever authoring a test, changing one, or asking whether a green suite actually means anything.
allowed-tools: Bash, Read, Grep, Glob, Edit, Write
---

# Writing tests that mean something

How to run the suites, which environment each uses, and why `pnpm typecheck` is two passes
live in **[CLAUDE.md](../../../CLAUDE.md)**. This skill is the _authoring_ checklist: the ways
a test here has passed without earning it, and what to write instead.

Every trap below already happened in this repository. Not one was caught by reading the diff.
Most were caught by writing down what the code was supposed to do and then checking, which is
why the specification exists.

## The one question that catches most of it

> **If I broke the thing this test is named after, would this test fail?**

If you cannot answer yes, you have written documentation, not a test. The habit that makes
this cheap: **break the fix, watch the right test go red, put it back.** It takes thirty
seconds and it is the only evidence that a green line means anything.

```bash
# the whole discipline
sed -i 's/GOOD/BAD/' src/thing.ts && npx vitest run thing.test.ts   # expect red
git checkout src/thing.ts && npx vitest run thing.test.ts           # expect green
```

---

## Trap 1 — the assertion that cannot fail

Two tree tests moved a node into a container and asserted on the flattened order. Moving a
node in or out of a container leaves flattened order unchanged, so both passed no matter what
`moveNode` did.

```ts
// ✗ flatten order is identical whether the move worked or not
expect(flatten(next).map((r) => r.node.key)).toEqual(['root', 'a', 'b'])

// ✓ assert the thing that actually changed
expect(findParent(next, 'b')?.key).toBe('a')
```

**Rule:** name the property the behaviour changes, and assert _that_. If the same assertion
would hold with the feature deleted, it is not testing the feature.

## Trap 2 — the test that encodes the bug

`validation.test.ts` contained a case asserting that `required` "accepts false and 0". That
was the bug: an unticked consent checkbox passed a submit. The test had been protecting it for
months, and the type checker had no opinion.

**Rule:** when a test's name states a policy, check the policy is one the spec actually wants
before you make the test pass. A test is a claim about intended behaviour, and a wrong claim
defended by a green tick is worse than no test.

## Trap 3 — green because two faults cancel

Localisation was "verified in a browser" and worked. It worked because translations were
written into the `en` bundle while the renderer read `en-US`, _and_ because adding a language
corrupted `defaultLanguage` from `en-US` to `en`. Two bugs, one visible pass.

**Rule:** a passing manual check is not evidence unless you can say _why_ it passed. If the
answer is "it just did", go and find the mechanism. `languageTag()` exists because that
mechanism turned out to be two errors agreeing.

## Trap 4 — matching more than you meant

The contrast test selected token blocks by substring, so `.fs-shell` also matched
`.fs-shell[data-fs-theme='dark']`. Thirty-two assertions ran twice against the dark palette
and never once against the light one.

```ts
// ✗ substring: the light selector also matches the dark one
const block = css.slice(css.indexOf(selector))

// ✓ exact, and loud when a palette disappears
if (!blocks.has(selector)) throw new Error('no block for ' + selector)
```

The same shape bites in the DOM. `getByText('French')` started matching twice the moment a
language select appeared in the toolbar; `getByRole('tablist')` became ambiguous the moment
the left pane grew tabs; `getByLabelText('Glyph')` missed entirely because a property with a
value set announces itself as `Glyph (modified)`.

**Rule:** scope every query to the region you mean — `within(panel)`, a named `tablist`, an
exact selector — and make the lookup throw when it finds nothing rather than silently
measuring the wrong thing twice.

## Trap 5 — fixtures the product never builds

Every language test constructed `{ code: 'en' }`. `createDocument` produces
`{ code: 'en', dialect: 'US' }`. So the remove button, which passed `language.code` into a
filter comparing `languageTag(l)`, was broken for every real document and green for every
test.

**Rule:** build fixtures with the factory, or match what the factory produces. A fixture
shaped more simply than reality tests a product that does not exist.

## Trap 6 — geometry where there is no layout

jsdom gives every element a zero rectangle. Drop resolution, selection frames, the drag
threshold, focus order and anything measuring `getBoundingClientRect` cannot be tested there —
they will pass on arithmetic that is wrong in a browser.

Two that only a browser could catch: MUI's Select opened from an `onMouseDown` _inside_ the
element carrying `data-fs-key`, so cancelling the default was not enough; and the canvas
cancelled pointer events in the capture phase and swallowed clicks aimed at its own selection
toolbar, which made three working buttons read as dead.

**Rule:** positional and event-capture behaviour goes in `e2e/`. Unit-test the arithmetic on
fixture rectangles — `dnd.ts` takes measured rects and touches no DOM precisely so it can be.

**And it is not only the layout engine.** jsdom's CSS parser is stricter than a browser's: it
rejects `image-set()`, `data:` URLs and `!important` that Chromium accepts. So a test asserting
"the browser refuses this value" passes in jsdom for values a browser takes. That was measured
while checking whether a React `style` object stops a CSS injection — it does, but jsdom also
"stopped" three legitimate values, so the instrument agreed with the answer for the wrong
reason. **Any assertion about what a browser accepts or rejects — CSS values, URL parsing,
`inert`, a `<dialog>`'s Escape handling — belongs in `e2e/`.** jsdom implements a subset, and
a subset is exactly the shape that makes a security test pass while the browser stays open.

## Trap 7 — a suite that never runs the rule it states

`02-kit-contract.md` listed accessibility obligations every kit "must" satisfy. Nothing
executed them. `@formsmith/kit-mui` satisfied neither: no renderer set `role="alert"`, and its
checkbox built the message element only once there was an error.

Related: axe does not flag an `aria-controls` pointing at an id that is not in the document,
so two of three inspector tabs did that for months under a passing accessibility suite.

**Rule:** if a document says a kit _must_ do something, there is a test in
`test/kit-contract.test.tsx` that runs it against every kit, or the sentence is a wish. And
know what your tools do not check — a green axe run is not a claim about IDREFs.

## Trap 8 — a guard with a hole in it

`test/docs.test.ts` exists to stop documents drifting apart. Its count regex matched
`345 tests` but not `345 unit tests`, so a stale figure sat in two files while the guard that
exists to prevent exactly that reported green — in the same commit that added it. Its link
check excluded any link containing a `#`, so every heading link went unverified.

**Rule:** a guard is code. Break the thing it guards and watch it fail, or you have written a
second thing that needs guarding.

## Trap 9 — testing the tree when you mean the canvas

`keys()` in the canvas tests read `[data-fs-row]`. A node hidden by `renderWhen` is a tree row
and not a canvas element, so the two lists are not the same list and swapping them silently
changed what the test asserted.

**Rule:** know which projection you are reading. The tree shows every node; the canvas shows
what is visible; the JSON shows what is stored. They disagree deliberately.

## Trap 10 — a control whose text is derived from its own parsed value

The JSON editor read its value once at mount and was keyed by property name, so two components
of one type shared an instance. The condition options box re-derived its text from the parsed
list on every keystroke, which normalised away the newline as it was typed — `18` Enter `21`
arrived as `1821`, and a multi-line list could not be entered at all.

**Rule:** an editor that parses holds a draft and commits on blur, re-syncing only when the
value it last saw changes. `KeyField` and `JsonEditor` are the shape; test that a newline, a
partial edit and an undo all survive.

## Trap 11 — a fixture that collapses the distinction under test

Every repeater fixture in the repository sets `key` and `dataKey` to the same string. So the
row-addressing design and its opposite produce **byte-identical output across all 911 unit tests
and 65 end-to-end tests** — a patched build of the alternative design was run and the whole suite
stayed green. The suite could not have caught the defect that prompted the question: a repeater
whose two names differ silently discards every keystroke in its rows.

This is not Trap 5. The fixture is one the product builds readily — the Data key editor is
offered on any node with a schema, and a `Repeater` has one. It is producible, it is realistic,
and it is useless, because the two names it should have kept apart are the same string.

**Rule:** when a test covers code that distinguishes two things, the fixture has to make them
different. Ask what the code branches on — a key against a data key, a node against its row, a
default against an override — and build the fixture so that branch is observable. If you can
swap the two and the test still passes, the test is not about them.

## Trap 12 — the guard that checks the wrong ancestor

`designer.css.test.ts` enforces invariant 3 by testing whether a selector reaches past
`.fs-shell` or `.fs-canvas__surface`. The form is rendered inside `.fs-canvas__frame`, one level
below the surface. So `.fs-canvas__frame input { padding: 5px 8px }` — the exact rule that broke
MUI's notched outline and caused the invariant to be written — contains neither base string, and
all four assertions stay green.

The guard was correct when the DOM had one fewer wrapper. Nothing failed when the wrapper was
added, because a guard that names its scopes as strings cannot notice that the scopes moved.

**Rule:** a guard written against a DOM shape has to be re-derived when the shape changes, and
the cheapest way to force that is to make it fail loudly on an unknown ancestor rather than pass
quietly. Break the guard the way the original incident broke the code — not a variant of it, the
same rule at the same place — and watch it go red.

---

## Before you open the PR

- [ ] **Break the fix and watch the right test fail.** Not the suite — the specific test that
      names the behaviour. This is the only step that distinguishes a test from a comment.
- [ ] **Run `pnpm e2e` too.** 65 of these checks are the only ones that see layout, real event
      capture, and focus. jsdom will not tell you.
- [ ] **Check the counts.** `pnpm test` and `pnpm e2e` totals appear in `README.md`,
      `CLAUDE.md` and `docs/ROADMAP.md`, and `test/docs.test.ts` compares them.
- [ ] Grep your diff for the tells: an assertion that would hold with the feature removed, a
      `getBy*` with no scope, a fixture literal where a factory exists, a `getBoundingClientRect`
      in a `.test.ts`, a new "must" in the spec with no test behind it, a fixture whose two names
      are the same string, and any claim about what a browser accepts asserted in jsdom.
