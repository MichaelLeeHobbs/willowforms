# Component catalogue

Which components the standard kits offer, what answer each one collects, and how each behaves for a respondent. Area code `CAT`.

Repeater rows and step navigation belong to `FLOW`. The events a component raises belong to `ACT`. What every kit must draw, and switching kits, belong to `KIT`. How rendered components reach assistive technology belongs to `A11Y`. Editing a component's properties in the Inspector belongs to `CONF`. Link and image address safety is `SEC-DOCS-01`, `SEC-DOCS-02`, `SEC-DOCS-03` and `SEC-DOCS-04`.

## Layout (LAY)

| ID         | Requirement                                                                                                                                                     | Pri | Verify | Status   |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | --- | ------ | -------- |
| CAT-LAY-01 | The system shall offer Stack, Grid, Box and Card layout containers in both standard kits.                                                                       | P1  | Test   | Proposed |
| CAT-LAY-02 | The system shall give every form exactly one Screen as its outermost container, which an author cannot add from the palette.                                    | P1  | Test   | Proposed |
| CAT-LAY-03 | The system shall draw a form no wider than its Screen's authored maximum width.                                                                                 | P2  | Test   | Proposed |
| CAT-LAY-04 | The system shall separate the children of a Screen, Stack, Grid, Step or Repeater by that container's authored gap.                                             | P1  | Test   | Proposed |
| CAT-LAY-05 | The system shall arrange a Stack's children in a column or in a row, as the author chooses.                                                                     | P1  | Test   | Proposed |
| CAT-LAY-06 | The system shall wrap a Grid's children onto further rows rather than draw a column narrower than the Grid's authored minimum column width.                     | P1  | Test   | Proposed |
| CAT-LAY-07 | The system shall make a Grid with Fill width fill its parent, treating its authored column count as a maximum.                                                  | P1  | Test   | Proposed |
| CAT-LAY-08 | The system shall draw a Grid with Fill width as one column when its parent is narrower than the minimum column width.                                           | P2  | Test   | Proposed |
| CAT-LAY-09 | The system shall start a Grid added from the palette with Fill width turned on.                                                                                 | P2  | Test   | Proposed |
| CAT-LAY-10 | The system shall keep a saved Grid that does not turn Fill width on at the width it had before Fill width existed.                                              | P1  | Test   | Proposed |
| CAT-LAY-11 | The system shall draw a Box around its children with the authored padding, background colour and corner radius.                                                 | P2  | Test   | Proposed |
| CAT-LAY-12 | The system shall draw a Card's authored title and subtitle above its children.                                                                                  | P2  | Test   | Proposed |
| CAT-LAY-13 | The system shall offer a Step container that, when added, shows only while the host's current step names that Step.                                             | P1  | Test   | Proposed |
| CAT-LAY-14 | The system shall offer a Repeater container whose answer is a list of rows and which draws its contents once per row.                                           | P1  | Test   | Proposed |
| CAT-LAY-15 | The system shall apply the nearest explicit density choice of an enclosing layout component to everything inside it, repeated rows included.                    | P2  | Test   | Proposed |
| CAT-LAY-16 | The system shall keep the inherited density, and for the whole form the host's default, where a layout component's density is missing, Inherit or unrecognised. | P2  | Test   | Proposed |
| CAT-LAY-17 | The system shall reduce to 12 pixels, under compact density, only the gaps the author did not set.                                                              | P3  | Test   | Proposed |
| CAT-LAY-18 | The system shall not hide labels, helper text, errors or focus indicators under compact density.                                                                | P1  | Test   | Proposed |

- CAT-LAY-01: source: docs/spec/03-components.md "Layout"; test/kit-contract.test.tsx "offers the same component types".
- CAT-LAY-02: source: docs/spec/03-components.md "Layout" ("`Screen` is the root and is never in the palette"); docs/spec/02-kit-contract.md "Reference-kit verification" ("Exactly one component is the root, and it is not in the palette").
- CAT-LAY-03: source: docs/spec/03-components.md "Layout" (`maxWidth`); e2e/layout.spec.ts "resetting Screen max width shows the effective kit default".
- CAT-LAY-04: source: docs/spec/03-components.md "Layout" and "Shared property traits" (`gap`). That a gap is a number of pixels is the kit rule in docs/spec/02-kit-contract.md "What a length means", left to `KIT`.
- CAT-LAY-05: source: docs/spec/03-components.md "Layout" (`direction`).
- CAT-LAY-06: source: docs/spec/03-components.md "Layout" ("intrinsic columns rather than a twelve-column system").
- CAT-LAY-07, CAT-LAY-08, CAT-LAY-09, CAT-LAY-10: source: docs/spec/03-components.md "Layout" (the `fillWidth` paragraph); e2e/grid-layout.spec.ts "authors new grids with Fill width enabled" and "fill-width Grid caps columns, reflows, and preserves legacy sizing".
- CAT-LAY-11: source: docs/spec/03-components.md "Layout" (`padding`, `background`, `radius`); test/kit-contract.test.tsx "a length means the same thing in both kits". Refusing unsafe authored colour values belongs to the styling boundary of `SEC-DOCS-07`, `SEC-DOCS-09` and `SEC-DOCS-10`.
- CAT-LAY-12: source: docs/spec/03-components.md "Layout" (`title`, `subtitle`).
- CAT-LAY-13: source: docs/spec/03-components.md "Layout" and "Controlled navigation" (`defaultRenderWhen`). Everything else a Step does is `FLOW`.
- CAT-LAY-14: source: docs/spec/03-components.md "Layout" and "Repeated scope". Adding, removing and limiting rows is `FLOW`.
- CAT-LAY-15, CAT-LAY-16, CAT-LAY-17, CAT-LAY-18: source: docs/spec/03-components.md "Layout" (the `density` paragraph); e2e/density.spec.ts "imports density, inherits it, and keeps section overrides and errors usable". The Settings tab's Form density control is `CONF`.

## Display and feedback (DISP)

| ID          | Requirement                                                                                                                                        | Pri | Verify | Status   |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | --- | ------ | -------- |
| CAT-DISP-01 | The system shall offer Heading, Text, Divider and Image display components and Alert and Progress feedback components in both standard kits.       | P1  | Test   | Proposed |
| CAT-DISP-02 | The system shall not collect or submit an answer from a Heading, Text, Divider, Image, Alert, Progress, Link, Breadcrumbs, Button or Button group. | P1  | Test   | Proposed |
| CAT-DISP-03 | The system shall draw a Heading at the level from one to six that the author chooses.                                                              | P1  | Test   | Proposed |
| CAT-DISP-04 | The system shall draw a Heading whose document names no level, or a level it does not recognise, at level two in both standard kits.               | P1  | Test   | Proposed |
| CAT-DISP-05 | The system shall draw Text in the body, small or caption style the author chooses.                                                                 | P2  | Test   | Proposed |
| CAT-DISP-06 | The system shall align Text to the start, the centre or the end of the line in the form's writing direction, as the author chooses.                | P2  | Test   | Proposed |
| CAT-DISP-07 | The system shall draw an Image at its authored width in pixels, or at the full available width when that width is zero.                            | P2  | Test   | Proposed |
| CAT-DISP-08 | The system shall keep an Image's own proportions when its authored height is zero.                                                                 | P2  | Test   | Proposed |
| CAT-DISP-09 | The system shall fit an Image that has an authored height to its box by covering, containing or filling, as the author chooses.                    | P3  | Test   | Proposed |
| CAT-DISP-10 | The system shall not draw an Image wider than the space that holds it.                                                                             | P2  | Test   | Proposed |
| CAT-DISP-11 | The system shall draw an Alert with its authored title and text at the information, success, warning or error severity the author chooses.         | P1  | Test   | Proposed |
| CAT-DISP-12 | The system shall draw an Alert whose severity it does not recognise as an information alert.                                                       | P2  | Test   | Proposed |
| CAT-DISP-13 | The system shall draw Progress as a bar or as a circle, as the author chooses.                                                                     | P2  | Test   | Proposed |
| CAT-DISP-14 | The system shall show Progress at its authored percent complete, held between 0 and 100.                                                           | P2  | Test   | Proposed |
| CAT-DISP-15 | The system shall show Progress as running with no known length when its value is empty or not a number.                                            | P2  | Test   | Proposed |

- CAT-DISP-01: source: docs/spec/03-components.md "Display" and "Feedback"; test/kit-contract.test.tsx "offers the same component types".
- CAT-DISP-02: source: docs/spec/03-components.md "Display" (the Data-bound column), "Feedback" ("display-only and never data-bound"), "Inputs" (Button and ButtonGroup have no data type) and "Navigation".
- CAT-DISP-03: source: docs/spec/03-components.md "Display" (`level`).
- CAT-DISP-04: source: docs/COMPATIBILITY.md "Pre-beta corrections" ("Both kits default headings to H2"); docs/spec/02-kit-contract.md "And the rules driven per kit from outside that block" ("A heading whose document names no rank renders at the same rank in both kits"); test/kit-defaults.test.tsx "starts new headings at H2".
- CAT-DISP-05: source: docs/spec/03-components.md "Display" (`variant`); docs/spec/02-kit-contract.md "And the rules driven per kit from outside that block" ("Two declared variants still render differently").
- CAT-DISP-06: source: docs/spec/03-components.md "Display" (`align`); packages/kit-html/src/definitions.ts names the choices Start, Center and End. That they follow the writing direction is drawn from those names; see the conflict reported with this draft.
- CAT-DISP-07, CAT-DISP-08, CAT-DISP-09: source: docs/spec/03-components.md "Display" ("Image width and height are pixels"); e2e/images.spec.ts "images and backgrounds load, fit, embed, clear, and undo".
- CAT-DISP-10: source: packages/kit-html/src/renderers.tsx and packages/kit-mui/src/renderers.tsx (`Image`). The code is the only source.
- CAT-DISP-11: source: docs/spec/03-components.md "Feedback" (`text`, `severity`, `title`).
- CAT-DISP-12: source: packages/kit-html/src/renderers.tsx and packages/kit-mui/src/renderers.tsx (`Alert`). The code is the only source; docs/spec/02-kit-contract.md "And the rules driven per kit from outside that block" requires only that such an Alert still carries a role, which is `A11Y`.
- CAT-DISP-13: source: docs/spec/03-components.md "Feedback" ("`Progress` covers linear and circular through `variant`").
- CAT-DISP-14: source: packages/kit-html/src/definitions.ts (`value` hint "Percent complete"); both kits' `Progress` renderer holds it between 0 and 100. The code is the only source.
- CAT-DISP-15: source: packages/kit-html/src/definitions.ts (`value` hint "Leave empty for an indeterminate bar"); docs/spec/02-kit-contract.md "Reference-kit verification" ("A progress value that is not a number is not reported").

## Inputs (INP)

| ID         | Requirement                                                                                                                        | Pri | Verify | Status   |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------- | --- | ------ | -------- |
| CAT-INP-01 | The system shall offer Text field, Text area, Number field, Date picker, Button and Button group components in both standard kits. | P1  | Test   | Proposed |
| CAT-INP-02 | The system shall report a Text field's answer as one line of text exactly as the respondent entered it.                            | P1  | Test   | Proposed |
| CAT-INP-03 | The system shall report a Text area's answer as text of several lines exactly as the respondent entered it.                        | P1  | Test   | Proposed |
| CAT-INP-04 | The system shall report a Number field's answer as a number.                                                                       | P1  | Test   | Proposed |
| CAT-INP-05 | The system shall report a Date picker's answer as a calendar date in year-month-day text.                                          | P1  | Test   | Proposed |
| CAT-INP-06 | The system shall report a Number field or Date picker that the respondent clears as unanswered.                                    | P1  | Test   | Proposed |
| CAT-INP-07 | The system shall offer a respondent only dates between a Date picker's authored earliest and latest dates.                         | P2  | Test   | Proposed |
| CAT-INP-08 | The system shall display an answer that is not text, held by a text, number or date field, as its text form.                       | P2  | Test   | Proposed |
| CAT-INP-09 | The system shall show a field's helper text beneath it, replaced by the field's error while it has one.                            | P1  | Test   | Proposed |
| CAT-INP-10 | The system shall prevent a respondent from changing the answer of a field the author marked disabled.                              | P1  | Test   | Proposed |
| CAT-INP-11 | The system shall place a Number field's or a Select's label beside its control when the author turns on Inline label.              | P2  | Test   | Proposed |
| CAT-INP-12 | The system shall draw an inline-labelled control at its authored Input width, and never narrower than 40 pixels.                   | P3  | Test   | Proposed |
| CAT-INP-13 | The system shall draw a Button with its authored text in the filled, outlined or text-only emphasis the author chooses.            | P2  | Test   | Proposed |
| CAT-INP-14 | The system shall not submit or reset an enclosing page form when a respondent presses a Button.                                    | P1  | Test   | Proposed |
| CAT-INP-15 | The system shall arrange the buttons in a Button group in a row or in a column, as the author chooses.                             | P3  | Test   | Proposed |

- CAT-INP-01: source: docs/spec/03-components.md "Inputs"; test/kit-contract.test.tsx "offers the same component types".
- CAT-INP-02, CAT-INP-03, CAT-INP-04: source: docs/spec/03-components.md "Inputs" (the Data type column); docs/spec/02-kit-contract.md "And the rules driven per kit from outside that block" ("A data-bound control hands back what the person entered").
- CAT-INP-05: source: docs/spec/03-components.md "Inputs" (`date`); packages/kit-html/src/definitions.ts ("ISO date" in the earliest and latest hints). The answer's text form comes from the code; no document states it.
- CAT-INP-06: source: packages/kit-html/src/renderers.tsx and packages/kit-mui/src/renderers.tsx (`NumberField`, `DatePicker` report `null` for an empty input). The code is the only source. That an empty answer passes every rule but required is `VAL-RULE-02` and `VAL-RULE-05`.
- CAT-INP-07: source: docs/spec/03-components.md "Inputs" (`min`, `max`). See the conflict reported with this draft: validation does not enforce the bound.
- CAT-INP-08: source: docs/spec/02-kit-contract.md "And the rules driven per kit from outside that block" ("A control holding a value that is not a string still shows it"); test/kit-contract.test.tsx "a control holding a value that is not a string".
- CAT-INP-09: source: docs/spec/03-components.md "Shared property traits" (`helperText`, "Shown beneath, replaced by an error"). Displaying the error itself is `FILL-ERR-01`.
- CAT-INP-10: source: docs/spec/03-components.md "Shared property traits" (`disabled`).
- CAT-INP-11, CAT-INP-12: source: docs/spec/03-components.md "Inline field labels"; e2e/inline-fields.spec.ts "inline fields keep labels, control widths, errors, and keyboard input usable". That the label stays associated with the control is `A11Y`.
- CAT-INP-13: source: docs/spec/03-components.md "Inputs" (`text`, `variant`). Accepting the other kit's emphasis names is `KIT`.
- CAT-INP-14: source: docs/spec/09-actions.md "Submission and Preview" ("it does not submit an HTML form"). A Button's click event is `ACT`.
- CAT-INP-15: source: docs/spec/03-components.md "Inputs" (`ButtonGroup`, `orientation`).

## Selection (CHO)

| ID         | Requirement                                                                                                                     | Pri | Verify | Status   |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------- | --- | ------ | -------- |
| CAT-CHO-01 | The system shall offer Select, Checkbox, Radio group, Radio item and Switch components in both standard kits.                   | P1  | Test   | Proposed |
| CAT-CHO-02 | The system shall let a respondent choose one of a Select's authored options from a drop-down list.                              | P1  | Test   | Proposed |
| CAT-CHO-03 | The system shall offer an empty first choice in a Select, labelled by its placeholder, until the respondent picks an option.    | P2  | Test   | Proposed |
| CAT-CHO-04 | The system shall let a respondent choose exactly one of a Radio group's authored options.                                       | P1  | Test   | Proposed |
| CAT-CHO-05 | The system shall treat each Radio item inside a Radio group as a further option of that group.                                  | P2  | Test   | Proposed |
| CAT-CHO-06 | The system shall show as chosen the option whose value equals the stored answer, whatever that value's JSON type.               | P1  | Test   | Proposed |
| CAT-CHO-07 | The system shall show no option as chosen when the stored answer matches none of the options.                                   | P1  | Test   | Proposed |
| CAT-CHO-08 | The system shall leave every radio button unchecked in an unanswered Radio group, including an item whose value is empty.       | P1  | Test   | Proposed |
| CAT-CHO-09 | The system shall still draw a Select or Radio group whose option list the document got wrong, offering the options it can read. | P2  | Test   | Proposed |
| CAT-CHO-10 | The system should disable a Radio item that is not inside a Radio group.                                                        | P3  | Test   | Proposed |
| CAT-CHO-11 | The system shall report a Checkbox or Switch answer as true when the respondent turns it on and false when they turn it off.    | P1  | Test   | Proposed |
| CAT-CHO-12 | The system shall show a Checkbox or Switch as off when its stored answer is anything other than true.                           | P2  | Test   | Proposed |

- CAT-CHO-01: source: docs/spec/03-components.md "Selection"; test/kit-contract.test.tsx "offers the same component types".
- CAT-CHO-02, CAT-CHO-04: source: docs/spec/03-components.md "Selection". The chosen option's reported value and type are `FILL-ANS-07`; see the conflict reported with this draft about the Select and Radio group data type.
- CAT-CHO-03: source: docs/spec/03-components.md "Selection" (`placeholder`); packages/kit-html/src/definitions.ts (placeholder hint "The empty choice, shown until somebody picks one").
- CAT-CHO-05: source: docs/spec/03-components.md "Selection" ("`RadioGroup` takes `options` and also accepts `RadioItem` children"); docs/spec/02-kit-contract.md "Reference-kit verification" ("A RadioItem child can be selected in its group").
- CAT-CHO-06, CAT-CHO-07: source: docs/spec/02-kit-contract.md "And the rules driven per kit from outside that block" ("A select holding a number shows the option the data names" and "A select shows nothing when the data names no option").
- CAT-CHO-08: source: packages/kit-mui/src/renderers.test.tsx "has nothing checked when no item carries a value" and "has nothing checked when the items do carry values". Tests are the only source.
- CAT-CHO-09: source: docs/spec/02-kit-contract.md "And the rules driven per kit from outside that block" ("A component whose options a document got wrong still renders" and "A select still shows an option it can read").
- CAT-CHO-10: source: packages/kit-html/src/renderers.tsx (`RadioItemNode`, "Disabled outside a group"). The code is the only source, and packages/kit-mui/src/renderers.test.tsx "lets an item outside a group be checked, because nothing forbids one" asserts the opposite; see the conflict reported with this draft.
- CAT-CHO-11: source: docs/spec/03-components.md "Selection" (`boolean` data type). That a required one must be on is `VAL-RULE-04`.
- CAT-CHO-12: source: docs/spec/02-kit-contract.md "Writing your own kit" ("`bool` (only `true` is on)").

## Navigation (NAV)

| ID         | Requirement                                                                                                   | Pri | Verify | Status   |
| ---------- | ------------------------------------------------------------------------------------------------------------- | --- | ------ | -------- |
| CAT-NAV-01 | The system shall offer Link and Breadcrumbs components in both standard kits.                                 | P1  | Test   | Proposed |
| CAT-NAV-02 | The system shall draw a Link as its authored text leading to its authored address.                            | P1  | Test   | Proposed |
| CAT-NAV-03 | The system shall open a Link's address in the same tab or in a new tab, as the author chooses.                | P2  | Test   | Proposed |
| CAT-NAV-04 | The system shall give a page that a Link opens in a new tab no means to control the form's page.              | P1  | Test   | Proposed |
| CAT-NAV-05 | The system shall draw Breadcrumbs as a trail of the authored items in order, each leading to its own address. | P2  | Test   | Proposed |
| CAT-NAV-06 | The system shall draw the last breadcrumb as the current page rather than as a link.                          | P2  | Test   | Proposed |

- CAT-NAV-01: source: docs/spec/03-components.md "Navigation"; test/kit-contract.test.tsx "offers the same component types".
- CAT-NAV-02: source: docs/spec/03-components.md "Navigation" (`text`, `href`). Which addresses are refused, and drawing a refused one as text, are `SEC-DOCS-01`, `SEC-DOCS-02` and `SEC-DOCS-03`.
- CAT-NAV-03: source: docs/spec/03-components.md "Navigation" (`target`).
- CAT-NAV-04: source: packages/kit-html/src/renderers.tsx and packages/kit-mui/src/renderers.tsx (`LinkNode`, `noopener noreferrer`). The code is the only source.
- CAT-NAV-05: source: docs/spec/03-components.md "Navigation" (`items`); packages/kit-html/src/definitions.ts (items hint "Array of { label, href }"). Refused breadcrumb addresses are `SEC-DOCS-02`.
- CAT-NAV-06: source: packages/kit-html/src/definitions.ts (items hint "The last one is the current page and is not a link"). The code is the only source; how the current page is announced is `A11Y`.
