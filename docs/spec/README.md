# Formsmith specification

What Formsmith is meant to do, contract by contract. One file per contract, because a single document
covering all of it would be too large for anyone to read or keep true.

## How to read this

Every section carries a status, and the status is the point. This specification is also the roadmap:
there is no separate list of planned work to drift out of step with the code, because that has already
happened twice in this project's short life.

| Status        | Means                                                                              |
| ------------- | ---------------------------------------------------------------------------------- |
| **Built**     | Implemented, tested, and verified. The section describes what the code does today. |
| **Partial**   | Some of it exists. The section says which part, and what is missing.               |
| **Planned**   | Specified but not written. The section is a commitment, not a description.         |
| **Undecided** | A question that needs answering before anything is built. Named, not hidden.       |

A section that says **Built** and is wrong is a bug in this document, and worth reporting as one.

## Contracts

| File                                         | Covers                                                   | State   |
| -------------------------------------------- | -------------------------------------------------------- | ------- |
| [00-product.md](00-product.md)               | Purpose, users, scope, non-goals                         | Built   |
| [01-document-model.md](01-document-model.md) | `FormDocument`, `ComponentNode`, `PropValue`, versioning | Partial |
| [02-kit-contract.md](02-kit-contract.md)     | The two halves of a kit and the one obligation           | Built   |
| [03-components.md](03-components.md)         | The component catalogue                                  | Partial |
| [04-shell.md](04-shell.md)                   | Layout, panels, toolbar, viewport, keyboard              | Partial |
| [05-canvas.md](05-canvas.md)                 | Selection, drag and drop, drop resolution                | Partial |
| [06-inspector.md](06-inspector.md)           | Properties, Style, Actions, Rules, and the editors       | Partial |
| [07-bindings.md](07-bindings.md)             | Static, computed, and translated property values         | Built   |
| [08-validation.md](08-validation.md)         | The rule catalogue and its semantics                     | Built   |
| [09-actions.md](09-actions.md)               | Events, code actions, and the sandbox boundary           | Planned |
| [10-interchange.md](10-interchange.md)       | Import, export, and JSON Schema                          | Built   |
| [11-theming.md](11-theming.md)               | Token vocabulary for the designer and for kits           | Partial |

Adjacent documents that are not contracts:

- [../ARCHITECTURE.md](../ARCHITECTURE.md) — why the seams are where they are
- [../accessibility.md](../accessibility.md) — what is checked, how, and what is missing
- [../prior-art/README.md](../prior-art/README.md) — what the competitor study found and the rules for using it

## Where this comes from

Two sources, and they are not the same kind of thing.

The **capability bar** comes from studying the leading commercial React form builder by driving its public
demo. That study is research input. It records another product's exact property names, default key
formats, enumerated option lists, and interface copy, none of which belongs in this repository. What
crosses over is the answer to "what does a serious form designer have to do", and nothing else.

What crosses over freely is the vocabulary of the problem. A field has a label, a placeholder, a
disabled state, a helper text; a container has a direction and a gap. Those are universal ideas that any
serious form builder arrives at, and converging on them is not copying, it is getting the domain right.
Where our property set matches theirs, that is usually why.

The narrow rule is about expression, not ideas: no verbatim interface copy, no measured pixel metrics, no
palette taken wholesale. Formsmith has its own tokens and writes its own strings.

The **decisions** are ours, and this document is where they are written down, including the places where
we look at what they do and choose differently.

## Keeping it true

`test/docs.test.ts` checks that this index lists every file in the directory and that every link
resolves. It cannot check that a section marked **Built** actually is, which is why that claim is the one
worth being strict about when writing here.
