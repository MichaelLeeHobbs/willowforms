# Roadmap

**The specification is the roadmap.** [docs/spec/README.md](spec/README.md) is the index, and every
section in it carries a status: built, partial, planned, or undecided. What is left to do is every
section not marked built, read in that order.

This file used to keep its own list. It said all eight of its items were done while six of the twelve
contracts in the specification were only partial, so the first document a visitor opened described a
finished product and the second did not. Keeping two lists in step is the problem the specification was
restructured to remove, and leaving this one populated recreated it immediately.

## Where things stand

The core, the renderer, the two kits, and the drag-and-drop canvas work. The designer is a real builder:
you can compose a form, edit its properties, write validation rules, bind properties to expressions or
translations, preview it, and export it.

The shell is there: tabbed panes that collapse, viewport simulation, a selection toolbar, and a catalogue
of 27 components in both kits.

What is left is behaviour, and the order changed once we looked at what real forms actually do.

**Conditions are built.** `renderWhen` used to accept only an expression and had no authoring UI, so
conditional visibility — the most common dynamic behaviour a form has — needed a JavaScript sandbox _and_
a hand-edited document. A closed structured condition, evaluated in core, fixes both: a form that shows a
field only when another is answered now runs in a host that injected nothing.
See [docs/spec/01-document-model.md](spec/01-document-model.md#conditions).

**State that is not an answer is built.** "Three addresses found", "checking", "uploading" had nowhere
to live, because `renderWhen` could only read `data` and `data` is what gets submitted. It turned out to
be two things. What a condition reads has to be reproducible in Node, or the browser and the server
disagree about what the form asked and disagree silently, so JSON the host supplies became `FormContext`
with its own operand kind, and everything that cannot survive that trip stayed in the kit component where
it already was. `missingContext(root, context)` is the boot-time check that catches an unwired host,
because nothing at evaluation time can.
See [docs/spec/12-api.md](spec/12-api.md#state-that-is-not-an-answer).

**Then the two gaps that block real forms**, neither of which is an action:

- **Steps.** _Built._ A `Step` component in both kits, shown when `context.step` names it, with `validateAcross` checking every step's fields rather than only the one on screen. No progress indicator yet, and branching is designed rather than built -- `03-components.md` has the
  section, and nothing reads it. That is onboarding
  and surveys. See [docs/spec/03-components.md](spec/03-components.md#what-is-deliberately-absent).
- ~~**Repeated scope.**~~ **Built.** Rows are a projection of the authored subtree, never nodes in the
  tree, so no tree operation changed. See [docs/spec/03-components.md](spec/03-components.md#repeated-scope).

**Actions come after those**, not before. Two of their open questions are now settled — an action returns
effects rather than changing data, and one vocabulary serves both built-in and `code` actions — but the
vocabulary itself waits, because actions sit one layer above what is blocking forms.
See [docs/spec/09-actions.md](spec/09-actions.md).

**The Style tab is built.** Per-component CSS, per breakpoint, with structured controls and a raw field
over one string. The text is declarations only and anything that would let it escape the component is
refused rather than escaped, because a document is data and reaches the renderer from wherever the host
kept it. `PropSchema.section` is read now too, so a kit's own styling properties sit beside the CSS they
compete with instead of in a flat list.
See [docs/spec/06-inspector.md](spec/06-inspector.md#style).

## Verification

`pnpm test` runs 2337 tests; `pnpm e2e` runs 78 in a real browser. Both gate CI, along with lint,
formatting, typechecking, and a build that checks every package emitted its entry points. Contrast is
computed from the stylesheets and axe runs over the designer in nine states. See
[accessibility.md](accessibility.md).

None of that catches a specification section that claims something the code does not do. An adversarial
read of the twelve contracts found nine such claims, including two accessibility obligations that had
been written down as kit requirements for months without anything ever executing them. The tests that
now run them live in `test/kit-contract.test.tsx`.
