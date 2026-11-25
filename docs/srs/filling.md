# Completing a form

What a respondent sees and answers, and what the host receives. Area code `FILL`.

Repeated rows and step navigation belong to `FLOW`. How labels, errors and focus reach assistive technology belongs to `A11Y`.

## Answers (ANS)

| ID          | Requirement                                                                                                           | Pri | Verify | Status   |
| ----------- | --------------------------------------------------------------------------------------------------------------------- | --- | ------ | -------- |
| FILL-ANS-01 | The system shall report each change a respondent makes to an answer to the host, with the address of that answer.     | P1  | Test   | Proposed |
| FILL-ANS-02 | The system shall display exactly the answer values the host supplies.                                                 | P1  | Test   | Proposed |
| FILL-ANS-03 | The system shall leave an answer in the host's data when the question that collected it becomes hidden.               | P1  | Test   | Proposed |
| FILL-ANS-04 | The system shall display the retained answer when a hidden question is shown again.                                   | P1  | Test   | Proposed |
| FILL-ANS-05 | The system shall show a component only while its visibility condition holds for the current answers and host context. | P1  | Test   | Proposed |
| FILL-ANS-06 | The system shall hide everything inside a hidden container.                                                           | P1  | Test   | Proposed |
| FILL-ANS-07 | The system shall report a chosen option as the value its author declared, with its JSON type.                         | P1  | Test   | Proposed |
| FILL-ANS-08 | The system shall display the same answer in every question that shares an answer name.                                | P2  | Test   | Proposed |

- FILL-ANS-01: source: docs/spec/12-api.md "What `onChange` reports is an address, not a key".
- FILL-ANS-02: source: docs/spec/12-api.md "The host owns the data".
- FILL-ANS-03: source: docs/spec/12-api.md "What a form actually submits".
- FILL-ANS-04: source: docs/spec/03-components.md "Branching needs no new vocabulary"; packages/renderer/src/renderer.test.tsx "an answer under a condition that flips back".
- FILL-ANS-05: source: docs/spec/01-document-model.md "renderWhen"; docs/spec/12-api.md "Context".
- FILL-ANS-06: source: docs/spec/01-document-model.md "renderWhen".
- FILL-ANS-07: source: docs/spec/03-components.md "Selection".
- FILL-ANS-08: source: docs/spec/01-document-model.md "dataKey"; packages/renderer/src/renderer.test.tsx "gives two components sharing a data key the same value and separate errors".

## Errors shown (ERR)

| ID          | Requirement                                                                                     | Pri | Verify | Status   |
| ----------- | ----------------------------------------------------------------------------------------------- | --- | ------ | -------- |
| FILL-ERR-01 | The system shall display each error the host supplies on the component it is addressed to.      | P1  | Test   | Proposed |
| FILL-ERR-02 | The system shall keep separate errors for questions that share an answer name.                  | P1  | Test   | Proposed |
| FILL-ERR-03 | The system shall display an error addressed to a component that no kit can draw.                | P2  | Test   | Proposed |
| FILL-ERR-04 | The system shall mark a question as required while a required rule applies to it.               | P1  | Test   | Proposed |
| FILL-ERR-05 | The system shall name to the host the questions whose author asked for validation while typing. | P2  | Test   | Proposed |

- FILL-ERR-01: source: docs/spec/08-validation.md "The API".
- FILL-ERR-02: source: docs/spec/01-document-model.md "dataKey".
- FILL-ERR-03: source: packages/renderer/src/renderer.test.tsx "shows the error on a component whose type no kit has". A test is the only source.
- FILL-ERR-04: source: docs/spec/02-kit-contract.md "Accessibility from ordinary properties" (conditional required state); test/kit-required.test.tsx.
- FILL-ERR-05: source: docs/spec/12-api.md "What a form actually submits" (`autoValidate`); docs/spec/06-inspector.md "Rules".

## What is submitted (SUB)

| ID          | Requirement                                                                                        | Pri | Verify     | Status   |
| ----------- | -------------------------------------------------------------------------------------------------- | --- | ---------- | -------- |
| FILL-SUB-01 | The system shall leave the answers of hidden questions out of the submission it derives.           | P1  | Test       | Proposed |
| FILL-SUB-02 | The system shall leave values for which the form has no question out of the submission it derives. | P1  | Test       | Proposed |
| FILL-SUB-03 | The system shall leave a question nobody answered out of the submission it derives.                | P2  | Test       | Proposed |
| FILL-SUB-04 | The system shall include the answers from every step the host names in one submission.             | P1  | Test       | Proposed |
| FILL-SUB-05 | The system shall leave out of each submitted row the answers that row no longer asks for.          | P1  | Test       | Proposed |
| FILL-SUB-06 | The system shall keep an empty list in the submission when that is the answer.                     | P2  | Test       | Proposed |
| FILL-SUB-07 | The system shall not change the answers the host holds when it derives a submission.               | P1  | Test       | Proposed |
| FILL-SUB-08 | The system shall not send a submission anywhere itself.                                            | P1  | Inspection | Proposed |

- FILL-SUB-01: source: docs/spec/12-api.md "What a form actually submits".
- FILL-SUB-02: source: docs/spec/08-validation.md "The single-scope case"; docs/THREAT_MODEL.md "Required controls".
- FILL-SUB-03: source: packages/core/src/validation.test.ts "omits a key nobody answered rather than sending undefined". A test is the only source.
- FILL-SUB-04: source: docs/spec/08-validation.md "The wizard case, which is not the same call".
- FILL-SUB-05: source: packages/core/src/validation.test.ts "drops what a row no longer asks for". A test is the only source.
- FILL-SUB-06: source: packages/core/src/validation.test.ts "keeps a real empty list, which is an answer somebody gave". A test is the only source.
- FILL-SUB-07: source: docs/spec/12-api.md "What a form actually submits".
- FILL-SUB-08: source: docs/spec/09-actions.md "Submission and Preview"; docs/spec/00-product.md "Ownership boundaries".

## Components that fail (RES)

| ID          | Requirement                                                                                                                                                     | Pri | Verify | Status   |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | --- | ------ | -------- |
| FILL-RES-01 | The system shall keep the rest of the form on the page when one component fails to draw.                                                                        | P1  | Test   | Proposed |
| FILL-RES-02 | The system shall show a notice in the place of a component that failed to draw.                                                                                 | P1  | Test   | Proposed |
| FILL-RES-03 | The system shall report a component's drawing failure to the host with the component's key.                                                                     | P1  | Test   | Proposed |
| FILL-RES-04 | The system shall draw a failed component again once what it depends on has changed.                                                                             | P2  | Test   | Proposed |
| FILL-RES-05 | The system shall stop retrying a failed component while nothing it depends on has changed, including when the host updates its own state on the failure report. | P1  | Test   | Proposed |
| FILL-RES-06 | The system shall show a notice naming the component type and key where no kit can draw a component.                                                             | P1  | Test   | Proposed |
| FILL-RES-07 | The system should let a kit replace that notice with its own.                                                                                                   | P3  | Test   | Proposed |
| FILL-RES-08 | The system shall draw the readable parts of a document that reached it without being loaded.                                                                    | P2  | Test   | Proposed |

- FILL-RES-01: source: docs/spec/12-api.md "Rendering a form" (`onError`).
- FILL-RES-02: source: packages/renderer/src/renderer.test.tsx "says so where the component would have been". A test is the only source.
- FILL-RES-03: source: docs/spec/12-api.md "Rendering a form" (`onError`).
- FILL-RES-04: source: packages/renderer/src/renderer.test.tsx "a boundary after the cause has gone" and "the node boundary letting go". Tests are the only source.
- FILL-RES-05: source: issue #241, which reproduces the opposite.
- FILL-RES-06: source: docs/spec/12-api.md "A type the kit does not have".
- FILL-RES-07: source: docs/spec/12-api.md "A type the kit does not have".
- FILL-RES-08: source: packages/renderer/src/renderer.test.tsx "a document shaped in ways the type forbids" and "the renderer over an untrusted document". Tests are the only source.
