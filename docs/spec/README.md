# Formsmith specification

What Formsmith is meant to do, contract by contract. One file per contract, because a single document
covering all of it would be too large for anyone to read or keep true.

## How to read this

Almost every section carries a status, and the status is the point. This specification is also the
roadmap:
there is no separate list of planned work to drift out of step with the code, because that has already
happened twice in this project's short life.

| Status        | Means                                                                              |
| ------------- | ---------------------------------------------------------------------------------- |
| **Built**     | Implemented, tested, and verified. The section describes what the code does today. |
| **Partial**   | Some of it exists. The section says which part, and what is missing.               |
| **Planned**   | Specified but not written. The section is a commitment, not a description.         |
| **Undecided** | A question that needs answering before anything is built. Named, not hidden.       |

A section that says **Built** and is wrong is a bug in this document, and worth reporting as one. An
adversarial read has already found nine of those.

Every file opens with a status covering the whole file, and `00-product.md` is the exception: a statement
of intent has no code to match. Headings inside a file carry their own status where it differs from the
file's. Where a heading has none it inherits, and that inheritance is the weak spot: `02-kit-contract.md`
was marked Built as a whole while two of the accessibility obligations under it had never been executed
by anything.

## Contracts

| File                                         | Covers                                                   | State   |
| -------------------------------------------- | -------------------------------------------------------- | ------- |
| [00-product.md](00-product.md)               | Purpose, users, scope, non-goals                         | —       |
| [01-document-model.md](01-document-model.md) | `FormDocument`, `ComponentNode`, `PropValue`, versioning | Partial |
| [02-kit-contract.md](02-kit-contract.md)     | The two halves of a kit and the one obligation           | Built   |
| [03-components.md](03-components.md)         | The component catalogue                                  | Partial |
| [04-shell.md](04-shell.md)                   | Layout, panels, toolbar, viewport, keyboard              | Partial |
| [05-canvas.md](05-canvas.md)                 | Selection, drag and drop, drop resolution                | Partial |
| [06-inspector.md](06-inspector.md)           | Properties, Style, Actions, Rules, and the editors       | Partial |
| [07-bindings.md](07-bindings.md)             | Static, computed, and translated property values         | Partial |
| [08-validation.md](08-validation.md)         | The rule catalogue and its semantics                     | Partial |
| [09-actions.md](09-actions.md)               | Events, code actions, and the sandbox boundary           | Planned |
| [10-interchange.md](10-interchange.md)       | Import, export, and JSON Schema                          | Partial |
| [11-theming.md](11-theming.md)               | Token vocabulary for the designer and for kits           | Partial |
| [12-api.md](12-api.md)                       | What a consumer imports, and the platform baseline       | Partial |

Adjacent documents that are not contracts:

- [../ARCHITECTURE.md](../ARCHITECTURE.md) — why the seams are where they are
- [../accessibility.md](../accessibility.md) — what is checked, how, and what is missing
- [../prior-art/README.md](../prior-art/README.md) — what the competitor study found and the rules for using it

A file's status is the weakest of its sections, not an average. `07` and `08` describe built behaviour
and each contains a section that is not, so both read Partial: a reader scanning this table for what is
safe to depend on is asking the pessimistic question.

## Vocabulary

Used precisely throughout, and worth pinning before the first file uses all of them in one sentence.

| Term           | Means                                                                          |
| -------------- | ------------------------------------------------------------------------------ |
| **Document**   | One form. A `FormDocument`: a tree, its languages, translations, and actions.  |
| **Node**       | One entry in that tree, a `ComponentNode`. Has a `key`, a `type`, and `props`. |
| **Key**        | A node's identity, unique within a document. Also its key in submitted data.   |
| **Type**       | Which component a node is, as a string. How a node finds its renderer.         |
| **Component**  | A kind of thing a node can be, declared by a kit as a `ComponentDef`.          |
| **Kit**        | A pairing of palette metadata and React renderers. What makes a form look MUI. |
| **Container**  | A component that holds children. The root is one.                              |
| **Data-bound** | A component that contributes a value to submitted data, and so has a schema.   |
| **Binding**    | A `PropValue`: a property that is static, computed, or a translation key.      |
| **Host**       | The application embedding the designer or the renderer. Owns data and saving.  |

## Where this comes from

Two sources, and they are not the same kind of thing.

The **capability bar** comes from driving the public demos of the commercial React form builders, mostly
FormEngine. That study is research input, and it lives in [../prior-art](../prior-art/README.md). It
records another product's exact property names, default key formats, enumerated option lists, and
interface copy, none of which belongs in this repository. What crosses over is the answer to "what does a
serious form designer have to do", and nothing else.

Naming them is deliberate. An earlier draft called FormEngine "the studied product" throughout while
`docs/ARCHITECTURE.md` and `packages/core/src/types.ts` named it outright, so the euphemism protected
nothing and cost a reader something on every appearance. What does not belong here is a claim about
another product's current behaviour: those decay the moment it ships a fix, and a specification that
outlives them starts making false public statements. Comparisons here are about architecture, which is
stable and checkable from public documentation.

What crosses over freely is the vocabulary of the problem. A field has a label, a placeholder, a
disabled state, a helper text; a container has a direction and a gap. Those are universal ideas that any
serious form builder arrives at, and converging on them is not copying, it is getting the domain right.
Where our property set matches theirs, that is usually why.

The narrow rule is about expression, not ideas: no verbatim interface copy, no measured pixel metrics, no
palette taken wholesale. Formsmith has its own tokens and writes its own strings.

The **decisions** are ours, and this document is where they are written down, including the places where
we look at what they do and choose differently.

## Keeping it true

`test/docs.test.ts` checks that this index lists every file in the directory, that every file opens with
a status, that every link between these files resolves and that every `#anchor` in one names a real
heading, and that the rule table in `02-kit-contract.md` has exactly as many rows as the contract suite
has tests.

It cannot check that a section marked **Built** actually is. That is the claim worth being strict about
when writing here, and it is the one that has been wrong most often.
