# Property bindings

**Status: built.** Static, translated, structured-condition, and computed bindings are supported. Computed bindings retain a plain text editor and a host-owned evaluator contract; richer expression tooling is outside the product scope.

Any property can be a literal value, an expression computed at render time, a key into a translation
bundle, or -- where the schema opts in -- a structured condition. Which of them a property may be is
declared by its `PropSchema`, not chosen freely.

## The four modes

```ts
type PropValue =
  | { kind: 'static'; value: JsonValue }
  | { kind: 'computed'; expression: string }
  | { kind: 'i18n'; key: string }
  | { kind: 'condition'; condition: Condition }
```

| Mode        | Panel label | Resolves to                                                            |
| ----------- | ----------- | ---------------------------------------------------------------------- |
| `static`    | Value       | the literal, unchanged                                                 |
| `computed`  | Expression  | whatever the injected evaluator returns, or `null` with no evaluator   |
| `i18n`      | Translation | the bundle entry for the active language, or the key itself if missing |
| `condition` | Condition   | a boolean, evaluated in core with no sandbox                           |

`condition` is offered only where a schema opts in with `conditional: true`, and it is what `renderWhen`
and a validation rule's `when` guard hold. It is listed here because it is a member of the same union,
so anything switching on `kind` has to handle it -- see
[08-validation.md](08-validation.md#guards) for what a guard of each kind needs.

Resolution happens once, in the renderer, for every kit. A kit renderer receives resolved plain JSON and
never sees a `PropValue` — see [02-kit-contract.md](02-kit-contract.md).

## Which modes a property offers

**Status: built.** Decided by `modesFor(schema)`:

- `static` is always offered.
- `computed` unless the schema sets `computable: false`.
- `i18n` only when the schema sets `localizable: true`.

`localizable` is opt-in because most properties are not user-facing copy. A gap, a colour, or a direction
has nothing to translate, and offering a translation key there is noise that makes the real cases harder
to find. Kits mark labels, placeholders, helper text, headings and button copy.

A property with only one mode shows no picker at all.

## Switching modes discards the value

**Status: built**, and deliberate.

Turning a static label into an expression does not seed the expression with the label text. An expression
is not a label; `Email address` as JavaScript is a syntax error that looks authored. The same applies in
reverse. Undo covers a mistake, and a visibly empty editor is better than a plausibly broken one.

## Computed

**Status: built.** Expressions are a specialized integration surface authored in a plain textarea. Completion, syntax services, debugging, and in-panel evaluation are not planned. Ordinary visibility and conditional validation use the structured condition editor without an evaluator.

The expression is a string. WillowForms does not evaluate it: the host injects an evaluator and owns the
sandbox. With none injected the property resolves to `null` and the component still renders. See
[09-actions.md](09-actions.md) for why that boundary exists and what a host must supply.

The panel says so next to the editor, because a binding that silently produces nothing is otherwise
indistinguishable from one that is wrong.

Hosts that enable computed bindings own expression testing and evaluation. Retaining the runtime contract and source editor does not commit WillowForms to an expression development environment; removing richer tooling from scope does not remove stored expressions or change their evaluation semantics.

## Translations

**Status: built.**

A translation binding holds a key. Bundles live on the document, keyed by BCP 47 tag, then by key:

```ts
translations: Record<string, Record<string, string>> // 'en-US' -> 'email_label' -> 'Email address'
```

### Keys

Seeded as `componentKey_propName` — `email_label`, `submit_text` — by `translationKey()`. The author can
change it, which is what makes two components able to share one string.

Translation keys are stable text identities. Renaming a component does not rewrite them or their bundles:
the seeded `componentKey_propName` form is a convention for new bindings, not ownership. This preserves
shared keys and avoids a structural rename changing translated copy that another component still uses.

### A missing translation renders its key

Not an empty string. A label reading `email_label` is obviously wrong and gets fixed; an empty label
looks like a design choice and ships. Clearing a translation removes the entry rather than storing an
empty string, so the fallback comes back.

### Authoring

Each language gets a field beside the property, so translating does not mean navigating away from what is
being translated. The field carries the language's `dir`, so right-to-left copy is authored the right way
round.

Languages themselves are managed on the Settings tab in the left pane: add, remove, set the default, set
writing direction. It moved there when form settings stopped being a tab of the inspector, because they
belong to the document rather than to whatever is selected.
The last language cannot be removed, and removing the current default moves it — a document naming a
language it does not have renders every translation as a raw key.

Removing a language leaves its bundle in the document. Dropping the text with it would make an accidental
removal unrecoverable except through undo, and an orphaned bundle costs nothing.

### Validation messages

**Status: built.** Rule messages can use translation bindings and are authored with the same per-language
editor. See [08-validation.md](08-validation.md#messages).

## The active language

**Status: built.** `FormRenderer` takes a `language` prop and falls back to
`document.defaultLanguage`. The toolbar draws a selector whenever the document has more than one
language, and the designer passes the choice to the canvas, so a form can be seen in any of its
languages while it is being built. See [04-shell.md](04-shell.md).

Removing the language the canvas is showing drops the selection back to the document's default rather
than leaving the canvas pointed at a language that is gone.

## Why a tagged union

The alternative, one bag of fields where the presence of `expression` means "this is computed", is what
FormEngine uses. A tagged union means every consumer switches on `kind` exhaustively, so adding a fourth
mode is a compile error at every call site rather than a silent fallthrough at some of them.

It also makes "which mode is this in" a question with an answer, which is what lets the panel show one
picker instead of inferring intent from which fields happen to be filled in.
