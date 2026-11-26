# Localization

Which languages a form has, how its text is translated, which language a respondent sees, and which way it reads. Area code `LOC`.

Translated validation messages and missing message keys belong to `VAL` (VAL-MSG-04, VAL-MSG-05); languages and translations in an exported file belong to `DOC` (DOC-JSON-02); keeping the canvas language out of the document is DOC-SAVE-04. The binding mode switch itself belongs to `CONF`. Screen-reader behaviour beyond declaring the language belongs to `A11Y`.

## Languages (LANG)

| ID          | Requirement                                                                                                                                    | Pri | Verify | Status   |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | --- | ------ | -------- |
| LOC-LANG-01 | The system shall identify each language of a form by its full language tag, the language code joined to any region.                            | P1  | Test   | Accepted |
| LOC-LANG-02 | The system shall reject a document whose default language is not one of its languages.                                                         | P1  | Test   | Accepted |
| LOC-LANG-03 | The system shall reject a document in which a language has no code, no name, or a writing direction other than left to right or right to left. | P1  | Test   | Accepted |
| LOC-LANG-04 | The system shall load a document holding translations for a language the form does not list.                                                   | P1  | Test   | Accepted |
| LOC-LANG-05 | The system shall let an author add a language by entering its code, with an optional region.                                                   | P1  | Test   | Accepted |
| LOC-LANG-06 | The system shall accept a two- or three-letter language code, alone or followed by a two-letter or three-digit region.                         | P2  | Test   | Accepted |
| LOC-LANG-07 | The system shall refuse, with a reason, a language code it cannot accept, rather than adding a shortened form of it.                           | P1  | Test   | Accepted |
| LOC-LANG-08 | The system shall refuse to add a language whose tag the form already has, ignoring letter case.                                                | P1  | Test   | Accepted |
| LOC-LANG-09 | The system shall show a language's tag wherever it names a language that has no display name.                                                  | P3  | Test   | Accepted |
| LOC-LANG-10 | The system shall let an author choose which of a form's languages is the default.                                                              | P1  | Test   | Accepted |
| LOC-LANG-11 | The system shall let an author remove a language from a form.                                                                                  | P1  | Test   | Accepted |
| LOC-LANG-12 | The system shall not let an author remove a form's last language.                                                                              | P1  | Test   | Accepted |
| LOC-LANG-13 | The system shall make the first remaining language the default when the author removes the default language.                                   | P1  | Test   | Accepted |
| LOC-LANG-14 | The system shall keep a removed language's translations in the document.                                                                       | P2  | Test   | Accepted |
| LOC-LANG-15 | The system shall show a rendered form in the language the host selects.                                                                        | P1  | Test   | Accepted |
| LOC-LANG-16 | The system shall show a rendered form in its default language when the host selects none.                                                      | P1  | Test   | Accepted |
| LOC-LANG-17 | The system shall select a form language only by its full tag, so that a bare language code does not select a regional variant of it.           | P2  | Test   | Accepted |
| LOC-LANG-18 | The system shall declare the language a rendered form is shown in.                                                                             | P1  | Test   | Accepted |
| LOC-LANG-19 | The system shall offer the author a choice of the language the canvas shows whenever the form has two or more languages.                       | P2  | Test   | Accepted |
| LOC-LANG-20 | The system shall show the canvas's labels and other text in the language chosen for it.                                                        | P1  | Test   | Accepted |
| LOC-LANG-21 | The system shall report validation messages in Preview in the language chosen for the canvas.                                                  | P2  | Test   | Accepted |
| LOC-LANG-22 | The system shall show the canvas in the default language once the language it was showing is removed.                                          | P1  | Test   | Accepted |

- LOC-LANG-01: source: docs/spec/01-document-model.md "Language identity is a tag, never a code"; packages/core/src/language.test.ts "findLanguage across dialects of one code".
- LOC-LANG-02: source: docs/spec/01-document-model.md "FormDocument" (`defaultLanguage` matches some language's tag); packages/core/src/tree.test.ts "reports a defaultLanguage that is not in the language list".
- LOC-LANG-03: source: docs/spec/10-interchange.md "Pasted JSON is untrusted input" ("language metadata"); packages/core/src/tree.test.ts "rejects a language entry missing the parts the renderer reads".
- LOC-LANG-04: source: packages/core/src/tree.test.ts "does not care which languages the bundle names". A test is the only source; LOC-LANG-14 depends on it.
- LOC-LANG-05: source: docs/spec/07-bindings.md "Authoring"; docs/spec/04-shell.md "Tabbed left pane"; packages/designer/src/panels/Binding.test.tsx "adds a language" and "splits a region subtag out of the code it was typed with".
- LOC-LANG-06: source: packages/designer/src/panels/Binding.test.tsx "takes a numeric region, which is a tag as much as a lettered one" and "splits a region subtag out of the code it was typed with". Tests are the only source; a script subtag (`zh-Hans-CN`) is refused.
- LOC-LANG-07: source: packages/designer/src/panels/Binding.test.tsx "refuses a script subtag by name rather than truncating it", "refuses a code that is not a tag at all" and "refuses an empty language code instead of adding a blank row"; docs/accessibility.md "Screen readers" (a refused language is announced). Tests are the only source of the rule itself.
- LOC-LANG-08: source: packages/designer/src/panels/Binding.test.tsx "refuses a duplicate language code" and "refuses a duplicate that differs only in case". Tests are the only source.
- LOC-LANG-09: source: packages/designer/src/panels/Binding.test.tsx "adds a language with no name rather than inventing one from the code"; packages/designer/src/language.ts (`nameOf`). A test and the code are the only source.
- LOC-LANG-10: source: docs/spec/07-bindings.md "Authoring"; packages/designer/src/panels/Binding.test.tsx "changes the default language".
- LOC-LANG-11: source: docs/spec/07-bindings.md "Authoring".
- LOC-LANG-12: source: docs/spec/07-bindings.md "Authoring"; packages/designer/src/panels/Binding.test.tsx "will not remove the last language".
- LOC-LANG-13: source: docs/spec/07-bindings.md "Authoring" ("removing the current default moves it"); packages/designer/src/store.regressions.test.ts "moves the default only when the language it names is removed". Which language it moves to (the first remaining) is stated only by packages/designer/src/store.ts (`setLanguages`).
- LOC-LANG-14: source: docs/spec/07-bindings.md "Authoring" ("Removing a language leaves its bundle in the document"). Adding the same tag again therefore finds its translations.
- LOC-LANG-15: source: docs/spec/07-bindings.md "The active language"; docs/spec/12-api.md "Rendering a form" (`language`); packages/renderer/src/renderer.test.tsx "follows the language the host asked for".
- LOC-LANG-16: source: docs/spec/07-bindings.md "The active language"; packages/renderer/src/renderer.test.tsx "resolves the label through the default language bundle".
- LOC-LANG-17: source: docs/spec/01-document-model.md "Language identity is a tag, never a code"; packages/renderer/src/renderer.test.tsx "reads the bundle by tag, not by bare code".
- LOC-LANG-18: source: docs/accessibility.md (target WCAG 2.2 AA, which requires the language of the page and of its parts to be declared); docs/srs/README.md "Scope". Not built: the renderer marks no element with the active language. Not met yet (issue 257).
- LOC-LANG-19: source: docs/spec/04-shell.md "Toolbar" (Language); docs/spec/07-bindings.md "The active language"; packages/designer/src/Designer.test.tsx "is absent when the document has only one language".
- LOC-LANG-20: source: docs/spec/07-bindings.md "The active language"; packages/designer/src/Designer.test.tsx "renders the canvas in the chosen language"; e2e/authoring.spec.ts "a translated label reaches the canvas".
- LOC-LANG-21: source: packages/designer/src/panels/Canvas.tsx (validation in Preview reads the canvas language's bundle). The code is the only source.
- LOC-LANG-22: source: docs/spec/04-shell.md "Toolbar"; docs/spec/07-bindings.md "The active language"; packages/designer/src/Designer.test.tsx "falls back when the language it is showing is removed" and "forgets the removed language rather than waiting for it to come back".

## Translations (TRN)

| ID         | Requirement                                                                                                                                                                                                                 | Pri | Verify | Status   |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --- | ------ | -------- |
| LOC-TRN-01 | The system shall let a translator translate every piece of respondent-facing text in the standard kits, including labels, placeholders, helper text, headings, button and link text, image descriptions and landmark names. | P1  | Test   | Accepted |
| LOC-TRN-02 | The system should let a translator translate the label of each choice in a Select or a Radio group.                                                                                                                         | P2  | Test   | Accepted |
| LOC-TRN-03 | The system shall let an author translate a rule's validation message beside the rule, in every language of the form.                                                                                                        | P1  | Test   | Accepted |
| LOC-TRN-04 | The system shall show one translation field per language of the form beside the property being translated.                                                                                                                  | P1  | Test   | Accepted |
| LOC-TRN-05 | The system shall name each translation field after its language and mark the default language's field.                                                                                                                      | P2  | Test   | Accepted |
| LOC-TRN-06 | The system shall propose a translation key made from the component's key and the property's name when a property becomes translated.                                                                                        | P2  | Test   | Accepted |
| LOC-TRN-07 | The system shall let an author change a property's translation key.                                                                                                                                                         | P1  | Test   | Accepted |
| LOC-TRN-08 | The system shall show the same translated text in every property that uses the same translation key.                                                                                                                        | P1  | Test   | Accepted |
| LOC-TRN-09 | The system shall, when the author changes a property's translation key, copy its translations to the new key without overwriting any the new key holds, and leave the old key's translations in place.                      | P2  | Test   | Accepted |
| LOC-TRN-10 | The system shall leave translation keys and their translations unchanged when a component is renamed.                                                                                                                       | P1  | Test   | Accepted |
| LOC-TRN-11 | The system shall store each translation under the full tag of its language.                                                                                                                                                 | P1  | Test   | Accepted |
| LOC-TRN-12 | The system shall remove a translation, rather than keep empty text, when the translator clears it.                                                                                                                          | P1  | Test   | Accepted |
| LOC-TRN-13 | The system shall show a translated property's key where the selected language has no translation for it.                                                                                                                    | P1  | Test   | Accepted |
| LOC-TRN-14 | The system shall reject a document holding a translation that is not text.                                                                                                                                                  | P1  | Test   | Accepted |
| LOC-TRN-15 | The system shall show the key where a document that reached it without being loaded holds a translation that is not text.                                                                                                   | P2  | Test   | Accepted |
| LOC-TRN-16 | The system shall show the key, never a built-in object property, for a translation key the language does not hold that is also a built-in object property name.                                                             | P2  | Test   | Accepted |
| LOC-TRN-17 | The system shall apply the selected language's translations in every row of a repeated group.                                                                                                                               | P2  | Test   | Accepted |

- LOC-TRN-01: source: docs/spec/07-bindings.md "Which modes a property offers" ("Kits mark labels, placeholders, helper text, headings and button copy"); docs/spec/03-components.md "Shared property traits"; docs/spec/02-kit-contract.md "Accessibility from ordinary properties" (a localizable name property); test/kit-contract.test.tsx "a breadcrumb landmark in the form language". Which properties are translatable is decided by each kit; this row holds the standard kits to it.
- LOC-TRN-02: source: docs/spec/00-product.md "Who uses it" (the translator supplies localized labels); docs/srs/README.md user class Translator. Not built: `options` is static JSON in both kits (packages/kit-html/src/definitions.ts), so only Radio item children can carry translated choice labels. Not built yet.
- LOC-TRN-03: source: docs/spec/07-bindings.md "Validation messages"; docs/spec/08-validation.md "Messages"; packages/designer/src/panels/Rules.test.tsx "authors a translated validation message". Reporting the message is VAL-MSG-04.
- LOC-TRN-04: source: docs/spec/07-bindings.md "Authoring"; docs/spec/00-product.md "Who uses it" (translation should not require JSON editing).
- LOC-TRN-05: source: packages/designer/src/panels/Binding.tsx (`TranslationEditor`); packages/designer/src/panels/Binding.test.tsx "writes a translation per language, under the tag rather than the code". The code and a test are the only source.
- LOC-TRN-06: source: docs/spec/07-bindings.md "Keys"; packages/designer/src/panels/Binding.test.tsx "seeds a translation binding with the conventional key".
- LOC-TRN-07, LOC-TRN-08: source: docs/spec/07-bindings.md "Keys" ("which is what makes two components able to share one string").
- LOC-TRN-09: source: packages/designer/src/panels/Binding.test.tsx "carries the text with the key". A test is the only source. Reworded before acceptance: the code moves the text and deletes the old key's, which empties every other property still using that key, and overwrites text the new key holds.
- LOC-TRN-10: source: docs/spec/07-bindings.md "Keys" ("Renaming a component does not rewrite them or their bundles").
- LOC-TRN-11: source: docs/spec/01-document-model.md "Language identity is a tag, never a code"; packages/designer/src/panels/Binding.test.tsx "writes a translation per language, under the tag rather than the code".
- LOC-TRN-12: source: docs/spec/07-bindings.md "A missing translation renders its key"; packages/designer/src/panels/Binding.test.tsx "drops a translation rather than storing an empty string".
- LOC-TRN-13: source: docs/spec/07-bindings.md "A missing translation renders its key" and "The four modes"; packages/renderer/src/renderer.test.tsx "falls back to the key when the language has no such translation". VAL-MSG-05 is the same behaviour for validation messages.
- LOC-TRN-14: source: packages/core/src/tree.test.ts "rejects a translation that is not text" and "rejects a language bundle that is %s". Tests are the only source.
- LOC-TRN-15: source: packages/renderer/src/renderer.test.tsx "a translation that is not text" and "a document whose translations are not a bundle". Tests are the only source; FILL-RES-08 is the general case.
- LOC-TRN-16: source: packages/renderer/src/renderer.test.tsx "does not find a translation on Object.prototype". A test is the only source.
- LOC-TRN-17: source: docs/accessibility.md "Enforced by tests"; test/kit-descriptions.test.tsx "keeps translated repeater help and errors scoped to each form"; test/kit-required.test.tsx.

## Writing direction (DIR)

| ID         | Requirement                                                                                                        | Pri | Verify | Status   |
| ---------- | ------------------------------------------------------------------------------------------------------------------ | --- | ------ | -------- |
| LOC-DIR-01 | The system shall let an author set each language of a form to read left to right or right to left.                 | P1  | Test   | Accepted |
| LOC-DIR-02 | The system shall show each translation field in the writing direction of its language.                             | P1  | Test   | Accepted |
| LOC-DIR-03 | The system shall lay out a rendered form right to left while the language it is shown in reads right to left.      | P1  | Test   | Accepted |
| LOC-DIR-04 | The system shall show the canvas in the writing direction of the language it is showing.                           | P1  | Test   | Accepted |
| LOC-DIR-05 | The system shall mirror the standard kits' layout, spacing and borders in a form laid out right to left.           | P2  | Test   | Accepted |
| LOC-DIR-06 | The system shall place text aligned to start or end at the start or end of the form's writing direction.           | P2  | Test   | Accepted |
| LOC-DIR-07 | The system should lay out the designer's own panes and controls right to left when the host page is right to left. | P3  | Test   | Accepted |

- LOC-DIR-01: source: docs/spec/07-bindings.md "Authoring" ("set writing direction"); README.md "Localization"; packages/designer/src/panels/Binding.test.tsx "turns a language right to left, and the boxes follow" and "turns it back again".
- LOC-DIR-02: source: docs/spec/07-bindings.md "Authoring" ("The field carries the language's `dir`"); packages/designer/src/panels/Binding.test.tsx "marks a right-to-left language on its input".
- LOC-DIR-03: source: docs/srs/README.md "Scope" ("left to right and right to left"); apps/demo-server/src/index.ts (says a language's direction "becomes the `dir` attribute"). Not built: the renderer applies no direction, so a host must set it. Not met yet (issue 257).
- LOC-DIR-04: source: docs/spec/07-bindings.md "The active language" ("a form can be seen in any of its languages while it is being built"). Not built, for the same reason as LOC-DIR-03.
- LOC-DIR-05: source: packages/kit-html/src/kit-html.css (start and end sides rather than left and right). The code is the only source; nothing checks it in a browser, and the Material UI kit is unchecked.
- LOC-DIR-06: source: packages/kit-html/src/definitions.ts (Text `align` offers Start, Center and End). The code is the only source.
- LOC-DIR-07: source: packages/designer/src/designer.css (start and end sides rather than left and right). The code is the only source.
