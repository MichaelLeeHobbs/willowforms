# Actions

Which events components raise, the effects actions hand the host, how code actions reach the host's evaluator, and how an author attaches actions to events. Area code `ACT`.

How Preview handles events, validate and submit belongs to `PREV`. Keyboard and screen-reader access to the Actions tab belongs to `A11Y`. The host's embedding props in general belong to `HOST`. No bundled evaluator, defined effects only, a bad batch rejected whole and no host capability are `SEC-CODE-01`, `SEC-CODE-02`, `SEC-CODE-03`, `SEC-CODE-04` and `SEC-CODE-05`. A reference to an undefined code action is `DOC-LOAD-13`.

## Events (EVT)

| ID         | Requirement                                                                                                                                                                   | Pri | Verify | Status   |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --- | ------ | -------- |
| ACT-EVT-01 | The system shall raise one change event each time a respondent changes the answer in a TextField, NumberField, TextArea, Checkbox, Switch, Select, Radio group or DatePicker. | P1  | Test   | Accepted |
| ACT-EVT-02 | The system shall raise a click event when a respondent activates a Button or a Link.                                                                                          | P1  | Test   | Accepted |
| ACT-EVT-03 | The system shall raise a blur event when focus leaves a TextField, TextArea, NumberField or DatePicker.                                                                       | P2  | Test   | Accepted |
| ACT-EVT-04 | The system shall raise a focus event when focus enters a TextField or TextArea.                                                                                               | P2  | Test   | Accepted |
| ACT-EVT-05 | The system shall raise a Screen's mount event once when the form is drawn.                                                                                                    | P2  | Test   | Accepted |
| ACT-EVT-06 | The system shall raise a Screen's unmount event when the form is removed from the page.                                                                                       | P2  | Test   | Accepted |
| ACT-EVT-07 | The system shall raise the same events for the same component in both standard kits.                                                                                          | P2  | Test   | Accepted |
| ACT-EVT-08 | The system shall reject a document that binds actions to an event other than change, click, blur, focus, mount or unmount.                                                    | P1  | Test   | Accepted |
| ACT-EVT-09 | The system shall run the actions bound to an event in the order the author listed them.                                                                                       | P1  | Test   | Accepted |
| ACT-EVT-10 | The system shall hand the host the effects of one event as a single batch, once.                                                                                              | P1  | Test   | Accepted |
| ACT-EVT-11 | The system shall tell the host, with each batch, the key of the component that raised the event, the event, and the component's address.                                      | P1  | Test   | Accepted |
| ACT-EVT-12 | The system shall give an event raised inside a Repeater row an address that names that row.                                                                                   | P1  | Test   | Accepted |
| ACT-EVT-13 | The system shall report an answer change to the host before it runs the actions bound to that change.                                                                         | P2  | Test   | Accepted |
| ACT-EVT-14 | The system shall not raise a component's events when the host changes that component's answer.                                                                                | P1  | Test   | Accepted |

- ACT-EVT-01: source: docs/spec/03-components.md "Events"; test/kit-contract.test.tsx "raises a field event once alongside its ordinary data change". Reporting the answer itself is FILL-ANS-01.
- ACT-EVT-02: source: docs/spec/03-components.md "Events"; test/kit-contract.test.tsx "dispatches a button click as a validated effect batch". That a Button never submits a page form is CAT-INP-14.
- ACT-EVT-03: source: docs/spec/03-components.md "Events" ("Focus and blur support is intentionally limited to the listed components").
- ACT-EVT-04: source: docs/spec/03-components.md "Events". Not built for TextArea: both kits declare the event on TextArea, but packages/kit-html/src/renderers.tsx `TextAreaNode` and packages/kit-mui/src/renderers.tsx `TextAreaNode` call only the blur handler, so a focus action on a TextArea never runs. test/docs.test.ts "the events table" checks the declarations, not that the event is raised.
- ACT-EVT-05: source: docs/spec/03-components.md "Events" ("lifecycle events belong to `Screen`"); packages/renderer/src/renderer.test.tsx "dispatches onMount after the node is mounted".
- ACT-EVT-06: source: docs/spec/03-components.md "Events"; packages/renderer/src/renderer.test.tsx "dispatches onUnmount with the latest configured handler", which also shows the actions bound at removal time are the ones that run.
- ACT-EVT-07: source: docs/spec/03-components.md "Events" ("Both shipped kits declare the lists below"); test/docs.test.ts "the two kits declare the same events for the same component". It may overlap `KIT` switching rows.
- ACT-EVT-08: source: docs/spec/09-actions.md "Model" ("`validateDocument` rejects unknown event names"); packages/core/src/tree.test.ts "rejects an event this library does not raise". The event names are the document's, onChange, onClick, onBlur, onFocus, onMount and onUnmount.
- ACT-EVT-09: source: docs/spec/09-actions.md "Model" ("an ordered list of references"); docs/spec/06-inspector.md "Actions" ("in order"); packages/core/src/actions.test.ts "turns built-in references into a validated effect batch".
- ACT-EVT-10: source: docs/spec/09-actions.md "Effects" ("The host receives the checked batch once"); docs/spec/12-api.md "Rendering a form" (`onEffects`); test/kit-contract.test.tsx "dispatches a button click as a validated effect batch".
- ACT-EVT-11: source: docs/spec/12-api.md "Rendering a form" (`ActionDispatch`); test/kit-contract.test.tsx "dispatches a button click as a validated effect batch". For a component with no answer, such as a Button, the address is its own name.
- ACT-EVT-12: source: docs/spec/09-actions.md "Security boundary" ("The address includes a repeater coordinate such as `addresses[1].line1`"). No test raises an event inside a row. The address shape is FLOW-REP-06.
- ACT-EVT-13: source: packages/renderer/src/kit-props.test.ts "reports the value to onChange, then to the onChange event". A test is the only source.
- ACT-EVT-14: source: docs/spec/09-actions.md "Effects" ("Programmatic writes do not synthesize component events, which prevents action loops inside the renderer"). No test asserts it.

## Effects (EFF)

| ID         | Requirement                                                                                                                                              | Pri | Verify | Status   |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | --- | ------ | -------- |
| ACT-EFF-01 | The system shall offer a Set field value action whose effect asks the host to set the answer at a given address to a given value.                        | P1  | Test   | Accepted |
| ACT-EFF-02 | The system shall offer a Clear field value action whose effect asks the host to clear the answer at a given address.                                     | P1  | Test   | Accepted |
| ACT-EFF-03 | The system shall offer a Focus component action whose effect asks the host to move focus to the component with a given key.                              | P2  | Test   | Accepted |
| ACT-EFF-04 | The system shall offer an Announce message action whose effect asks the host to announce a given message.                                                | P2  | Test   | Accepted |
| ACT-EFF-05 | The system shall offer an Update context action whose effect asks the host to set the host context value at a given path to a given value.               | P1  | Test   | Accepted |
| ACT-EFF-06 | The system shall offer a Validate form action whose effect asks the host to validate, optionally naming a scope.                                         | P1  | Test   | Accepted |
| ACT-EFF-07 | The system shall offer an Emit event action whose effect asks the host to act on a named event, optionally with a payload.                               | P1  | Test   | Accepted |
| ACT-EFF-08 | The system shall offer a Stop actions action that hands the host the effects up to and including itself and neither checks nor runs any action after it. | P1  | Test   | Accepted |
| ACT-EFF-09 | The system shall produce from a built-in action the effect its name selects, whatever its parameters contain.                                            | P1  | Test   | Accepted |
| ACT-EFF-10 | The system shall produce the effects of built-in actions without a host evaluator.                                                                       | P1  | Test   | Accepted |
| ACT-EFF-11 | The system shall not change answers, host context, focus or validation results itself in response to an effect.                                          | P1  | Test   | Accepted |
| ACT-EFF-12 | The system shall reject a document whose built-in action reference names no built-in action.                                                             | P1  | Test   | Accepted |

- ACT-EFF-01, ACT-EFF-02: source: docs/spec/09-actions.md "Effects" ("form data uses an address"); docs/spec/09-actions.md "Host responsibilities" (the host writes addressed values with its change helper, FLOW-REP-07).
- ACT-EFF-03: source: docs/spec/09-actions.md "Effects" ("interface effects use a unique node key").
- ACT-EFF-04: source: docs/spec/09-actions.md "Effects"; packages/core/src/actions.test.ts "turns built-in references into a validated effect batch".
- ACT-EFF-05: source: docs/spec/09-actions.md "Effects" ("`setContext` only requests a change to the browser-side context; the server must reconstruct trusted context from its own session"); docs/spec/12-api.md "Presentation state stays in the component" ("an effect writes to context, which the host already owns").
- ACT-EFF-06: source: docs/spec/09-actions.md "Effects". The scope's meaning is the host's; what Preview does with it is `PREV`.
- ACT-EFF-07: source: docs/spec/09-actions.md "Effects" and "Submission and Preview" (event names such as submit, saveDraft and cancel are host conventions). Not sending a submission is FILL-SUB-08.
- ACT-EFF-08: source: docs/spec/09-actions.md "Effects" ("`halt` keeps effects through itself and stops processing immediately"); packages/core/src/actions.test.ts "stops after a halt effect" and "does not evaluate or validate actions after halt". The Inspector calls it Stop actions (packages/designer/src/panels/Actions.tsx).
- ACT-EFF-09: source: docs/spec/09-actions.md "Effects" ("Built-in parameters cannot override the action kind selected by its name"); packages/core/src/actions.test.ts "cannot replace a built-in action kind through its parameters".
- ACT-EFF-10: source: docs/spec/09-actions.md "Security boundary" ("Built-in actions need no evaluator"); docs/spec/06-inspector.md "Actions" ("Built-ins remain available without one").
- ACT-EFF-11: source: docs/spec/09-actions.md "Effects" ("The host receives the checked batch once and decides how to apply it") and "Submission and Preview" ("it does not submit an HTML form, validate automatically, or make a network request"). That an action gets no capability beyond returning effects is SEC-CODE-05.
- ACT-EFF-12: source: docs/spec/09-actions.md "Model" ("`validateDocument` rejects unknown ... built-in names"); packages/core/src/tree.test.ts "rejects an unknown builtin reference".

## Code actions (CODE)

| ID          | Requirement                                                                                                                                                                            | Pri | Verify | Status   |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --- | ------ | -------- |
| ACT-CODE-01 | The system shall let a document define named code actions, each with source text and default parameters, that any component's events can reference.                                    | P1  | Test   | Accepted |
| ACT-CODE-02 | The system shall pass the host's action evaluator the action's source, the current answers, the host context, the parameters, and the event, component key and address that raised it. | P1  | Test   | Accepted |
| ACT-CODE-03 | The system shall give a code action raised by a change the answer's new value.                                                                                                         | P2  | Test   | Accepted |
| ACT-CODE-04 | The system shall let an action reference's parameters override the code action's default parameters for that run.                                                                      | P1  | Test   | Accepted |
| ACT-CODE-05 | The system shall refuse an evaluator result that is not a list of effects.                                                                                                             | P1  | Test   | Accepted |
| ACT-CODE-06 | The system shall skip a code action when the host supplies no action evaluator and still produce the effects of the other actions bound to the event.                                  | P1  | Test   | Accepted |
| ACT-CODE-07 | The system shall report each failed action to the host with the component, event and address that raised it.                                                                           | P1  | Test   | Accepted |
| ACT-CODE-08 | The system shall deliver no effects from an event when any of its actions fails.                                                                                                       | P1  | Test   | Accepted |
| ACT-CODE-09 | The system shall keep the form drawn and usable when an action fails.                                                                                                                  | P1  | Test   | Accepted |
| ACT-CODE-10 | The system shall reject a document whose action reference is neither a built-in nor a code action.                                                                                     | P1  | Test   | Accepted |
| ACT-CODE-11 | The system shall pass the host's expression evaluator the expression, the current answers and the host context.                                                                        | P1  | Test   | Accepted |
| ACT-CODE-12 | The system shall draw a component whose computed property has no evaluator, with that property empty.                                                                                  | P1  | Test   | Accepted |
| ACT-CODE-13 | The system shall keep drawing a component when the evaluator fails on one of its computed properties.                                                                                  | P2  | Test   | Accepted |

- ACT-CODE-01: source: docs/spec/09-actions.md "Model" ("Code actions live in `FormDocument.actions` so they can be shared"). Including them in an exported file is DOC-JSON-02.
- ACT-CODE-02: source: docs/spec/09-actions.md "Security boundary" (`ActionEvaluator`, "`invocation` identifies the event, node, current value when there is one, and the field address"); packages/core/src/actions.test.ts "runs code only through the injected action evaluator"; test/kit-contract.test.tsx "runs code actions only through the supplied action evaluator".
- ACT-CODE-03: source: docs/spec/09-actions.md "Security boundary" ("current value when there is one"); packages/renderer/src/index.tsx (the change handler passes the new value with the event). The answers passed alongside are the host's answers before it applies the change, so the new value reaches the action only this way.
- ACT-CODE-04: source: docs/spec/09-actions.md "Model" ("Reference parameters override the action's default parameters for that invocation"); packages/core/src/actions.test.ts "runs code only through the injected action evaluator".
- ACT-CODE-05: source: docs/spec/09-actions.md "Renderer API" ("invalid evaluator output"); packages/core/src/actions.ts (`Code action did not return an effect list`). An unknown or malformed effect inside a list is SEC-CODE-04.
- ACT-CODE-06: source: docs/spec/09-actions.md "Security boundary" ("Code actions are skipped when no evaluator is supplied, without throwing or preventing the rest of the form from rendering"); packages/core/src/actions.test.ts "skips code actions when no evaluator is supplied". Not running the code is SEC-CODE-02; this row is that the other actions still run.
- ACT-CODE-07: source: docs/spec/09-actions.md "Renderer API" ("`onActionError` reports bad references, evaluator failures, and invalid evaluator output without throwing through the form"); docs/spec/12-api.md "Rendering a form" (`onActionError`).
- ACT-CODE-08: source: packages/core/src/actions.test.ts "rejects the whole batch when any effect is unreadable"; packages/renderer/src/index.tsx (a failed run reports the error and hands over no effects). SEC-CODE-04 covers a malformed effect; this row extends it to a bad reference or a failing evaluator, for which the code is the only source.
- ACT-CODE-09: source: docs/spec/09-actions.md "Renderer API" ("without throwing through the form") and "Security boundary".
- ACT-CODE-10: source: docs/spec/09-actions.md "Model" ("`validateDocument` rejects ... action-reference kinds"); packages/core/src/tree.test.ts "rejects an action reference whose type is neither kind".
- ACT-CODE-11: source: docs/spec/12-api.md "Context" ("The evaluator gets it too, as a third argument: `(expression, data, context)`"); docs/spec/07-bindings.md "Computed". What a row adds to the answers is FLOW-REP-29.
- ACT-CODE-12: source: docs/spec/07-bindings.md "Computed" ("With none injected the property resolves to `null` and the component still renders"); e2e/authoring.spec.ts "a computed property renders nothing rather than throwing". Telling the author so is CONF-PROP-13.
- ACT-CODE-13: source: packages/renderer/src/renderer.test.tsx "an evaluator that throws while resolving a prop". A test is the only source.

## Authoring them (AUTH)

| ID          | Requirement                                                                                                                                                        | Pri | Verify | Status   |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --- | ------ | -------- |
| ACT-AUTH-01 | The system shall list on the Actions tab only the events the selected component declares.                                                                          | P1  | Test   | Accepted |
| ACT-AUTH-02 | The system shall let an author add any built-in action, or any code action the document defines, to an event.                                                      | P1  | Test   | Accepted |
| ACT-AUTH-03 | The system shall let an author move an action up or down within an event's list.                                                                                   | P1  | Test   | Accepted |
| ACT-AUTH-04 | The system shall let an author remove an action from an event's list.                                                                                              | P1  | Test   | Accepted |
| ACT-AUTH-05 | The system shall keep each action's own settings when the author reorders or removes actions.                                                                      | P2  | Test   | Accepted |
| ACT-AUTH-06 | The system shall offer the form's fields, by label and answer address, as targets for Set field value and Clear field value.                                       | P1  | Test   | Accepted |
| ACT-AUTH-07 | The system shall offer for Set field value an input that matches the target field: text, multiline text, number, date, true or false, or one of its fixed choices. | P1  | Test   | Accepted |
| ACT-AUTH-08 | The system shall store a value chosen from a field's fixed choices with its declared JSON type.                                                                    | P1  | Test   | Accepted |
| ACT-AUTH-09 | The system shall start Set field value with no value when the author picks a different target.                                                                     | P2  | Test   | Accepted |
| ACT-AUTH-10 | The system shall let an author enter a list or object value as JSON.                                                                                               | P2  | Test   | Accepted |
| ACT-AUTH-11 | The system shall offer the form's components, by key, as targets for Focus component.                                                                              | P2  | Test   | Accepted |
| ACT-AUTH-12 | The system shall offer a named input for each message, context path, validation scope, event name and stop reason.                                                 | P2  | Test   | Accepted |
| ACT-AUTH-13 | The system shall let an author choose the type of a context value or an event payload.                                                                             | P2  | Test   | Accepted |
| ACT-AUTH-14 | The system shall let an author target a field inside a Repeater by the Repeater's answer name and a row number counted from 1.                                     | P1  | Test   | Accepted |
| ACT-AUTH-15 | The system shall target the row the author numbered, not the row that raised the event.                                                                            | P1  | Test   | Accepted |
| ACT-AUTH-16 | The system shall refuse a row number below 1 with a message and keep the stored target.                                                                            | P2  | Test   | Accepted |
| ACT-AUTH-17 | The system shall keep showing a target that no longer exists, marked unavailable, rather than replace it.                                                          | P1  | Test   | Accepted |
| ACT-AUTH-18 | The system shall let an author edit any action's parameters as a JSON object.                                                                                      | P2  | Test   | Accepted |
| ACT-AUTH-19 | The system shall keep the parameters an action's structured inputs do not edit when the author uses those inputs.                                                  | P1  | Test   | Accepted |
| ACT-AUTH-20 | The system shall report an invalid action value or parameter object without saving it.                                                                             | P1  | Test   | Accepted |
| ACT-AUTH-21 | The system shall show the current parameters in an action's structured inputs after a raw parameter edit or an undo.                                               | P2  | Test   | Accepted |
| ACT-AUTH-22 | The system shall let an author add a named code action to the document in the form's Settings.                                                                     | P1  | Test   | Accepted |
| ACT-AUTH-23 | The system shall let an author edit a code action's source and default parameters.                                                                                 | P1  | Test   | Accepted |
| ACT-AUTH-24 | The system shall refuse a new code action name that breaks the key rules or that another code action already has.                                                  | P2  | Test   | Accepted |
| ACT-AUTH-25 | The system shall state, where code actions are defined and where actions are attached, that code actions need a sandboxed evaluator from the host.                 | P1  | Test   | Accepted |
| ACT-AUTH-26 | The system shall remove every reference to a code action when the author deletes that code action.                                                                 | P1  | Test   | Accepted |

- ACT-AUTH-01: source: docs/spec/09-actions.md "Inspector" ("lists only events declared by the selected kit component"); packages/designer/src/panels/Actions.test.tsx "wires an ordered built-in action to a declared component event". The tab also says when a component raises no events (packages/designer/src/panels/Actions.tsx); no separate row is written.
- ACT-AUTH-02: source: docs/spec/09-actions.md "Inspector" ("an ordered list with add, remove, and move controls"); packages/designer/src/panels/Actions.test.tsx "wires an ordered built-in action to a declared component event".
- ACT-AUTH-03, ACT-AUTH-04: source: docs/spec/09-actions.md "Inspector"; e2e/action-fields.spec.ts "message and focus editors retain the correct parameters when actions are reordered or removed".
- ACT-AUTH-05: source: e2e/action-fields.spec.ts "message and focus editors retain the correct parameters when actions are reordered or removed". A test is the only source.
- ACT-AUTH-06: source: docs/spec/09-actions.md "Inspector" ("Set value and Clear value offer existing field labels and data addresses"); e2e/action-fields.spec.ts "action field selection uses data addresses and typed values without JSON".
- ACT-AUTH-07: source: docs/spec/09-actions.md "Inspector" ("a text, multiline, number, date, boolean, or static-choice input"); e2e/action-fields.spec.ts "action field selection uses data addresses and typed values without JSON". The e2e test covers number, true or false, choice and text; no test covers multiline or date.
- ACT-AUTH-08: source: docs/spec/09-actions.md "Inspector" ("Option values retain their JSON types"); e2e/action-fields.spec.ts "action field selection uses data addresses and typed values without JSON" (choosing Zero stores the number 0).
- ACT-AUTH-09: source: docs/spec/09-actions.md "Inspector" ("Selecting a different target starts with no value").
- ACT-AUTH-10: source: docs/spec/09-actions.md "Inspector" ("Array and object values use a JSON value editor"); e2e/action-fields.spec.ts "host context values offer types and preserve unfinished JSON until commit".
- ACT-AUTH-11: source: docs/spec/09-actions.md "Inspector" ("Focus offers component keys"); e2e/action-fields.spec.ts "message and focus editors retain the correct parameters when actions are reordered or removed".
- ACT-AUTH-12: source: docs/spec/09-actions.md "Inspector" ("messages, context paths, validation scopes, event names, and stop reasons use named inputs").
- ACT-AUTH-13: source: docs/spec/09-actions.md "Inspector" ("Host-owned context values and event payloads have an explicit value-type selector"); e2e/action-fields.spec.ts "host context values offer types and preserve unfinished JSON until commit".
- ACT-AUTH-14, ACT-AUTH-15: source: docs/spec/09-actions.md "Inspector" ("Repeated fields use the repeater's data key and explicit row numbers, counted from 1 in the editor and stored as zero-based coordinates. This targets a fixed row, not the invocation's current row"); e2e/action-fields.spec.ts "repeated targets use explicit row coordinates and raw edits preserve unavailable targets". What happens when the row is absent is the host's; the Inspector says so (packages/designer/src/panels/ActionFields.tsx), and no separate row is written.
- ACT-AUTH-16: source: e2e/action-fields.spec.ts "repeated targets use explicit row coordinates and raw edits preserve unavailable targets" ("at least 1"). A test is the only source.
- ACT-AUTH-17: source: docs/spec/09-actions.md "Inspector" ("Unknown or removed targets remain visible and are never silently reassigned"); e2e/action-fields.spec.ts "repeated targets use explicit row coordinates and raw edits preserve unavailable targets". The same holds for Focus component's target (packages/designer/src/panels/ActionFields.tsx).
- ACT-AUTH-18: source: docs/spec/09-actions.md "Inspector" ("Advanced parameters exposes the existing JSON object ... Code action parameters remain JSON because no authoring schema is declared for them").
- ACT-AUTH-19: source: docs/spec/09-actions.md "Inspector" ("Structured edits preserve unrelated parameters"); e2e/action-fields.spec.ts "action field selection uses data addresses and typed values without JSON" (`custom: 'keep'` survives).
- ACT-AUTH-20: source: docs/spec/09-actions.md "Inspector" ("invalid drafts are reported without committing"); e2e/action-fields.spec.ts "action field selection uses data addresses and typed values without JSON" and "host context values offer types and preserve unfinished JSON until commit". How the report reaches assistive technology is `A11Y`.
- ACT-AUTH-21: source: docs/spec/09-actions.md "Inspector" ("raw edits and undo refresh the structured fields"); e2e/action-fields.spec.ts "action field selection uses data addresses and typed values without JSON" and "repeated targets use explicit row coordinates and raw edits preserve unavailable targets". Undo itself is BUILD-UNDO-01.
- ACT-AUTH-22, ACT-AUTH-23: source: docs/spec/09-actions.md "Inspector" ("Document Settings owns code-action names, source, and default parameters"); docs/spec/06-inspector.md "Actions"; packages/designer/src/panels/Actions.test.tsx "authors reusable code actions at document scope".
- ACT-AUTH-24: source: packages/designer/src/panels/FormSettings.tsx (the key rules, and "already exists"); packages/designer/src/panels/FormSettings.test.tsx "an error in Settings". The code is the only source for the rule; the key rules themselves are DOC-LOAD-09, DOC-LOAD-10 and DOC-LOAD-11.
- ACT-AUTH-25: source: docs/spec/06-inspector.md "Actions" ("Both surfaces state that code actions require a host-injected sandbox evaluator"); docs/spec/09-actions.md "Inspector" ("saving a source string does not make it executable"); packages/designer/src/panels/Actions.test.tsx "authors reusable code actions at document scope".
- ACT-AUTH-26: source: packages/designer/src/panels/Actions.test.tsx "removes references when a shared code action is deleted". A test is the only source; it keeps the document clear of DOC-LOAD-13.
