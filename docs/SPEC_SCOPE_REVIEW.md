# Specification scope review

Review date: 2026-09-05. Reviewed all thirteen contracts in [the specification](spec/README.md), together with the README, roadmap, ideas, beta review, and accessibility record, against the approved mission and product principles. This is a product-scope review; it does not establish new runtime or accessibility verification.

## Decisions already applied

The README and specification now lead with the mission. The product definition explicitly includes respondents and the complete author-to-respondent workflow. The host owns storage, permissions, distribution, and business workflows.

Richer expression tooling and direct canvas keyboard selection are removed from product scope. Generic HTML attribute passthrough is replaced by accessibility requirements expressed through ordinary properties, with a complete cross-kit audit still outstanding. Existing expressions, code actions, components, and the Tree keyboard workflow remain supported.

The recommendations below are proposals for product-owner review. They have not been applied to the behavioral contracts, implementation, or public API.

## 1. Ordinary authoring exposes too much programming

**Highest priority.** [Binding modes](spec/07-bindings.md#which-modes-a-property-offers) offer expressions unless a kit opts out. [Action authoring](spec/09-actions.md#authoring) exposes JSON parameters and document-level source code. Meanwhile, [selection options](spec/03-components.md#selection), an everyday task such as adding Yes/No choices, are authored as JSON. Dropping an expression language service leaves this underlying product mismatch intact.

**Recommendation:** specify a default authoring experience centered on questions, choices, labels, structured conditions, and validation. Give option lists ordinary add/edit/remove/reorder controls. Let embedding developers explicitly enable advanced source and JSON editing where needed, while retaining the existing document model and runtime extensions. Existing documents containing advanced features must remain inspectable and preserve those values; disabling an editor must not discard content.

**Decision needed:** approve a small host configuration for advanced authoring surfaces and a structured choices editor. Keep permissions enforcement with the host; this does not justify a library-level roles or policy engine. This changes UI behavior and needs an implementation design rather than a documentation-only claim.

## 2. Styling risks becoming a general design tool

[The Style contract](spec/06-inspector.md#two-ways-to-write-the-same-text) makes raw CSS the answer to anything its structured controls omit. Authors can adjust per-component declarations at multiple breakpoints as well as kit-specific style properties. That is useful to specialists, but it places typography, spacing, and responsive design decisions on people whose task is to ask questions. Arbitrary authored colors and dimensions can also defeat accessible defaults.

**Recommendation:** retain existing styling support for compatibility, make kit defaults and a small set of layout controls the ordinary path, and put raw CSS behind the same explicit advanced-authoring choice. Expand style controls only for observed form tasks. Host themes remain the primary way to supply a professional, consistent appearance; the library should not grow a general CSS editor or promise accessibility for every author-supplied style.

## 3. Interchange has speculative next steps

[Not built](spec/10-interchange.md#not-built) describes JSON Schema import as an obvious inverse and proposes an archive containing a document, translations, and schema. Schema import serves developers starting from an API contract more directly than users creating questions. Translations already live inside the document, and the schema is derived from it, so the proposed bundle has no demonstrated transport gap.

**Recommendation:** move schema import and form archives to uncommitted ideas, each with a concrete adoption trigger. Keep JSON document interchange and the existing lossy schema export. Keep document-version migrations as a reliability obligation when a new version is introduced; that is necessary for saved forms, not speculative scope. Shared-subform composition is already uncommitted in [the document model](spec/01-document-model.md#one-form-per-document) and should stay that way.

## 4. Catalogue growth can drift into page building

The [catalogue](spec/03-components.md#the-catalogue) already includes Breadcrumbs, Progress, several visual containers, and presentation variants. Those can serve real forms, but their existence is not a reason to mirror a general component library. [A shared tooltip trait](spec/03-components.md#what-is-deliberately-absent) is described as planned without an author or respondent need that visible Help text cannot meet.

**Recommendation:** retain the implemented catalogue and stop treating component breadth as a success measure. Require a concrete form task for additions; leave application navigation and surrounding page layout to the host. Move the tooltip trait to ideas unless there is a specific accessible use case. Do not remove built components or merge their types without usage evidence and a compatibility plan.

## 5. Step navigation over-prescribes the host experience

[Where the current step lives](spec/03-components.md#where-the-current-step-lives) says the URL owns it, while the actual API correctly leaves navigation controlled by the host. A form inside a modal or embedded panel can reasonably use local state. [Branching](spec/03-components.md#branching-needs-no-new-vocabulary) also prohibits totals universally, although a fixed linear form can accurately display Step 2 of 5.

**Recommendation:** require host-controlled context and correct validation across reachable steps. Describe URL state as an integration option. Require truthful progress for the current flow; keep the built-in position-only display as its current behavior without forbidding a host from displaying a known total. Do not add a routing system or a branching workflow engine.

## 6. Kit requirements mix integration obligations with reference-kit preferences

[The kit rules](spec/02-kit-contract.md#rules-every-kit-must-satisfy) require an icon for every palette entry and a palette entry for every renderer. [The icon contract](spec/11-theming.md#icons) also says third-party icons are optional. A custom kit may legitimately have private renderers or omit icons. Asking it to run a suite that combines these preferences with semantic and accessibility obligations makes the extension point harder to use than the mission requires.

**Recommendation:** distinguish universal obligations, such as working controls, node identity, and accessibility, from this repository's reference-kit catalogue and presentation checks. Resolve the contradictory icon requirement. Preserve strong accessibility and runtime contracts; this does not require a plugin framework, a new registry, or arbitrary icon-source authoring.

## Reliability and accuracy that should take precedence

The accessibility audit is the approved next verification priority. Dropping a second keyboard selection system does not remove the need for equivalent authoring operations, clear focus, browser checks, and real screen-reader verification. See the [ordinary-property acceptance requirements](spec/02-kit-contract.md#accessibility-from-ordinary-properties).

File handling also deserves a focused follow-up. [FileUpload](spec/03-components.md#inputs) records a chosen name and leaves transfer to the host, while the [schema export table](spec/10-interchange.md#json-schema-export) labels a file string as base64. Core currently emits that encoding too. An attachment field is an everyday respondent need; clarify the value/transfer contract and correct the schema mismatch without building an upload backend.

Several passages describe old implementation states as current: [conditions](spec/01-document-model.md#conditions) say conditional authoring needs JavaScript; [component events](spec/03-components.md#events) say nothing dispatches them; [interchange](spec/10-interchange.md#not-built) calls the implemented loader unwritten; and [the API](spec/12-api.md#four-core-functions-a-host-has-to-call) describes `contextValues` as reading repeated-row context rather than enumerating comparison values. These are documentation defects, not reasons to expand the product. Historical explanations should be reduced to the current contract in separate focused edits.

## Scope worth keeping

Structured conditions, useful validation, shared server validation, localization, repeaters, and steps all directly support ordinary forms. Immutable editing, document loading and migrations, safe handling of untrusted definitions, accessibility, and stable package boundaries protect those workflows. None should be cut merely because it requires technical implementation work.

Recommended order: complete the approved accessibility audit; simplify ordinary choice editing and advanced-surface exposure; resolve the attachment contract; then reduce speculative roadmap commitments and clean up the remaining contradictory prose. No additional removal or API change is authorized by this review document itself.
