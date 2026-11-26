# Validation

Which answers a form accepts, when each rule applies, what a respondent is told, and how a server checks the same thing. Area code `VAL`.

Limits that bound the work a submission can cause belong to `SEC`.

## Rules (RULE)

| ID          | Requirement                                                                                                       | Pri | Verify | Status   |
| ----------- | ----------------------------------------------------------------------------------------------------------------- | --- | ------ | -------- |
| VAL-RULE-01 | The system shall reject an empty answer to a required question.                                                   | P1  | Test   | Accepted |
| VAL-RULE-02 | The system shall treat a missing value, null, blank text, an empty list and an object with no fields as empty.    | P1  | Test   | Accepted |
| VAL-RULE-03 | The system shall treat zero as an answer.                                                                         | P1  | Test   | Accepted |
| VAL-RULE-04 | The system shall reject an unchecked box on a required yes/no question.                                           | P1  | Test   | Accepted |
| VAL-RULE-05 | The system shall accept an empty answer under every recognised rule other than required.                          | P1  | Test   | Accepted |
| VAL-RULE-06 | The system shall reject a non-empty answer whose type is not the question's data type.                            | P1  | Test   | Accepted |
| VAL-RULE-07 | The system shall reject text or a list whose length is outside the authored length bounds.                        | P1  | Test   | Accepted |
| VAL-RULE-08 | The system shall reject a list whose number of items is outside the authored item bounds.                         | P1  | Test   | Accepted |
| VAL-RULE-09 | The system shall reject a number outside the authored minimum and maximum, which are themselves accepted.         | P1  | Test   | Accepted |
| VAL-RULE-10 | The system shall reject text that is not an email address under an email rule.                                    | P1  | Test   | Accepted |
| VAL-RULE-11 | The system shall reject text that is not an http, https, mailto or tel URL under a URL rule.                      | P1  | Test   | Accepted |
| VAL-RULE-12 | The system shall reject text that is not a UUID under a UUID rule.                                                | P2  | Test   | Accepted |
| VAL-RULE-13 | The system shall reject text in which the authored pattern is found nowhere.                                      | P1  | Test   | Accepted |
| VAL-RULE-14 | The system shall reject an answer that differs from the answer a matches rule names.                              | P1  | Test   | Accepted |
| VAL-RULE-15 | The system shall reject an answer that is not later or greater than the answer an after rule names.               | P1  | Test   | Accepted |
| VAL-RULE-16 | The system shall reject an answer for which a custom rule's expression is false.                                  | P2  | Test   | Accepted |
| VAL-RULE-17 | The system shall reject any answer, including an empty one, under a rule it does not recognise.                   | P1  | Test   | Accepted |
| VAL-RULE-18 | The system shall reject a non-empty answer under a measuring rule whose bound is not a number.                    | P2  | Test   | Accepted |
| VAL-RULE-19 | The system shall reject a date answer earlier than its Date picker's earliest date or later than its latest date. | P2  | Test   | Accepted |
| VAL-RULE-20 | The system shall reject a date answer that is not a calendar date written as year, month and day.                 | P2  | Test   | Accepted |

- VAL-RULE-01, VAL-RULE-02, VAL-RULE-03, VAL-RULE-04, VAL-RULE-05: source: docs/spec/08-validation.md "Only `required` fails on an empty value" and "The rule catalogue".
- VAL-RULE-06: source: docs/spec/08-validation.md "Field schemas enforce value types".
- VAL-RULE-07, VAL-RULE-08, VAL-RULE-10, VAL-RULE-11, VAL-RULE-12, VAL-RULE-13: source: docs/spec/08-validation.md "The rule catalogue". That a pattern need not match the whole answer: "Every failure degrades rather than throws".
- VAL-RULE-09: source: docs/spec/08-validation.md "The rule catalogue"; packages/core/src/validation.test.ts "applies numeric bounds inclusively".
- VAL-RULE-14, VAL-RULE-15: source: docs/spec/08-validation.md "Cross-field rules".
- VAL-RULE-16: source: docs/spec/08-validation.md "The rule catalogue". A throwing evaluator is VAL-WHEN-09.
- VAL-RULE-17: source: docs/spec/08-validation.md "Only `required` fails on an empty value" (`UNREADABLE_RULE`).
- VAL-RULE-18: source: packages/core/src/validation.test.ts "a rule with no value to check against". A test is the only source.
- VAL-RULE-19: source: decided 2026-11-25 while accepting CAT-INP-07, which limits only the picker. Validation accepts any text for a date answer (packages/core/src/validation.ts `matchesFieldType`), so a server accepts dates outside the bounds.
- VAL-RULE-20: source: the same finding; packages/core/src/schema.ts exports a date answer with `format: date`, which validation does not check. Proposed alongside VAL-RULE-19, not asked for separately.

## When rules apply (WHEN)

| ID          | Requirement                                                                                              | Pri | Verify | Status   |
| ----------- | -------------------------------------------------------------------------------------------------------- | --- | ------ | -------- |
| VAL-WHEN-01 | The system shall not check a hidden question, or anything inside a hidden container.                     | P1  | Test   | Accepted |
| VAL-WHEN-02 | The system shall decide visibility identically when displaying a form and when validating it.            | P1  | Test   | Accepted |
| VAL-WHEN-03 | The system shall apply a guarded rule only while its guard holds.                                        | P1  | Test   | Accepted |
| VAL-WHEN-04 | The system shall evaluate structured conditions without a host evaluator.                                | P1  | Test   | Accepted |
| VAL-WHEN-05 | The system shall apply a rule whose guard it cannot read.                                                | P1  | Test   | Accepted |
| VAL-WHEN-06 | The system shall hide a component whose structured condition it cannot read.                             | P1  | Test   | Accepted |
| VAL-WHEN-07 | The system shall accept an answer under a custom rule when the host supplies no evaluator.               | P1  | Test   | Accepted |
| VAL-WHEN-08 | The system shall skip a rule with an expression guard when the host supplies no evaluator.               | P1  | Test   | Accepted |
| VAL-WHEN-09 | The system shall reject an answer when the evaluator fails on its custom rule.                           | P1  | Test   | Accepted |
| VAL-WHEN-10 | The system shall apply a rule when the evaluator fails on its guard.                                     | P1  | Test   | Accepted |
| VAL-WHEN-11 | The system shall hide a component whose visibility is an expression when the host supplies no evaluator. | P1  | Test   | Accepted |
| VAL-WHEN-12 | The system shall read only the enclosing row for a comparison or condition scoped to the row.            | P1  | Test   | Accepted |
| VAL-WHEN-13 | The system shall show a component whose visibility setting is of a kind it does not recognise.           | P2  | Test   | Accepted |

- VAL-WHEN-01, VAL-WHEN-02: source: docs/spec/08-validation.md "Validation and rendering agree about what is visible".
- VAL-WHEN-03, VAL-WHEN-04, VAL-WHEN-05, VAL-WHEN-08: source: docs/spec/08-validation.md "Guards".
- VAL-WHEN-06: source: docs/spec/01-document-model.md "Conditions" ("It is total").
- VAL-WHEN-07: source: docs/spec/08-validation.md "Every failure degrades rather than throws" and "The evaluator".
- VAL-WHEN-09, VAL-WHEN-10: source: packages/core/src/validation.test.ts "an evaluator that throws". A test is the only source.
- VAL-WHEN-11: source: docs/spec/01-document-model.md "renderWhen".
- VAL-WHEN-12: source: docs/spec/03-components.md "A condition says which scope it means"; docs/spec/08-validation.md "Cross-field rules".
- VAL-WHEN-13: source: packages/core/src/visibility.ts (the default case); the code is the only source.

## Messages (MSG)

| ID         | Requirement                                                                                             | Pri | Verify | Status   |
| ---------- | ------------------------------------------------------------------------------------------------------- | --- | ------ | -------- |
| VAL-MSG-01 | The system shall report the first failing rule of each question.                                        | P1  | Test   | Accepted |
| VAL-MSG-02 | The system shall give each rule a default message.                                                      | P1  | Test   | Accepted |
| VAL-MSG-03 | The system shall report the author's message in place of the default when the rule has one.             | P1  | Test   | Accepted |
| VAL-MSG-04 | The system shall report a translated message in the language the host selected.                         | P1  | Test   | Accepted |
| VAL-MSG-05 | The system shall show the translation key when the selected language has no such message.               | P2  | Test   | Accepted |
| VAL-MSG-06 | The system shall report the default message when the author's message is empty or unreadable.           | P1  | Test   | Accepted |
| VAL-MSG-07 | The system shall report the default message for a computed message when the host supplies no evaluator. | P2  | Test   | Accepted |

- VAL-MSG-01: source: docs/spec/08-validation.md "The API".
- VAL-MSG-02, VAL-MSG-03, VAL-MSG-04, VAL-MSG-05, VAL-MSG-06, VAL-MSG-07: source: docs/spec/08-validation.md "Messages".

## Server parity (SRV)

| ID         | Requirement                                                                                                                                | Pri | Verify | Status   |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------ | --- | ------ | -------- |
| VAL-SRV-01 | The system shall produce the same validation result in a browser and on a server, given the same document, answers, context and evaluator. | P1  | Test   | Accepted |
| VAL-SRV-02 | The system shall validate every step the host names in one call.                                                                           | P1  | Test   | Accepted |
| VAL-SRV-03 | The system shall list a form's steps from its document alone.                                                                              | P1  | Test   | Accepted |
| VAL-SRV-04 | The system shall check a step whatever JSON value names it.                                                                                | P1  | Test   | Accepted |
| VAL-SRV-05 | The system shall make it detectable when a document names more steps than it lists.                                                        | P1  | Test   | Accepted |
| VAL-SRV-06 | The system shall name the context a document reads that the host did not supply.                                                           | P1  | Test   | Accepted |
| VAL-SRV-07 | The system shall count context holding false or zero as supplied.                                                                          | P1  | Test   | Accepted |
| VAL-SRV-08 | The system shall name the components that cannot be evaluated without an evaluator.                                                        | P1  | Test   | Accepted |
| VAL-SRV-09 | The system shall not require a browser or a user-interface library to validate a form.                                                     | P1  | Test   | Accepted |

- VAL-SRV-01: source: docs/spec/08-validation.md "Server parity"; docs/spec/00-product.md "Who uses it".
- VAL-SRV-02, VAL-SRV-03: source: docs/spec/08-validation.md "The wizard case, which is not the same call".
- VAL-SRV-04: source: docs/BETA_REVIEW.md "Fixes in this review" (numeric and other JSON step identities). The recipe in docs/spec/08-validation.md kept only text until PR 255 (issue 247) changed it to match this row.
- VAL-SRV-05: source: packages/core/src/context.ts (`MAX_CONTEXT_VALUES`, 1000); packages/core/src/context.test.ts "lets a caller see that it truncated". No document states the limit.
- VAL-SRV-06, VAL-SRV-07: source: docs/spec/12-api.md "The quiet failure, and where it is caught".
- VAL-SRV-08: source: docs/spec/12-api.md "Four core functions a host has to call" (`evaluatorKeys`).
- VAL-SRV-09: source: docs/spec/08-validation.md (opening); CLAUDE.md invariant 1.
