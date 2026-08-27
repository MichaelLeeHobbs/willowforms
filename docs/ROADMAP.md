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
of twenty-five components in both kits.

What is left is behaviour, and the order changed once we looked at what real forms actually do.

**Conditions are built.** `renderWhen` used to accept only an expression and had no authoring UI, so
conditional visibility — the most common dynamic behaviour a form has — needed a JavaScript sandbox _and_
a hand-edited document. A closed structured condition, evaluated in core, fixes both: a form that shows a
field only when another is answered now runs in a host that injected nothing.
See [docs/spec/01-document-model.md](spec/01-document-model.md#conditions).

**Then the three gaps that block real forms**, none of which is an action:

- **Ephemeral state.** "Three addresses found", "checking", "uploading". Nowhere to put it, and half of
  what an action would want to do has nowhere to write to until there is.
  See [docs/spec/12-api.md](spec/12-api.md#there-is-nowhere-to-put-ephemeral-state).
- **Steps.** No Step component, so no per-step validation, no branching, no progress. That is onboarding
  and surveys. See [docs/spec/03-components.md](spec/03-components.md#what-is-deliberately-absent).
- **Repeated scope.** Already known, still blocking `Repeater` and every "add another" button.

**Actions come after those**, not before. Two of their open questions are now settled — an action returns
effects rather than changing data, and one vocabulary serves both built-in and `code` actions — but the
vocabulary itself waits, because actions sit one layer above what is blocking forms.
See [docs/spec/09-actions.md](spec/09-actions.md).

The Style tab is still owed from the inspector, and is unblocked.
See [docs/spec/06-inspector.md](spec/06-inspector.md#style).

## Verification

`pnpm test` runs 651 tests; `pnpm e2e` runs 55 in a real browser. Both gate CI, along with lint,
formatting, typechecking, and a build that checks every package emitted its entry points. Contrast is
computed from the stylesheets and axe runs over the designer in six states. See
[accessibility.md](accessibility.md).

None of that catches a specification section that claims something the code does not do. An adversarial
read of the twelve contracts found nine such claims, including two accessibility obligations that had
been written down as kit requirements for months without anything ever executing them. The tests that
now run them live in `test/kit-contract.test.tsx`.
