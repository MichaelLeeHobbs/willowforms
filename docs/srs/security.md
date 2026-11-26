# Security

What a hostile form document, hostile submitted data, or author-written code must not be able to do. Area code `SEC`.

The host and its kits are trusted application code (`docs/THREAT_MODEL.md`), so nothing here protects against them.

## Untrusted documents (DOCS)

| ID          | Requirement                                                                                                               | Pri | Verify     | Status   |
| ----------- | ------------------------------------------------------------------------------------------------------------------------- | --- | ---------- | -------- |
| SEC-DOCS-01 | The system shall make a link from a document only to an http, https, mailto, tel or relative address.                     | P1  | Test       | Accepted |
| SEC-DOCS-02 | The system shall show a link with a refused address as plain text.                                                        | P1  | Test       | Accepted |
| SEC-DOCS-03 | The system shall refuse a link address that names another host without a scheme.                                          | P1  | Test       | Accepted |
| SEC-DOCS-04 | The system shall load an image only from an http, https or relative address, or from image data embedded in the document. | P1  | Test       | Accepted |
| SEC-DOCS-05 | The system shall refuse embedded image data that is not PNG, JPEG, WebP or GIF.                                           | P1  | Test       | Accepted |
| SEC-DOCS-06 | The system shall refuse embedded image data larger than 2 MiB per image.                                                  | P2  | Test       | Accepted |
| SEC-DOCS-07 | The system shall confine a component's authored styling to that component's own element.                                  | P1  | Test       | Accepted |
| SEC-DOCS-08 | The system shall confine a form's authored styling to that form when several are on one page.                             | P1  | Test       | Accepted |
| SEC-DOCS-09 | The system shall refuse authored styling that would make the page fetch a resource.                                       | P1  | Test       | Accepted |
| SEC-DOCS-10 | The system shall leave out refused styling rather than apply an altered version of it.                                    | P1  | Test       | Accepted |
| SEC-DOCS-11 | The system shall tell the author when styling is refused.                                                                 | P1  | Test       | Accepted |
| SEC-DOCS-12 | The system shall not download or execute code because a document names a component type.                                  | P1  | Inspection | Accepted |

- SEC-DOCS-01, SEC-DOCS-02: source: docs/spec/03-components.md "Display" (Link); docs/THREAT_MODEL.md "Required controls".
- SEC-DOCS-03: source: packages/core/src/json.test.ts "refuses a network-path reference, which is not relative at all". A test is the only source.
- SEC-DOCS-04, SEC-DOCS-05, SEC-DOCS-06: source: docs/THREAT_MODEL.md "Required controls"; docs/spec/06-inspector.md "Image sources and decorative backgrounds".
- SEC-DOCS-07, SEC-DOCS-08, SEC-DOCS-09, SEC-DOCS-10, SEC-DOCS-11: source: docs/spec/06-inspector.md "It applies to the component's own element only".
- SEC-DOCS-12: source: docs/spec/02-kit-contract.md "Community component packages".

## Author code (CODE)

| ID          | Requirement                                                                                                                | Pri | Verify     | Status   |
| ----------- | -------------------------------------------------------------------------------------------------------------------------- | --- | ---------- | -------- |
| SEC-CODE-01 | The system shall not include an evaluator for author-written code.                                                         | P1  | Inspection | Accepted |
| SEC-CODE-02 | The system shall not execute author-written code when the host supplies no evaluator for it.                               | P1  | Test       | Accepted |
| SEC-CODE-03 | The system shall accept only the defined kinds of effect from an action.                                                   | P1  | Test       | Accepted |
| SEC-CODE-04 | The system shall reject the whole batch of effects when one of them is unknown or malformed, before the host receives any. | P1  | Test       | Accepted |
| SEC-CODE-05 | The system shall give an action no host capability other than returning effects.                                           | P1  | Inspection | Accepted |
| SEC-CODE-06 | The system shall reject an effect carrying more than 10,000 values.                                                        | P3  | Test       | Deferred |

- SEC-CODE-01: source: docs/THREAT_MODEL.md "Required controls"; docs/RELEASING.md "Stop conditions".
- SEC-CODE-02: source: docs/spec/09-actions.md "Security boundary".
- SEC-CODE-03, SEC-CODE-04, SEC-CODE-05: source: docs/spec/09-actions.md "Effects".
- SEC-CODE-06: source: packages/core/src/actions.ts (`ACTION_VALUE_LIMIT`). docs/spec/09-actions.md says only "bounded JSON"; the number is stated nowhere.

## Submitted data (DATA)

| ID          | Requirement                                                                                                     | Pri | Verify | Status   |
| ----------- | --------------------------------------------------------------------------------------------------------------- | --- | ------ | -------- |
| SEC-DATA-01 | The system shall not read host context from submitted answers.                                                  | P1  | Test   | Accepted |
| SEC-DATA-02 | The system shall reject a repeated group whose submitted value is not a list.                                   | P1  | Test   | Accepted |
| SEC-DATA-03 | The system shall take the number of rows to check from the submitted list, never from a count the client sends. | P1  | Test   | Accepted |
| SEC-DATA-04 | The system shall leave answers unchanged when a change is addressed to a reserved or malformed name.            | P1  | Test   | Accepted |
| SEC-DATA-05 | The system shall leave answers unchanged when a change is addressed to a row that cannot be placed.             | P1  | Test   | Accepted |
| SEC-DATA-06 | The system shall report a missing required answer whose name is also a built-in object property name.           | P1  | Test   | Accepted |
| SEC-DATA-07 | The system shall submit an answer whose name is also a built-in object property name as an ordinary answer.     | P1  | Test   | Accepted |
| SEC-DATA-08 | The system shall read only the host's own values through a context path.                                        | P1  | Test   | Accepted |

- SEC-DATA-01: source: docs/spec/08-validation.md "The evaluator"; docs/THREAT_MODEL.md "Trust boundaries".
- SEC-DATA-02, SEC-DATA-03: source: docs/spec/08-validation.md "The API".
- SEC-DATA-04, SEC-DATA-05: source: docs/spec/12-api.md "What `onChange` reports is an address, not a key" and "Keys".
- SEC-DATA-06, SEC-DATA-07: source: docs/spec/12-api.md "Keys" and "What a form actually submits".
- SEC-DATA-08: source: docs/spec/12-api.md "Context".

## Limits (LIM)

| ID         | Requirement                                                                                      | Pri | Verify   | Status   |
| ---------- | ------------------------------------------------------------------------------------------------ | --- | -------- | -------- |
| SEC-LIM-01 | The system shall reject a repeated group of more than 5000 rows without checking any of them.    | P1  | Test     | Accepted |
| SEC-LIM-02 | The system shall leave a repeated group of more than 5000 rows out of the submission it derives. | P2  | Test     | Accepted |
| SEC-LIM-03 | The system shall report an error for a part of a form nested more than 500 components deep.      | P1  | Test     | Accepted |
| SEC-LIM-04 | The system shall check a pattern in time proportional to the length of the answer.               | P1  | Analysis | Accepted |
| SEC-LIM-05 | The system shall refuse a pattern longer than 1024 characters.                                   | P2  | Test     | Accepted |
| SEC-LIM-06 | The system shall refuse a pattern that compiles to more than 512 instructions.                   | P2  | Test     | Accepted |
| SEC-LIM-07 | The system shall reject an answer longer than 4096 characters under a pattern rule.              | P1  | Test     | Accepted |
| SEC-LIM-08 | The system shall show the author why a pattern is refused.                                       | P1  | Test     | Accepted |
| SEC-LIM-09 | The system shall treat a condition nested more than 200 levels deep as one it cannot read.       | P2  | Test     | Accepted |

- SEC-LIM-01, SEC-LIM-03: source: docs/spec/08-validation.md "The API".
- SEC-LIM-02: source: packages/core/src/validation.test.ts "the row cap on the projection". A test is the only source.
- SEC-LIM-04, SEC-LIM-05, SEC-LIM-06, SEC-LIM-07, SEC-LIM-08: source: docs/spec/08-validation.md "Every failure degrades rather than throws"; docs/THREAT_MODEL.md "Required controls".
- SEC-LIM-09: source: packages/core/src/condition.ts (`MAX_CONDITION_DEPTH`). No document states the limit.
