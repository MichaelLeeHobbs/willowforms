# Form documents

Getting a form definition in and out: loading, migrating, importing, exporting, and handing edits to the host. Area code `DOC`.

The exact shape of a document is an interface, not an area. Hostile documents belong to `SEC`.

## Loading and migration (LOAD)

| ID          | Requirement                                                                                                                            | Pri | Verify | Status   |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------- | --- | ------ | -------- |
| DOC-LOAD-01 | The system shall answer a request to load any value with either a usable document or the reasons it is not one.                        | P1  | Test   | Proposed |
| DOC-LOAD-02 | The system shall not change the value it was given to load.                                                                            | P1  | Test   | Proposed |
| DOC-LOAD-03 | The system shall load a document of an earlier published version as a document of the current version.                                 | P1  | Test   | Proposed |
| DOC-LOAD-04 | The system shall reject a document whose version it cannot bring to the current version.                                               | P1  | Test   | Proposed |
| DOC-LOAD-05 | The system shall load a current-version document that omits its settings or actions.                                                   | P1  | Test   | Proposed |
| DOC-LOAD-06 | The system shall report every structural problem it finds in a document, not only the first.                                           | P1  | Test   | Proposed |
| DOC-LOAD-07 | The system shall reject a document in which two components have the same key.                                                          | P1  | Test   | Proposed |
| DOC-LOAD-08 | The system shall accept a document in which two components share an answer name.                                                       | P1  | Test   | Proposed |
| DOC-LOAD-09 | The system shall reject a component key or answer name that is not a letter or underscore followed by letters, digits and underscores. | P1  | Test   | Proposed |
| DOC-LOAD-10 | The system shall reject a component key or answer name longer than 128 characters.                                                     | P1  | Test   | Proposed |
| DOC-LOAD-11 | The system shall reject a component key or answer name that is a reserved built-in object name.                                        | P1  | Test   | Proposed |
| DOC-LOAD-12 | The system shall reject a condition or comparison that reads an answer its scope cannot reach.                                         | P1  | Test   | Proposed |
| DOC-LOAD-13 | The system shall reject a reference to a code action the document does not define.                                                     | P1  | Test   | Proposed |
| DOC-LOAD-14 | The system shall load, unchanged, a component whose type no kit offers.                                                                | P1  | Test   | Proposed |
| DOC-LOAD-15 | The system shall reject a document of more than 1,000,000 values with a reason that names the limit.                                   | P2  | Test   | Proposed |
| DOC-LOAD-16 | The system shall reject a document nested more than 500 components deep.                                                               | P2  | Test   | Proposed |

- DOC-LOAD-01, DOC-LOAD-02, DOC-LOAD-03, DOC-LOAD-04, DOC-LOAD-05: source: docs/spec/01-document-model.md "Versioning and migration". DOC-LOAD-03 cannot be shown until a second version exists.
- DOC-LOAD-06: source: e2e/document.spec.ts "every missing field is named at once, not one at a time"; docs/spec/10-interchange.md "Pasted JSON is untrusted input".
- DOC-LOAD-07: source: docs/spec/01-document-model.md "key".
- DOC-LOAD-08: source: docs/spec/01-document-model.md "dataKey".
- DOC-LOAD-09, DOC-LOAD-10, DOC-LOAD-11: source: docs/spec/12-api.md "Keys".
- DOC-LOAD-12: source: docs/spec/12-api.md "A row's own scope"; docs/spec/08-validation.md "Cross-field rules".
- DOC-LOAD-13: source: docs/spec/09-actions.md "Model".
- DOC-LOAD-14: source: docs/COMPATIBILITY.md "Pre-beta corrections"; test/attachment-compatibility.test.tsx.
- DOC-LOAD-15: source: docs/spec/01-document-model.md "Versioning and migration".
- DOC-LOAD-16: source: packages/core/src/tree.ts (`MAX_TREE_DEPTH`); docs/spec/08-validation.md "The API" states the limit for validation.

## Import and export (JSON)

| ID          | Requirement                                                                                                    | Pri | Verify        | Status   |
| ----------- | -------------------------------------------------------------------------------------------------------------- | --- | ------------- | -------- |
| DOC-JSON-01 | The system shall let an author save the whole form as one file.                                                | P1  | Demonstration | Proposed |
| DOC-JSON-02 | The system shall include the form's languages, translations, actions and document version in that file.        | P1  | Test          | Proposed |
| DOC-JSON-03 | The system shall reproduce an equal document when an exported file is imported.                                | P1  | Test          | Proposed |
| DOC-JSON-04 | The system shall place an imported file in an editable draft without changing the form.                        | P1  | Test          | Proposed |
| DOC-JSON-05 | The system shall replace the form only with a draft that loads.                                                | P1  | Test          | Proposed |
| DOC-JSON-06 | The system shall show why a draft was refused beside the still-editable draft.                                 | P1  | Test          | Proposed |
| DOC-JSON-07 | The system shall report malformed JSON separately from a document that does not load.                          | P2  | Test          | Proposed |
| DOC-JSON-08 | The system shall refuse an import file larger than 10 MiB.                                                     | P2  | Test          | Proposed |
| DOC-JSON-09 | The system shall state the import size limit before a file is chosen.                                          | P2  | Test          | Proposed |
| DOC-JSON-10 | The system shall discard a file read that finishes after a newer file selection, edit, revert, apply or close. | P2  | Test          | Proposed |
| DOC-JSON-11 | The system shall let an author undo the replacement of a form by an applied draft.                             | P1  | Test          | Proposed |
| DOC-JSON-12 | The system shall let an author return the draft to the current form.                                           | P2  | Test          | Proposed |
| DOC-JSON-13 | The system should let an author copy the document text.                                                        | P3  | Demonstration | Proposed |

- DOC-JSON-01, DOC-JSON-02, DOC-JSON-03: source: docs/spec/10-interchange.md "Simple import and export". Equality after a round trip is implied there, not stated.
- DOC-JSON-04, DOC-JSON-08, DOC-JSON-09, DOC-JSON-10, DOC-JSON-12, DOC-JSON-13: source: docs/spec/10-interchange.md "The JSON dialog".
- DOC-JSON-05, DOC-JSON-06, DOC-JSON-07: source: docs/spec/10-interchange.md "Pasted JSON is untrusted input".
- DOC-JSON-11: source: docs/spec/12-api.md "Undo".

## Schema export (SCH)

| ID         | Requirement                                                                                                    | Pri | Verify | Status   |
| ---------- | -------------------------------------------------------------------------------------------------------------- | --- | ------ | -------- |
| DOC-SCH-01 | The system shall produce a JSON Schema of a form's submitted data.                                             | P2  | Test   | Proposed |
| DOC-SCH-02 | The system shall leave layout out of the schema.                                                               | P2  | Test   | Proposed |
| DOC-SCH-03 | The system shall describe a repeated group as a list of rows in the schema.                                    | P2  | Test   | Proposed |
| DOC-SCH-04 | The system shall name each rule the schema does not carry, and the question it was on.                         | P1  | Test   | Proposed |
| DOC-SCH-05 | The system shall not make a rule that applies only sometimes unconditional in the schema.                      | P1  | Test   | Proposed |
| DOC-SCH-06 | The system shall require a required yes/no question to be true in the schema, where the rule is unconditional. | P2  | Test   | Proposed |
| DOC-SCH-07 | The system shall not claim an encoding for a file answer in the schema.                                        | P2  | Test   | Proposed |
| DOC-SCH-08 | The system shall report each answer name that several components share.                                        | P2  | Test   | Proposed |
| DOC-SCH-09 | The system shall show an author the list of rules the schema does not carry.                                   | P2  | Test   | Proposed |

- DOC-SCH-01, DOC-SCH-02, DOC-SCH-03, DOC-SCH-07: source: docs/spec/10-interchange.md "JSON Schema export".
- DOC-SCH-04, DOC-SCH-05, DOC-SCH-06, DOC-SCH-08, DOC-SCH-09: source: docs/spec/10-interchange.md "What it cannot carry".

## Handing over (SAVE)

| ID          | Requirement                                                              | Pri | Verify     | Status   |
| ----------- | ------------------------------------------------------------------------ | --- | ---------- | -------- |
| DOC-SAVE-01 | The system shall give the host the new document after each edit.         | P1  | Test       | Proposed |
| DOC-SAVE-02 | The system shall not store a form document itself.                       | P1  | Inspection | Proposed |
| DOC-SAVE-03 | The system shall offer a Save control only when the host handles saving. | P1  | Test       | Proposed |
| DOC-SAVE-04 | The system shall keep an author's view preferences out of the document.  | P1  | Test       | Proposed |

- DOC-SAVE-01, DOC-SAVE-02, DOC-SAVE-03: source: docs/spec/10-interchange.md "WillowForms does not persist".
- DOC-SAVE-04: source: docs/spec/04-shell.md "Toolbar", "Resizable panes" and "Collapsible panes".
