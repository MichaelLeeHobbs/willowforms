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

What is left is behaviour. The inspector has two of its four tabs, so there is no Style tab and no way to
author actions, and nothing fires an event. `Repeater` is the one catalogue entry still unbuilt, blocked
on a document model that can express a repeated scope. See
[docs/spec/06-inspector.md](spec/06-inspector.md), [docs/spec/09-actions.md](spec/09-actions.md), and
[docs/spec/03-components.md](spec/03-components.md).

## Verification

`pnpm test` runs 608 tests; `pnpm e2e` runs 55 in a real browser. Both gate CI, along with lint,
formatting, typechecking, and a build that checks every package emitted its entry points. Contrast is
computed from the stylesheets and axe runs over the designer in six states. See
[accessibility.md](accessibility.md).

None of that catches a specification section that claims something the code does not do. An adversarial
read of the twelve contracts found nine such claims, including two accessibility obligations that had
been written down as kit requirements for months without anything ever executing them. The tests that
now run them live in `test/kit-contract.test.tsx`.
