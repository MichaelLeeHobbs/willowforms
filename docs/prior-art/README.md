# Prior art

WillowForms was not designed in a vacuum. Before any of it was written, the leading commercial React form
builder was studied by driving its public demo in a browser and recording what it does: a black-box UX
study, no source, no decompilation, no code taken.

That study is what produced the feature list this project set out to match and the gap list it set out
to beat. It is summarised here in our own words. The detailed capture is not checked in, because a
document that reproduces another product's exact design tokens, measured metrics, and interface copy is
not something this repository should be publishing, whatever its research value was.

## What a serious form designer has to do

The capability bar, which is now roughly where WillowForms sits:

- A searchable, grouped palette of components
- A structure tree showing nesting, with selection shared between tree and canvas
- Per-component-type property panels driven by metadata rather than hand-written forms
- Property values that can be a literal, a computed expression, or a translation key
- Localization with multiple languages and a default
- A validation rule set richer than "required", authored in the UI
- A preview mode with live data and real errors
- Import and export of the underlying document
- More than one component library behind the same builder

## The gaps worth beating

The interesting output of studying a mature competitor is not its feature list, which is easy to copy,
but the places where it falls short. These were the targets, and each one is now something this
repository enforces rather than aspires to.

| What was observed                                  | What WillowForms does                                                                         |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Submits blocked with no error                      | Every refusal names its reason. The JSON dialog reports every problem at once, not the first. |
| Buttons with no accessible name                    | Zero, enforced by a test that walks the shell.                                                |
| Tab strips with no `role="tablist"`                | Real tablists with roving tabindex, arrow keys, and panels linked both ways.                  |
| No landmarks                                       | `header`, `main`, and named `aside` regions, checked by test.                                 |
| A primary button at 3.03:1                         | Contrast computed from the stylesheets in CI, by `test/contrast.test.ts`.                     |
| A `url`-only field reporting "Required" when blank | Only `required` fails on an empty value. There is a test named after this bug.                |
| No confirmation on destructive actions             | Undo and redo cover every operation, which beats a dialog nobody reads.                       |

The last two are worth dwelling on. The validation bug is the clearest sign that requiredness had been
folded into every rule rather than being one rule's job, which is a modelling mistake, not a slip; core
was built the other way round from the start. And the accessibility findings were not marginal. They are
the kind of thing that gets a product rejected by a public-sector buyer, which is a strange place for a
mature commercial tool to be.

## Ground rules

Reimplementing a feature set from a black-box study is ordinary competitive engineering. Copying a
product's distinctive appearance or its interface copy is a different thing and a worse argument to have.

- WillowForms has its own design tokens, in `designer.css` and `kit-html.css`, and writes its own strings.
- Feature ideas, information architecture, the shape of the data model, and the vocabulary of component
  properties are all fair game. A label, a placeholder, a disabled state and a gap are universal ideas;
  arriving at the same ones is getting the domain right, not copying.
- The narrow rule is about expression: no verbatim interface copy, no measured pixel metrics, no palette
  lifted wholesale.
- No code from any competitor is in this repository, and none was ever read.

## Refreshing this

Studying it again means driving the public demo in a browser and recording what it does, section by
section: layout, component inventory, interactions, validation, data model, content states,
accessibility, and theme. Keep the result out of the repository and bring back the conclusions.
