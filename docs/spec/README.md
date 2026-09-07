# WillowForms specification

WillowForms enables applications to let users create and update forms on demand, and lets other users complete those forms through a clear, accessible experience. It makes everyday form building straightforward, produces reliable results, and fits naturally into the application's existing design and workflows.

## Product principles

- **Design for form authors and respondents.** Common tasks use understandable controls and require no programming knowledge.
- **Make accessibility and correctness automatic.** Ordinary configuration produces properly labeled controls, understandable validation, and usable keyboard interactions.
- **Prioritize everyday needs.** Include features that materially help people build or complete real forms.
- **Keep the library focused.** The host application owns storage, permissions, distribution, and business workflows.
- **Provide extension points for specialized needs.** Advanced integrations fit without complicating the standard authoring experience.

The central question for a feature is: **Does this help someone create a useful form or successfully complete one?** A proposal should identify the user, the concrete task, why existing controls or a host extension are insufficient, and how success will be verified. Existing capabilities remain documented even when we decide against expanding them; changing a public contract requires an explicit compatibility decision.

The contracts below apply these principles. [00-product.md](00-product.md) defines the audience and ownership boundaries.

## How to read this

Each contract carries a status. The specification owns behavioral commitments; the [roadmap](../ROADMAP.md) records execution priorities and the [beta review](../BETA_REVIEW.md) records the release scope and verification evidence.

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

| File                                         | Covers                                                     | State   |
| -------------------------------------------- | ---------------------------------------------------------- | ------- |
| [00-product.md](00-product.md)               | Purpose, users, scope, non-goals                           | —       |
| [01-document-model.md](01-document-model.md) | `FormDocument`, `ComponentNode`, `PropValue`, versioning   | Built   |
| [02-kit-contract.md](02-kit-contract.md)     | Kit integration and accessibility from ordinary properties | Partial |
| [03-components.md](03-components.md)         | The component catalogue                                    | Built   |
| [04-shell.md](04-shell.md)                   | Layout, panels, toolbar, viewport, keyboard                | Built   |
| [05-canvas.md](05-canvas.md)                 | Selection, drag and drop, drop resolution                  | Built   |
| [06-inspector.md](06-inspector.md)           | Properties, Style, Actions, Rules, and the editors         | Built   |
| [07-bindings.md](07-bindings.md)             | Static, computed, and translated property values           | Built   |
| [08-validation.md](08-validation.md)         | The rule catalogue and its semantics                       | Built   |
| [09-actions.md](09-actions.md)               | Events, code actions, and the sandbox boundary             | Built   |
| [10-interchange.md](10-interchange.md)       | Import, export, and JSON Schema                            | Built   |
| [11-theming.md](11-theming.md)               | Token vocabulary for the designer and for kits             | Built   |
| [12-api.md](12-api.md)                       | What a consumer imports, and the platform baseline         | Built   |

Adjacent documents that are not contracts:

- [../ARCHITECTURE.md](../ARCHITECTURE.md) — why the seams are where they are
- [../accessibility.md](../accessibility.md) — what is checked, how, and what is missing
- [../SPEC_SCOPE_REVIEW.md](../SPEC_SCOPE_REVIEW.md) — mission-based scope findings and proposals awaiting a product decision
- [../prior-art/README.md](../prior-art/README.md) — what the competitor study found and the rules for using it

A file's status is the weakest of its sections, not an average, and it has to match what the file itself
opens with. A reader scanning this table for what is safe to depend on is asking the pessimistic
question, and an index that answers Partial over a file reading Built answers a third question nobody
asked.

`02` remains Partial pending the complete audit of accessibility from ordinary properties. Standard file inputs have been removed; attachments belong to host-configured custom or community components. Richer expression tooling, generic HTML attribute passthrough, and direct canvas keyboard selection have been removed from product scope. The existing Tree keyboard workflow, component properties, stored expressions, and host-owned evaluator contract remain supported.

## Vocabulary

Used precisely throughout, and worth pinning before the first file uses all of them in one sentence.

| Term           | Means                                                                                                                 |
| -------------- | --------------------------------------------------------------------------------------------------------------------- |
| **Document**   | One form. A `FormDocument`: a tree, its languages, translations, and actions.                                         |
| **Node**       | One entry in that tree, a `ComponentNode`. Has a `key`, a `type`, and `props`.                                        |
| **Key**        | A node's identity, unique within a document. Its answer name defaults to this key and can be overridden by `dataKey`. |
| **Type**       | Which component a node is, as a string. How a node finds its renderer.                                                |
| **Component**  | A kind of thing a node can be, declared by a kit as a `ComponentDef`.                                                 |
| **Kit**        | A pairing of palette metadata and React renderers. What makes a form look MUI.                                        |
| **Container**  | A component that holds children. The root is one.                                                                     |
| **Data-bound** | A component that contributes a value to submitted data, and so has a schema.                                          |
| **Binding**    | A `PropValue`: a property that is static, computed, or a translation key.                                             |
| **Host**       | The application embedding the designer or the renderer. Owns data and saving.                                         |

## Where this comes from

Two sources, and they are not the same kind of thing.

The [prior-art study](../prior-art/README.md) is research input. Another builder's catalogue, property count, or advanced tooling does not establish a WillowForms requirement. Features are justified by the product principles and concrete author or respondent tasks. The study's exact property names, interface copy, and measured visual details are not a specification to reproduce.

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
palette taken wholesale. WillowForms has its own tokens and writes its own strings.

The **decisions** are ours, and this document is where they are written down, including the places where
we look at what they do and choose differently.

## Keeping it true

`test/docs.test.ts` checks that this index lists every file in the directory, that every file opens with
a status, that every link between these files resolves and that every `#anchor` in one names a real
heading, and that both rule tables in `02-kit-contract.md` have exactly as many rows as the contract
suite has rules -- the per-kit block and the rules driven per kit from outside it.

It checks more than that now, and the list is worth having in one place: the events table in
`03-components.md` against what the two kits declare, both token tables in `11-theming.md` against the
two stylesheets in both directions, the axe rules `a11y.test.tsx` disables against the ones
`accessibility.md` names, each file's opening status against the state this index gives it, the
`ComponentDef` block in `03-components.md` against the interface in core, the decision log's shape, and
the component catalogue against the kits.

The two suite totals are checked as well, and not here: `README.md`, `CLAUDE.md`, `ROADMAP.md` and the
write-tests skill are the documents that quote them, and no file under `docs/spec/` quotes either. This
paragraph used to claim the opposite -- the end-to-end total checked "against the spec files rather than
against the other documents" -- which is exactly backwards, in the one section whose job is to tell a
reader which claims are machine-checked.

It cannot check that a section marked **Built** actually is. That is the claim worth being strict about
when writing here, and it is the one that has been wrong most often.
