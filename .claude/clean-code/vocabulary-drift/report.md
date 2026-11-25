```
Vocabulary audit: willowforms  commit 8e92d4cdbf476b77b614611d869ec24e35919337  2026-11-25
Catalog: .claude/clean-code/vocabulary-drift/   Work folder: session scratch folder outside the repo (path withheld, public repo)
Since last run: first run
Coverage: 14 surface/extension groups, 0 failed, 0 problems   PASS
Sites: 9770 (doc 2966, code 4702, type 849, route 6, ui 970, schema 277)   Terms: 3190   Tokens: 39109 kept, 17050 stopped, 3103 short
Contexts: top-level app/package folders (core, demo-server, designer, docs, examples, kit-html, kit-mui, playground, renderer, root, scripts)   Seeds: 2 files, 332 of 332 lines
Concepts: 93   Mapped: 1276 of 1276 required terms   PASS
Candidates: 66 judged of 88 (rest cut by rank at the spend cap)
Verdicts: 24 synonym, 24 distinct, 11 homonym, 7 generic; 49 structural
Calibration: SYNONYM, DISTINCT, HOMONYM, GENERIC (two fresh judges, agreed with each other and with the settled answers)
Spend: $16.10 of $17.00 cap (estimated from tokens in the worker transcripts at list price; inventory before approval, about $3.81, not counted)
Canaries: 3 of 3 behaved as planted   PASS
Drifting concepts: 24 (first run)
```

**How to read this.** There is no database, so the `schema` surface is the persisted form document: fields of the stored types in `packages/core/src/types.ts` and the component types and property names kits declare. Four sample-form content files are bucketed as fixtures. CSS class names and agent skills are not sites. Second counts were line patterns (declarations, field lines, `/api` strings, UI properties and attributes, sentence-like literals, Markdown lines with fenced blocks removed); a line-by-line check of sentence-like literals left 11 of 293 unextracted, all thrown, logged, compared or split strings and comments. The two judges each judged several batches in one context. The tool drops `data` and `key` as stop words, so data key and node key are only visible through other names. Reference counts are by search over non-test source and include same-spelled identifiers of other concepts, so treat them as ceilings. Item 1 holds two of the 24 drifting concepts (C0001, C0002) on the same evidence.

## Decision list

1. Form document. Names: form (423 sites), document (334), doc (79), design (40, docs and UI). SYNONYM, usage (builders.ts:120:17, store.ts:205:3); form is also a HOMONYM: a stored entry in `apps/demo-server/` (7 sites), the document elsewhere (416). Unconfirmed: confirm before renaming. Persisted `FormDocument` and the 5 `/api/forms` routes are aliases. UI label: "Form" today; keep.
2. Validation rule. Names: rule (57 code, 10 type sites), validation (1 schema, 2 code, 2 type). SYNONYM, structural (types.ts:109:3, tree.ts:457:17); validation is also a HOMONYM: a rule in `types.ts` and `tree.ts` (5 sites), the act of checking elsewhere (110). The schema name is not the most used, so choose: `validation` to `rule` (4 declared sites, up to 81 references, persisted `validations` stays an alias), or `rule` to `validation` (67 declared sites, up to 462 references).
3. Validation message. Names: error, message. SYNONYM, usage (renderers.tsx:56:25, validation.ts:279:11). Unconfirmed: confirm before renaming. error is also a HOMONYM: a structural fault in `core/src/tree.ts` and `core/src/document.ts` (4 sites), a failed answer elsewhere (182).
4. Row (HOMONYM). A tree panel line in `designer/src/panels/Tree.tsx` (13 sites), a repeater entry elsewhere (249). Default: rename the tree sense `row` to `treeRow` in that one file (13 sites; type `TreeRow` is already so named); repeater `row` stays, persisted scope value `row` untouched.
5. Action reference. Names: ref (36 code, 4 type sites), reference (docs and UI only, 0 declared). SYNONYM, structural (types.ts:72:18, actions.ts:167:34). Default: code name `ref`, nothing to rename in code; persisted `ActionRef` untouched. action is also a HOMONYM: the reference in `designer/src/panels/Actions.tsx` (14 sites), the operation elsewhere (158). Default: rename that file's locals to `ref` (14 sites).
6. Data key, called name (HOMONYM). A data key in `core/src/rows.ts`, `designer/src/store.ts`, `renderer/src/index.tsx` (19 sites); the form name in the example builder. The other 200 or so catch-all sites are ordinary `name` fields. Default: rename the data-key sense to `dataKey` in those files (19 sites); persisted `name` and `dataKey` fields untouched.
7. Visibility condition. Names: visibility, when. SYNONYM, usage (Properties.tsx:248:10, 329:19). Unconfirmed: confirm before renaming. when is also a HOMONYM: the rule guard in `Rules.tsx` and `types.ts` (18 sites), visibility elsewhere (145, most of them ordinary prose). Persisted `when` and `renderWhen` are aliases. UI label: "Show when" today; keep.
8. Rule guard. Names: when (14 schema sites), guard (5 code, 3 UI, 31 doc sites). SYNONYM, structural (rows.ts:360:13, types.ts:122:54). The schema name is not the name used most for this concept, so choose: `guard` to `when` (5 code sites, up to 22 references), or `when` to `guard` (14 persisted sites as aliases, plus 4 sites in `Rules.tsx`). UI label: "Guard" today.
9. Translation. Names: translation (1 schema, 7 type, 16 code sites), bundle (10 code, 16 doc), message (renderer and core `messages` option). SYNONYM, structural (renderer/src/index.tsx:696:11, 144:3, tree.ts:673:22). Default: code name `translation`; rename `bundle` (10 code sites, up to 48 references). Persisted `translations` and the public `messages` option are aliases, do not rename.
10. Image source. Names: src (2 schema sites), source (UI label; 17 code sites across all senses). SYNONYM, structural (kit-html definitions.ts:419:17, 420:18). The schema name is not the most used, so choose: code `source` to `src` (up to 104 references across senses), or leave persisted `src` (2 sites, alias) and keep `source` in helpers. UI label: "Source" today; keep.
11. Choice option. Names: option (5 schema, 8 type, 50 code sites), choice (6 code, 5 UI). SYNONYM, structural (definitions.ts:191:17, OptionsEditor.tsx:62:42). Default: code name `option`; rename `choice` (6 code sites, up to 27 references, `loadChoice` to be checked first). Persisted `options` untouched. UI label: "choices" and "options" both today; decide one.
12. Link address. Names: href (2 schema sites), address (2 UI labels). SYNONYM, structural (kit-html definitions.ts:624:17, 625:18); address is also a HOMONYM: the link in the two kits (2 sites), an answer's place elsewhere (70). Default: code name `href`, nothing to rename; `href` is persisted. UI label: "Address" today; keep.
13. Schema (HOMONYM). JSON Schema export in `core/src/schema.ts`, `DocumentDialog.tsx`, SPEC_SCOPE_REVIEW (14 sites); property schema in `kit.ts` and `designer/src/panels/` (10); field data type elsewhere (72, a mixed catch-all). Default: qualify new identifiers (`jsonSchema`, `propSchema`, `fieldSchema`); persisted `schema` and the exported type names untouched.
14. Component node. Names: node (226 code, 28 type sites), component (24 code, 11 type, 51 UI). SYNONYM, structural (types.ts:144:18, character-layout.ts:70:22); component is also a HOMONYM: the kit's definition in `kit.ts` and `Palette.tsx` (12 sites), the node elsewhere (359, mostly docs and UI). Default: code name `node`; rename `component` where it holds a node (at most 24 code sites, up to 490 references across both senses). `ComponentNode`, `ComponentDef` and the public store methods (`addComponent`, `removeComponent`) are aliases. UI label: "Component" today; keep.
15. Component definition. Names: component, definition. SYNONYM, usage (kit.ts:158:14, builders.ts:11:9). Unconfirmed: confirm before renaming. `Kit.components` is public.
16. Document problem. Names: error (13 type sites), fault (4 code sites). SYNONYM, structural (demo-server index.ts:122:9, 321:9). Default: code name `error`; rename `fault`, `faults`, `storageFaults` in `apps/demo-server/src/index.ts` (4 sites, 26 references by search). No persisted or public site.
17. Form renderer. Names: renderer, runtime. SYNONYM, usage (kit-mui/README.md:19:1, usage.tsx:34:17). Unconfirmed. renderer is also a HOMONYM: one component's drawing code in both kits, the designer and the playground (19 sites), the whole-form runtime elsewhere (130). Public names untouched; default: keep, and say "form renderer" or "component renderer" in docs.
18. Component tree panel. Names: tree, structure. SYNONYM, usage (Tree.tsx:285:20, LeftPane.tsx:48:17). Unconfirmed. UI label: "Form structure" beside a "Tree" tab today; decide one.
19. Designer pane. Names: panel (10 code, 1 type, 79 doc sites), pane (2 code, 1 type, 37 doc). SYNONYM, structural (docs/spec/11-theming.md:74:1, Designer.tsx:375:10). Default: code name `panel`; rename `LeftPane`, `LeftPaneProps`, `PaneHandle` (3 sites, 9 references by search). No persisted site.
20. Selection. Names: selected (32 code, 8 type sites), selection (2 code, 2 type). SYNONYM, structural (Designer.tsx:122:28, Tree.tsx:22:3). Two forms of one word. Default: keep both, no rename.
21. Property mode. Names: kind (7 schema, 19 type sites), mode (17 code, 3 type, across theme mode too). SYNONYM, structural (tree.ts:483:7, Binding.tsx:65:9). Default: code name `kind`; rename the binding-mode locals only (at most 17 code sites, up to 82 references, `themeMode` excluded). Persisted `kind` untouched. Docs call them "binding modes"; decide with the rename.
22. Device. Names: device (7 type, 17 code sites), breakpoint (9 doc, 2 UI, 0 code). SYNONYM, structural (types.ts:12:13, 06-inspector.md:135:1). Default: code name `device`, nothing to rename in code; replace `breakpoint` in 9 doc and 2 UI sites. The persisted `css` keys are untouched.
23. Usage synonyms with no rename proposed, each unconfirmed: min and minimum (Rules.tsx:26:24; min is persisted and minimum is JSON Schema's word), designer and builder (README.md:69:1, docs only), cap and max (08-validation.md:214:1, image.ts:4:14), submission and submit (Canvas.tsx:265:33, noun and verb of one act). Default: none.
24. Kept apart, no action (24 DISTINCT, two marked unsettled: form name vs title, property schema vs trait). Examples: preset has a recipe; language vs its tag; address vs row path; code vs expression; announcement vs message; undo history vs undo and redo; visibility, guard, operand, drag, drop target and canvas size parts. Every one is in `claims.jsonl` with its cites. 7 GENERIC terms (for example input, namespace, code, person) need no name.

## Prevention drafts

Draft lint entries for the existing `no-restricted-syntax` lists in `eslint.config.js` (add to each list; a later block replaces an earlier one's options): `{ selector: "VariableDeclarator[id.name=/^(faults?|storageFaults)$/]", message: "Use error: a document problem is an error." }` and `{ selector: ":matches(FunctionDeclaration, VariableDeclarator, TSInterfaceDeclaration)[id.name=/Pane(Handle|Props)?$/]", message: "Use Panel for a designer side area." }`. Cause: CLAUDE.md and CONTRIBUTING.md use no retired name. The docs use pane (37 sites) and breakpoint (9 sites), and 06-inspector.md:135 and 04-shell.md:110 call a `Device` a breakpoint; replace that word with device there.

## Glossary

Draft, not valid until the decision list is settled. Definitions were written from the term table, not checked against source; only the verdicts above are.

```
JSON Schema export  The projection of a form document into a JSON Schema of its answers.
JSON dialog  The designer dialog and view that show and edit the document as JSON text.
action  A named operation a form runs in response to an event: built-in, or code.
action parameter  Values passed to an action when it is run by a reference.
action reference  The stored link on a node's event that names an action and its parameters.
announcement  A message sent to the live region for assistive technology.
answer  One value a person gives in a field.
answer address  The computed full place of one answer or node in the answers, including row path and data key.
answers record  The whole set of answers for a form, keyed by data key.
author  The person who builds a form in the designer.
canvas  The designer area where the form is shown for editing by select and drag.
canvas size  The width and height at which the canvas is shown: viewport, or fixed page or screen size, such as paper.
child index  The position of a node among its parent's children.
choice option  One selectable entry of a select, radio or similar field, with label and value. Code name: option. Not: choice, in code.
code action  An author-written action, held as code and run by the evaluator.
comparison and operand  A single comparison in a condition: its operator and the two sides, each a field, literal, context value or similar.
component definition  What a kit registers for one component type: its name, schema, defaults, palette group, icon and renderer.
component event  A thing that happens to a component (click, change, blur) and runs actions.
component node  One component instance in the form tree, with key, type, props and children. Code name: node. Not: component, in code.
component property  A named setting (prop) on a component node, declared by its definition's schema.
component renderer  The function or React component a kit supplies to draw one component type.
component tree panel  The designer panel showing the document's nodes as an outline.
component type  The name that says which component definition a node uses.
condition  An authored logical test over answers or context: comparisons joined by and, or and not.
container  A component whose definition accepts children, or a node of such a type.
data key  The name under which a field's answer is stored in its scope.
data scope  The set of names in which data keys are resolved: the whole form, or one repeater row.
density  How compactly form components are spaced and sized.
designer  The authoring app component: the whole visual builder that edits a form document.
designer pane  A collapsible, resizable side area of the designer with one or more tabs or panels. Code name: panel. Not: pane (retired).
designer shell  The outer frame of the designer that lays out its panes, toolbar and shortcuts.
designer tab  A tab that switches what a designer pane or inspector shows.
designer theme  The light, dark or system appearance of the designer chrome.
device  A screen size class (mobile, tablet, desktop) with its breakpoint, for styles and preview width. Code name: device. Not: breakpoint (retired).
document limit  A fixed maximum the product sets on documents or their use, such as depth, count, length, rows or body size.
document problem  One finding about a malformed or inconsistent document: a structural error, diagnostic, duplicate key or warning with a path or severity. Code name: error. Not: fault (retired).
document store  The persistence a host supplies: where documents are kept, listed, loaded and removed (memory, file, browser storage, demo server).
draft  Work in progress not yet confirmed: the unsaved design kept for later, or a field editor's uncommitted text.
drag  A pointer drag in the designer, with its source: a palette entry or a node.
drop target  The place a drag would land: parent, index, slot or zone, and how it is found from a pointer.
effect  The instruction an action returns for the renderer or host to apply, such as set a value or navigate.
evaluator  The function a host supplies to run author-controlled code; core has no default.
event payload  The data that goes with an event the form emits to the host.
expression  Author-controlled code or formula text that computes a value or test.
field  A component that collects an answer, with a data key, label and rules.
field data type  The type an answer must have, such as string, number, array or boolean.
form document  The whole authored form as data: metadata, languages, settings and the component tree that the designer edits and the renderer runs.
form name  The human name of a form or document shown in lists and headers, which the author can change.
form renderer  The runtime that displays a form document, holds answers, and runs its conditions, rules and actions.
form settings  Options on the whole form document, such as name, density and languages.
form step  One page of a multi-step form or wizard, and the moving between them.
format version and migration  The number in a document that says which shape of the format it follows, and converting an older shape at load.
host  The application that embeds the designer or renderer and owns storage, network and evaluator.
host context  Read-only values the host passes in for expressions and bindings, alongside answers.
image source  Where an image component's picture comes from, or a background image and its embedded data.
import boundary  Checking and normalizing an untrusted document, pasted or loaded, before normal use.
inspector  The designer panel that edits the selected node's properties, styles, rules and events.
interchange  Moving a document in or out as JSON: import, export, download, paste and copy.
kit  A package or set of component definitions and renderers for one UI library, given to designer and renderer.
label text  The visible name of a component and its help, hint, description or helper text.
language  A locale the form can be shown in, with tag, name and direction.
link address  The address a link or navigation goes to, and whether it is safe to follow. Code name: href. Not: address, in code.
node key  The unique id of a component node in a document's tree.
node styling  Authored style on a node: CSS text, declarations, spacing, borders, colours, per device.
palette  The designer panel listing components and presets that can be added.
palette group  The category under which a component appears in the palette.
parent-child relation  The link between a node and its enclosing container node, and the list of children it holds.
preset  A ready-made set of nodes offered in the palette, with its recipe.
preview  The view of the form running as a respondent would see it from the designer.
property binding  A stored value that ties a property to data, a context value, a translation or a computation instead of a literal.
property editor  The control in the inspector that edits one property of a node.
property mode  How a property gets its value: static literal, localized, bound to data, or computed. Code name: kind. Not: mode (retired for bindings).
property schema  The declared type, constraints and traits of a component's properties in its definition.
repeater  A container component that shows its children once per entry of a list answer.
repeater row  One repeated entry of a repeater, with its own answers and scope.
respondent  The person who fills in a form.
row index  The position of one entry among a repeater's rows.
rule guard  The condition that decides whether a validation rule applies.
rule parameter  The limit or argument a rule carries, such as a minimum, pattern, or list of allowed values.
saved form entry  A form document as kept by a host's store: the stored unit with its own id, name or title, and dates, that lists of forms show.
selection  The currently selected node or nodes in the designer, and hover of a node.
starting layout  A ready-made whole form or layout offered to start from, or a demo example form.
submission  The act and data of sending a completed form's answers to the host.
surface  A designer area where nodes are drawn and drops resolved, such as canvas or tree panel, with its measured elements.
theme token  A named CSS variable that sets the look of designer or HTML kit.
translation  The text of one message id in one language, or the bundle of them for a language. Code name: translation. Not: bundle (retired).
tree edit operation  An immutable change to the component tree: add, insert, move, remove, duplicate, rename, replace, update.
tree panel row  One line in the designer's component tree listing, standing for a node at a depth.
undo history  The stack of earlier and later documents that undo and redo step through.
validation message  The text shown when an answer fails a rule.
validation rule  An authored constraint an answer must meet, with kind, parameters, message and guard.
validation run  Running rules over answers and collecting messages, with when they run (while typing, on blur, on submit).
visibility condition  The condition on a node (renderWhen) that says if it is shown, and the hidden state that follows.
```
