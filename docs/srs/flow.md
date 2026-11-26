# Repeated groups and steps

How a repeated group of fields behaves for a respondent, an author and the host, and how a form split into steps is shown, navigated and arranged. Area code `FLOW`.

Dragging into a Repeater or a Step on the canvas belongs to `BUILD`. Step navigation inside Preview belongs to `PREV`. The rules a row or a step is checked against, row-scoped conditions and server checks across steps belong to `VAL`; what a submission keeps from rows and steps belongs to `FILL`; row limits and hostile row data belong to `SEC`.

## Repeaters (REP)

| ID          | Requirement                                                                                                                                                                 | Pri | Verify | Status   |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --- | ------ | -------- |
| FLOW-REP-01 | The system shall draw a Repeater's contents once for each row in its answer.                                                                                                | P1  | Test   | Proposed |
| FLOW-REP-02 | The system shall hold a Repeater's answer as a list with one entry per row, each entry holding that row's answers under their answer names.                                 | P1  | Test   | Proposed |
| FLOW-REP-03 | The system shall hold a nested Repeater's answer inside the row of the outer Repeater that contains it.                                                                     | P1  | Test   | Proposed |
| FLOW-REP-04 | The system shall draw no rows for a Repeater whose answer is not a list.                                                                                                    | P2  | Test   | Proposed |
| FLOW-REP-05 | The system shall keep each row's answers separate, so that an answer given in one row appears in no other row.                                                              | P1  | Test   | Proposed |
| FLOW-REP-06 | The system shall report a change inside a row at an address made of each enclosing Repeater's answer name and row position, outermost first, followed by the answer's name. | P1  | Test   | Proposed |
| FLOW-REP-07 | The system shall give the host a way to apply a reported change to its answers that places the value in the row the address names.                                          | P1  | Test   | Proposed |
| FLOW-REP-08 | The system shall address a validation error inside a row by each enclosing Repeater's answer name and row position, followed by the failing component's key.                | P1  | Test   | Proposed |
| FLOW-REP-09 | The system shall display a row's errors only in that row.                                                                                                                   | P1  | Test   | Proposed |
| FLOW-REP-10 | The system shall draw every inner row of every outer row when one Repeater is nested inside another.                                                                        | P1  | Test   | Proposed |
| FLOW-REP-11 | The system shall offer the respondent a control that adds a row to a Repeater.                                                                                              | P1  | Test   | Proposed |
| FLOW-REP-12 | The system shall add a new row as an empty row after the existing rows.                                                                                                     | P2  | Test   | Proposed |
| FLOW-REP-13 | The system shall offer the respondent a control on each row that removes that row.                                                                                          | P1  | Test   | Proposed |
| FLOW-REP-14 | The system shall report an added or removed row to the host as the Repeater's complete new list, at the Repeater's own address.                                             | P1  | Test   | Proposed |
| FLOW-REP-15 | The system shall disable the add control while the number of rows is at or above the authored maximum.                                                                      | P1  | Test   | Proposed |
| FLOW-REP-16 | The system shall disable the remove controls while the number of rows is at or below the authored minimum.                                                                  | P1  | Test   | Proposed |
| FLOW-REP-17 | The system shall apply a guarded row-count bound to the add and remove controls only while its guard holds.                                                                 | P1  | Test   | Proposed |
| FLOW-REP-18 | The system shall apply the strictest of several applicable row-count bounds to the add and remove controls.                                                                 | P2  | Test   | Proposed |
| FLOW-REP-19 | The system shall address the rows that remain after a removal by their new positions.                                                                                       | P1  | Test   | Proposed |
| FLOW-REP-20 | The system shall draw and address rows in their new order when the host reorders a Repeater's list.                                                                         | P2  | Test   | Proposed |
| FLOW-REP-21 | The system shall keep a Repeater's contents in the form document once, however many rows a respondent adds.                                                                 | P1  | Test   | Proposed |
| FLOW-REP-22 | The system shall not add a row identifier to the answers.                                                                                                                   | P1  | Test   | Proposed |
| FLOW-REP-23 | The system shall treat any data-bound container whose answer is a list as a repeated group, whatever its component type.                                                    | P2  | Test   | Proposed |
| FLOW-REP-24 | The system shall draw one empty row of a Repeater that has no answers while the author is editing, so that its contents can be reached.                                     | P1  | Test   | Proposed |
| FLOW-REP-25 | The system shall draw no rows of a Repeater that has no answers to a respondent.                                                                                            | P1  | Test   | Proposed |
| FLOW-REP-26 | The system shall offer the answers of a component's own row separately from the form's answers when the author picks what a condition on that component tests.              | P1  | Test   | Proposed |
| FLOW-REP-27 | The system shall not offer a component in a nested row an answer that only an outer row holds when the author picks what a condition tests.                                 | P1  | Test   | Proposed |
| FLOW-REP-28 | The system shall treat a Repeater's list as an answer of the scope that holds the Repeater, not as an answer of its own rows.                                               | P2  | Test   | Proposed |
| FLOW-REP-29 | The system shall let an expression inside a row read that row's answers, with a row answer taking precedence over a form answer of the same name.                           | P2  | Test   | Proposed |
| FLOW-REP-30 | The system should warn an author that changing a Repeater's data type stops its rows repeating.                                                                             | P3  | Test   | Proposed |

- FLOW-REP-01: source: docs/spec/03-components.md "Repeated scope"; packages/renderer/src/renderer.test.tsx "draws its children once per row, with each row holding its own answer".
- FLOW-REP-02: source: docs/spec/12-api.md "Rendering a form" (`data`: "rows nest under the repeater"); packages/core/src/rows.test.ts "collects the answer under the answer name". DOC-SCH-03 describes the same shape in the schema.
- FLOW-REP-03: source: docs/spec/03-components.md "Editing rows" (nested repeaters); packages/core/src/rows.test.ts "collects both levels under their answer names".
- FLOW-REP-04: source: packages/renderer/src/renderer.test.tsx "draws nothing for a value that is not a list". A test is the only source. SEC-DATA-02 covers the server rejecting such a value.
- FLOW-REP-05: source: packages/renderer/src/renderer.test.tsx "draws its children once per row, with each row holding its own answer"; packages/core/src/rows.test.ts "lands a keystroke in the row it was typed in".
- FLOW-REP-06: source: docs/spec/12-api.md "What `onChange` reports is an address, not a key"; docs/spec/03-components.md "What a host writes". FILL-ANS-01 covers reporting every change; this row fixes the address inside a row.
- FLOW-REP-07: source: docs/spec/03-components.md "What a host writes"; docs/spec/12-api.md "What `onChange` reports is an address, not a key". SEC-DATA-04 and SEC-DATA-05 cover what the writer refuses.
- FLOW-REP-08: source: docs/spec/12-api.md "What `onChange` reports is an address, not a key"; docs/spec/08-validation.md "The API" (`FormErrors` keyed by row address); packages/core/src/rows.test.ts "reports each missing answer at its full address".
- FLOW-REP-09: source: packages/renderer/src/renderer.test.tsx "gives each row its own error". A test is the only source.
- FLOW-REP-10: source: docs/spec/03-components.md "Editing rows"; packages/renderer/src/renderer.test.tsx "draws every inner row of every outer row".
- FLOW-REP-11: source: docs/spec/03-components.md "Editing rows"; test/kit-contract.test.tsx "adds and removes rows without crossing authored bounds".
- FLOW-REP-12: source: packages/kit-html/src/renderers.tsx and packages/kit-mui/src/renderers.tsx (`Repeater`). The code is the only source; no document says where a new row goes or what it holds.
- FLOW-REP-13: source: docs/spec/03-components.md "Editing rows"; test/kit-contract.test.tsx "adds and removes rows without crossing authored bounds".
- FLOW-REP-14: source: docs/spec/03-components.md "Editing rows".
- FLOW-REP-15: source: docs/spec/03-components.md "Editing rows"; test/kit-contract.test.tsx "adds and removes rows without crossing authored bounds". VAL-RULE-08 covers rejecting the count on submit.
- FLOW-REP-16: source: docs/spec/03-components.md "Editing rows"; test/kit-contract.test.tsx "adds and removes rows without crossing authored bounds".
- FLOW-REP-17: source: docs/spec/03-components.md "Editing rows" ("every currently applicable bound, including guards reading form answers, host context, or an enclosing row").
- FLOW-REP-18: source: docs/spec/03-components.md "Editing rows" ("the strictest determines the limit").
- FLOW-REP-19: source: packages/renderer/src/renderer.test.tsx "re-addresses the rows that are left after one is removed". A test is the only source. docs/spec/03-components.md "What a host writes" states the accepted cost: browser-held state such as an input method composition can follow the position rather than the answer ("keeps the element in place when the row under it changes, which is the cost of index keys").
- FLOW-REP-20: source: packages/renderer/src/renderer.test.tsx "redraws the rows in their new order" and "addresses the moved row by where it now is". Tests are the only source. No document asks for a reorder control for the respondent, and neither kit offers one.
- FLOW-REP-21: source: docs/spec/03-components.md "Rows never mint keys"; e2e/repeater.spec.ts "a field dropped into a repeater lands in the authored row, once".
- FLOW-REP-22: source: docs/spec/03-components.md "What a host writes" (a stable generated id would put a non-answer inside the answers); docs/spec/12-api.md "State that is not an answer".
- FLOW-REP-23: source: docs/spec/03-components.md "Rows never mint keys" ("Core recognises a repeater from its shape"); packages/core/src/rows.test.ts "recognises a repeater from its shape, not from a type string".
- FLOW-REP-24: source: e2e/repeater.spec.ts "a repeater is authorable even though it has no rows" and "a field dropped into a repeater lands in the authored row, once"; packages/renderer/src/renderer.test.tsx "draws one row while editing, so the subtree can be reached". Tests are the only source.
- FLOW-REP-25: source: packages/renderer/src/renderer.test.tsx "draws nothing for a person filling in the form"; e2e/repeater.spec.ts "preview renders the repeater and draws no rows until there are answers". Tests are the only source.
- FLOW-REP-26: source: docs/spec/03-components.md "A condition says which scope it means" ("The condition editor and `validateDocument` use the same names for each scope"); packages/designer/src/panels/Properties.test.tsx "separates the row from the form in the list it offers". VAL-WHEN-12 covers how the condition is then read.
- FLOW-REP-27: source: docs/spec/03-components.md "A condition says which scope it means" ("No scope reaches an outer row"); packages/core/src/rows.test.ts "reads the innermost row, and stops at a nested repeater". DOC-LOAD-12 covers rejecting such a reference in a document.
- FLOW-REP-28: source: docs/spec/03-components.md "A condition says which scope it means" ("A repeater's own data key is an answer in the scope that holds the repeater"); packages/core/src/rows.test.ts "the picker and validation agree that a top-level repeater is a form answer".
- FLOW-REP-29: source: docs/spec/07-bindings.md "Computed"; packages/renderer/src/renderer.test.tsx "lets the row shadow a form answer of the same name".
- FLOW-REP-30: source: packages/designer/src/panels/Rules.test.tsx "warns that changing it stops the rows repeating". A test is the only source.

## Steps (STEP)

| ID           | Requirement                                                                                                                       | Pri | Verify | Status   |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------- | --- | ------ | -------- |
| FLOW-STEP-01 | The system shall show a step only while the current step the host supplies is that step's name.                                   | P1  | Test   | Proposed |
| FLOW-STEP-02 | The system shall take the current step from the host's context, never from the answers.                                           | P1  | Test   | Proposed |
| FLOW-STEP-03 | The system shall leave the current step out of the answers.                                                                       | P1  | Test   | Proposed |
| FLOW-STEP-04 | The system shall change the step it shows only when the host supplies a different current step.                                   | P1  | Test   | Proposed |
| FLOW-STEP-05 | The system shall report to the host the step a Back or Next control leads to when the respondent uses it.                         | P1  | Test   | Proposed |
| FLOW-STEP-06 | The system shall draw Back and Next controls on the current step only when the host asks for controlled navigation.               | P1  | Test   | Proposed |
| FLOW-STEP-07 | The system shall order a form's steps by their position in the form.                                                              | P1  | Test   | Proposed |
| FLOW-STEP-08 | The system shall skip, in Back and Next, a step whose condition does not hold for the current answers and context.                | P1  | Test   | Proposed |
| FLOW-STEP-09 | The system shall disable Back on the first reachable step.                                                                        | P1  | Test   | Proposed |
| FLOW-STEP-10 | The system shall disable Next on the last reachable step.                                                                         | P1  | Test   | Proposed |
| FLOW-STEP-11 | The system shall show the respondent's position among the reachable steps, counting from one.                                     | P1  | Test   | Proposed |
| FLOW-STEP-12 | The system shall not show a total number of steps in its own step controls.                                                       | P1  | Test   | Proposed |
| FLOW-STEP-13 | The system shall count every component shown for one step name as part of that one step, not as another step.                     | P1  | Test   | Proposed |
| FLOW-STEP-14 | The system should let the host choose which context value holds the current step, and use the value named step when it does not.  | P3  | Test   | Proposed |
| FLOW-STEP-15 | The system shall accept a step name of any JSON type without converting it to text.                                               | P2  | Test   | Proposed |
| FLOW-STEP-16 | The system shall let a condition on one step read an answer given on another step.                                                | P1  | Test   | Proposed |
| FLOW-STEP-17 | The system shall address an answer on a step exactly as it would be addressed in a form without steps.                            | P1  | Test   | Proposed |
| FLOW-STEP-18 | The system shall let the host validate only the step being shown.                                                                 | P1  | Test   | Proposed |
| FLOW-STEP-19 | The system shall give a newly placed Step a visibility condition that names the Step's own key as its step name.                  | P1  | Test   | Proposed |
| FLOW-STEP-20 | The system shall let an author edit or remove a Step's starting condition like any other visibility condition.                    | P2  | Test   | Proposed |
| FLOW-STEP-21 | The system shall give a duplicated Step a condition naming the copy's key, not the original's.                                    | P1  | Test   | Proposed |
| FLOW-STEP-22 | The system shall change a Step's condition to name the Step's new key when the author renames it.                                 | P1  | Test   | Proposed |
| FLOW-STEP-23 | The system shall show every step on the canvas while the author is editing.                                                       | P1  | Test   | Proposed |
| FLOW-STEP-24 | The system shall offer a step switcher on the canvas only when the form names two or more steps.                                  | P2  | Test   | Proposed |
| FLOW-STEP-25 | The system shall list in the step switcher every step name the form's conditions compare the current step against, in form order. | P2  | Test   | Proposed |

- FLOW-STEP-01: source: docs/spec/03-components.md "A wizard already runs" and "Where the current step lives"; docs/spec/08-validation.md "The wizard case, which is not the same call" ("Every `Step` carries a `renderWhen` comparing `context.step` to its own key").
- FLOW-STEP-02: source: docs/spec/03-components.md "Where the current step lives"; docs/spec/12-api.md "Context".
- FLOW-STEP-03: source: docs/spec/03-components.md "Where the current step lives" ("separate from submitted answers"); docs/spec/12-api.md "The line: a condition must be answerable in Node" (context is not in the payload). SEC-DATA-01 covers the opposite direction.
- FLOW-STEP-04: source: docs/spec/03-components.md "Controlled navigation" ("the host still owns the current value in `context`"); docs/spec/12-api.md "The host owns the data".
- FLOW-STEP-05: source: docs/spec/03-components.md "Controlled navigation"; docs/spec/12-api.md "Rendering a form" (`navigation`); test/kit-contract.test.tsx "counts shared page content once and navigates through reachable branches".
- FLOW-STEP-06: source: docs/spec/03-components.md "Controlled navigation" ("When that controlled prop is supplied, both kits draw Back and Next controls").
- FLOW-STEP-07: source: docs/spec/03-components.md "Branching needs no new vocabulary" ("in tree order"); packages/core/src/context.test.ts "reads the steps out of the document, in document order".
- FLOW-STEP-08: source: docs/spec/03-components.md "Controlled navigation" and "Branching needs no new vocabulary"; test/kit-contract.test.tsx "counts shared page content once and navigates through reachable branches".
- FLOW-STEP-09: source: test/kit-contract.test.tsx "counts shared page content once and navigates through reachable branches". A test is the only source; the spec says only that Back leads to the previous reachable step.
- FLOW-STEP-10: source: test/kit-contract.test.tsx "counts shared page content once and navigates through reachable branches". A test is the only source; the spec says only that Next leads to the next reachable step.
- FLOW-STEP-11: source: docs/spec/03-components.md "Controlled navigation" ("reports a one-based position").
- FLOW-STEP-12: source: docs/spec/03-components.md "Branching needs no new vocabulary" ("Progress must be truthful"); docs/spec/12-api.md "Rendering a form". A host may still show a known total for a fixed linear form; that display is the host's.
- FLOW-STEP-13: source: docs/spec/03-components.md "Controlled navigation" ("Nodes sharing the same destination value belong to one page"); test/kit-contract.test.tsx "counts shared page content once and navigates through reachable branches".
- FLOW-STEP-14: source: docs/spec/12-api.md "Rendering a form" ("Its optional `path` defaults to `step`").
- FLOW-STEP-15: source: test/designer-preview.test.tsx "supports numeric step identities without turning them into strings"; docs/BETA_REVIEW.md "Fixes in this review". docs/spec/08-validation.md "The wizard case, which is not the same call" keeps only text step names in its server recipe; VAL-SRV-04 already records that disagreement for the server.
- FLOW-STEP-16: source: docs/spec/03-components.md "A wizard already runs" ("A condition on step 3 reading a step 1 answer: works").
- FLOW-STEP-17: source: docs/spec/03-components.md "Settled: steps come before repeated scope" ("Steps here add no addressing at all").
- FLOW-STEP-18: source: docs/spec/03-components.md "A wizard already runs" ("per-step validation"); packages/core/src/validation.test.ts "validates only the step the user is on". VAL-SRV-02 covers validating every step at once.
- FLOW-STEP-19: source: docs/spec/03-components.md "Controlled navigation" (the `Step` palette entry's starting visibility rule); packages/core/src/tree.test.ts "names the node the rule is on, not the type" and "gives two steps different rules, so they are different steps".
- FLOW-STEP-20: source: docs/spec/03-components.md "Controlled navigation" ("the Rules tab edits it afterwards like any other `renderWhen`, deletion included").
- FLOW-STEP-21: source: packages/core/src/tree.ts (`repointBinding`, used by `duplicateNode`); packages/core/src/tree.test.ts "re-points a duplicated node at its own key". The code and tests are the only source.
- FLOW-STEP-22: source: packages/designer/src/panels/Properties.test.tsx "re-points the component's own condition, which names its own key"; packages/designer/src/store.regressions.test.ts "re-points a condition that named the key being renamed". Tests are the only source.
- FLOW-STEP-23: source: docs/spec/03-components.md "Controlled navigation" ("editing shows all of them"); docs/spec/05-canvas.md "A conditional component on the canvas"; packages/designer/src/panels/Canvas.test.tsx "shows every step while editing, so all of them can be arranged".
- FLOW-STEP-24: source: docs/spec/05-canvas.md "The step switcher" ("a form with fewer than two steps gets no control"); packages/designer/src/panels/Canvas.test.tsx "shows no switcher for a form that declares no steps".
- FLOW-STEP-25: source: docs/spec/05-canvas.md "The step switcher"; packages/designer/src/panels/Canvas.test.tsx "offers a switcher naming the steps the document declares".
