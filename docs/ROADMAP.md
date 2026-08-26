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

It is not a product yet. The component catalogue is eight entries against the two dozen a form builder
needs, the inspector has two of its four tabs, there is no Style tab and no way to author actions, and
the panes do not collapse. See [docs/spec/03-components.md](spec/03-components.md),
[docs/spec/06-inspector.md](spec/06-inspector.md), and [docs/spec/04-shell.md](spec/04-shell.md).

## Verification

`pnpm test` runs 567 tests; `pnpm e2e` runs 55 in a real browser. Both gate CI, along with lint,
formatting, typechecking, and a build that checks every package emitted its entry points. Contrast is
computed from the stylesheets and axe runs over the designer in six states. See
[accessibility.md](accessibility.md).

None of that catches a specification section that claims something the code does not do. An adversarial
read of the twelve contracts found nine such claims, including two accessibility obligations that had
been written down as kit requirements for months without anything ever executing them. The tests that
now run them live in `test/kit-contract.test.tsx`.
