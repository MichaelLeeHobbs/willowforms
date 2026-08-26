# Property bindings

**Status: built.** All three modes are authored in the panel. Expression authoring is a plain textarea
with no completion, and translation keys do not follow a rename.

Any property can be a literal value, an expression computed at render time, or a key into a translation
bundle. Which of the three a property may be is declared by its `PropSchema`, not chosen freely.

## The three modes

```ts
type PropValue =
  | { kind: 'static'; value: JsonValue }
  | { kind: 'computed'; expression: string }
  | { kind: 'i18n'; key: string }
```

| Mode       | Panel label | Resolves to                                                            |
| ---------- | ----------- | ---------------------------------------------------------------------- |
| `static`   | Value       | the literal, unchanged                                                 |
| `computed` | Expression  | whatever the injected evaluator returns, or `null` with no evaluator   |
| `i18n`     | Translation | the bundle entry for the active language, or the key itself if missing |

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

**Status: partial.** Authored in a textarea. No completion, no syntax check, no way to test an expression
without leaving the panel.

The expression is a string. Formsmith does not evaluate it: the host injects an evaluator and owns the
sandbox. With none injected the property resolves to `null` and the component still renders. See
[09-actions.md](09-actions.md) for why that boundary exists and what a host must supply.

The panel says so next to the editor, because a binding that silently produces nothing is otherwise
indistinguishable from one that is wrong.

**Planned:** a way to try an expression against the preview's current data without applying it. Authoring
blind and switching to Preview to find out is the current loop and it is poor.

## Translations

**Status: built.**

A translation binding holds a key. Bundles live on the document, keyed by BCP 47 tag, then by key:

```ts
translations: Record<string, Record<string, string>> // 'en-US' -> 'email_label' -> 'Email address'
```

### Keys

Seeded as `componentKey_propName` — `email_label`, `submit_text` — by `translationKey()`. The author can
change it, which is what makes two components able to share one string.

**Known gap:** renaming a component does not rename its keys. The binding keeps working, because the key
is independent of the component, but the convention quietly stops holding and a form full of
`oldName_label` keys is confusing. Renaming should offer to follow.

### A missing translation renders its key

Not an empty string. A label reading `email_label` is obviously wrong and gets fixed; an empty label
looks like a design choice and ships. Clearing a translation removes the entry rather than storing an
empty string, so the fallback comes back.

### Authoring

Each language gets a field beside the property, so translating does not mean navigating away from what is
being translated. The field carries the language's `dir`, so right-to-left copy is authored the right way
round.

Languages themselves are managed on the Form tab: add, remove, set the default, set writing direction.
The last language cannot be removed, and removing the current default moves it — a document naming a
language it does not have renders every translation as a raw key.

Removing a language leaves its bundle in the document. Dropping the text with it would make an accidental
removal unrecoverable except through undo, and an orphaned bundle costs nothing.

### What is not localised yet

**Planned.** Validation messages are plain strings, so a fully translated form still fails in English.
They should be `PropValue`. See [08-validation.md](08-validation.md#messages).

## The active language

**Status: partial.** `FormRenderer` takes a `language` prop and falls back to `document.defaultLanguage`.
The designer never passes it, so the canvas always shows the default and there is no way to see the form
in another language while building it.

**Planned:** a language selector in the toolbar that sets the canvas language. See
[04-shell.md](04-shell.md).

## Why a tagged union

The alternative — one bag of fields where the presence of `expression` means "this is computed" — is what
the studied product uses. A tagged union means every consumer switches on `kind` exhaustively, so adding
a fourth mode is a compile error at every call site rather than a silent fallthrough at some of them.

It also makes "which mode is this in" a question with an answer, which is what lets the panel show one
picker instead of inferring intent from which fields happen to be filled in.
