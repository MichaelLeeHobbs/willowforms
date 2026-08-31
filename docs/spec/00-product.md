# Product

What Formsmith is, who it is for, and the lines it will not cross.

This file carries no status. Every other file uses one to say whether the code matches the prose, and a
statement of intent has nothing to match: marking a scope document "built" put four product commitments
in the same category of trust as a function that exists, and one of those commitments was wrong for
months without anything being able to notice.

## The one-line version

An MIT-licensed visual form designer for React. The designer, not just the renderer.

## Why it exists

Every good form builder splits the same way: the runtime is open source and the visual designer is not.
FormEngine, SurveyJS and Vueform all publish an MIT runtime and sell the builder. The genuinely open
alternatives are AGPL, which many organisations cannot take a dependency on. `@formio/js` is the one MIT
builder, and it is a 2018-era architecture carrying `moment`, `dragula` and jQuery-shaped patterns.

That leaves a real gap: teams that cannot take copyleft and will not pay four figures a year for a
drag-and-drop panel. Formsmith is for them.

The licence is the product decision, not a detail. **If the designer ever goes behind a licence, this
project has become the thing it was built to replace.**

## Who uses it

Three roles, and the design serves all three or it has failed.

**The developer embedding it.** Wants a React component they can drop into an admin area without
inheriting a component library, a state manager, or a theme fight. Cares that the runtime ships without
the designer, that types are strict, and that the same validation runs on their server.

**The form author.** Not necessarily a developer. Composes a form by dragging, configures it in a panel,
tests it with live data. Needs the tool to say what it is doing: refusals with reasons, undo that takes
back a whole edit, errors that name the field.

**The translator.** Adds a language and fills in strings. Should never need to see JSON.

All three are anonymous to Formsmith. It has no accounts, no session, and no opinion about who you are.

## What it does

- Compose a form visually, with nesting
- Configure any component from metadata the kit supplies, not from hand-written panels
- Bind a property to a literal, an expression, or a translation key
- Attach validation that runs identically in the browser and on a server
- Localise into any number of languages
- Test against live data, with real errors
- Take the definition in and out as JSON, and project a JSON Schema of the submitted data

## What it will never do

These are not "not yet". They are decisions.

**A backend.** No auth, no database, no multi-user story, no hosted forms. `apps/demo-server` is five
routes over a JSON file whose only job is to prove that server-side validation shares one rule set. A
hosted form service is somebody else's product, and building one would put Formsmith in competition with
the people most likely to adopt it.

**An open-core split.** No enterprise tier, no paid designer, no "advanced" package. See above.

**A JavaScript sandbox.** Computed properties, custom rules and code actions all execute
author-supplied JavaScript. In a single-user builder that is fine; in any multi-user deployment it is
remote code execution by design. Core ships no evaluator, the host injects one and owns the boundary. A
convenience `eval`-backed default would be indistinguishable from the vulnerability. See
[09-actions.md](09-actions.md).

**Persistence.** The designer holds a document and emits every version of it. Where that goes is the
host's decision, and a builder that assumed localStorage or an API shape would be wrong for most of them.
See [10-interchange.md](10-interchange.md).

## What "good" means here

Four commitments, each backed by something checkable rather than asserted.

**Kits are pluggable.** Adding one is a new package, not a change to the designer. Checked: adding the
second kit changed nothing in `core`, `renderer` or `designer`, and a contract test runs against every
kit in the repository. It did touch build configuration, the playground, and one bug in the other kit
that the new contract test exposed. An earlier draft of this paragraph said "four files, all build
plumbing", which was the number of build files and not the number of files.

**The designer has no UI-library dependency.** Its chrome is plain CSS driven by custom properties.
A lint rule fails CI if anyone imports one of the named component libraries into it. The list is a deny
list in `eslint.config.js` -- named libraries, not a category -- so it catches the ones this project has
heard of and would not stop a kit nobody thought of, and it fails `pnpm lint` rather than `pnpm build`.

**Accessibility is not a later milestone.** Every button is named, the tabs are a real tablist, the tree
is fully keyboard-operable including moving components, contrast is computed from the stylesheets in CI,
and axe runs over the designer in nine states. See [../accessibility.md](../accessibility.md).

**Nothing degrades silently.** A missing sandbox makes rules pass rather than throw. A refused rename
says which component holds the name. A malformed import lists every problem at once. A rule that cannot
run says so in the panel. The failure mode this project treats as worst is the one where the tool appears
to work.

## Scope of this specification

Everything under `packages/`. The playground (`apps/playground`) is a demo of the designer and is
specified only where it demonstrates a contract, such as switching kits at runtime. The demo server is
not specified beyond its purpose.
