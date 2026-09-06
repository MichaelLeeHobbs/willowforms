# Specification scope review

Review date: 2026-09-05. Reviewed all thirteen contracts in [the specification](spec/README.md), together with the README, roadmap, ideas, beta review, and accessibility record, against the approved mission and product principles. This is a product-scope review; it does not establish new runtime or accessibility verification.

## Decisions already applied

The README and specification now lead with the mission. The product definition explicitly includes respondents and the complete author-to-respondent workflow. The host owns storage, permissions, distribution, and business workflows.

Richer expression tooling and direct canvas keyboard selection are removed from product scope. Generic HTML attribute passthrough is replaced by accessibility requirements expressed through ordinary properties, with a complete cross-kit audit still outstanding. Existing expressions, code actions, components, and the Tree keyboard workflow remain supported.

Items 3–6 below have since been approved and reflected in the specification: simple versioned JSON interchange, task-driven catalogue growth, host-controlled navigation without routing, and a distinction between universal kit obligations and reference-kit preferences. Attachments now belong to host-configured custom or community components; the subsequent implementation removed built-in file inputs with [compatibility notes](COMPATIBILITY.md#pre-beta-corrections). Items 1–2 remain product discussions.

## 1. Ordinary authoring exposes too much programming

**Highest priority.** [Binding modes](spec/07-bindings.md#which-modes-a-property-offers) offer expressions unless a kit opts out. [Action authoring](spec/09-actions.md#authoring) exposes JSON parameters and document-level source code. Meanwhile, [selection options](spec/03-components.md#selection), an everyday task such as adding Yes/No choices, are authored as JSON. Dropping an expression language service leaves this underlying product mismatch intact.

**Recommendation:** specify a default authoring experience centered on questions, choices, labels, structured conditions, and validation. Give option lists ordinary add/edit/remove/reorder controls. Let embedding developers explicitly enable advanced source and JSON editing where needed, while retaining the existing document model and runtime extensions. Existing documents containing advanced features must remain inspectable and preserve those values; disabling an editor must not discard content.

**Decision needed:** approve a small host configuration for advanced authoring surfaces and a structured choices editor. Keep permissions enforcement with the host; this does not justify a library-level roles or policy engine. This changes UI behavior and needs an implementation design rather than a documentation-only claim.

## 2. Styling risks becoming a general design tool

[The Style contract](spec/06-inspector.md#two-ways-to-write-the-same-text) makes raw CSS the answer to anything its structured controls omit. Authors can adjust per-component declarations at multiple breakpoints as well as kit-specific style properties. That is useful to specialists, but it places typography, spacing, and responsive design decisions on people whose task is to ask questions. Arbitrary authored colors and dimensions can also defeat accessible defaults.

**Recommendation:** retain existing styling support for compatibility, make kit defaults and a small set of layout controls the ordinary path, and put raw CSS behind the same explicit advanced-authoring choice. Expand style controls only for observed form tasks. Host themes remain the primary way to supply a professional, consistent appearance; the library should not grow a general CSS editor or promise accessibility for every author-supplied style.

## 3. Interchange has speculative next steps

[Interchange](spec/10-interchange.md#format-scope) previously described JSON Schema import as an obvious inverse and proposed an archive containing a document, translations, and schema. Schema import serves developers starting from an API contract more directly than users creating questions. Translations already live inside the document, and the schema is derived from it, so the proposed bundle had no demonstrated transport gap.

**Decision applied:** support simple import/export of a versioned FormSmith JSON document. Schema import and archives are outside scope. Keep the existing lossy schema projection as an optional developer utility and document-version migrations as a reliability obligation when a new version is introduced. Shared-subform composition remains uncommitted in [the document model](spec/01-document-model.md#one-form-per-document).

## 4. Catalogue growth can drift into page building

The [catalogue](spec/03-components.md#the-catalogue) already includes Breadcrumbs, Progress, several visual containers, and presentation variants. Those can serve real forms, but their existence is not a reason to mirror a general component library. [A shared tooltip trait](spec/03-components.md#what-is-deliberately-absent) was described as planned without an author or respondent need that visible Help text cannot meet.

**Decision applied:** retain the implemented catalogue and require a concrete form task for additions. Application navigation and surrounding page layout stay with the host. The tooltip trait is now an uncommitted idea requiring a specific accessible use case. Built components are not removed or merged without usage evidence and a compatibility plan.

## 5. Step navigation over-prescribes the host experience

[Where the current step lives](spec/03-components.md#where-the-current-step-lives) previously said the URL owned it, while the actual API leaves navigation controlled by the host. A form inside a modal or embedded panel can reasonably use local state. [Branching](spec/03-components.md#branching-needs-no-new-vocabulary) also prohibited totals universally, although a fixed linear form can accurately display Step 2 of 5.

**Decision applied:** require host-controlled context and correct validation across reachable steps. URL state is an integration option. Progress must be truthful; the built-in display remains position-only, and a host may display a known total. There is no routing system or branching workflow engine commitment.

## 6. Kit requirements mix integration obligations with reference-kit preferences

[The kit rules](spec/02-kit-contract.md#rules-every-kit-must-satisfy) previously presented reference-kit icon and catalogue checks as universal requirements, while [the icon contract](spec/11-theming.md#icons) allowed third-party icons to be omitted. A custom kit may legitimately have private renderers or omit icons. A suite combining reference-kit preferences with semantic and accessibility obligations needs an explicit scope.

**Decision applied:** distinguish universal obligations, such as working controls, node identity, and accessibility, from this repository's reference-kit catalogue and presentation checks. Icons are optional for third-party kits, and internal renderers need not be palette entries. Existing checks for the shipped kits remain; no plugin framework, registry, or arbitrary icon-source authoring is introduced.

## Reliability and accuracy that should take precedence

The accessibility audit is the approved next verification priority. Dropping a second keyboard selection system does not remove the need for equivalent authoring operations, clear focus, browser checks, and real screen-reader verification. See the [ordinary-property acceptance requirements](spec/02-kit-contract.md#accessibility-from-ordinary-properties).

**Attachment decision implemented:** the standard kits no longer include file inputs. Legacy definitions remain loadable, and schema export no longer infers base64 encoding. The [replacement path](COMPATIBILITY.md#pre-beta-corrections) preserves documents and requires a host component; a filename is never converted into a durable attachment reference by relabeling it. FormSmith owns no upload, storage, or viewing service.

Several passages describe old implementation states as current: [conditions](spec/01-document-model.md#conditions) say conditional authoring needs JavaScript; [component events](spec/03-components.md#events) say nothing dispatches them; and [the API](spec/12-api.md#four-core-functions-a-host-has-to-call) describes `contextValues` as reading repeated-row context rather than enumerating comparison values. These are documentation defects, not reasons to expand the product. The interchange edit now correctly identifies the implemented loader. Historical explanations should be reduced to the current contract in separate focused edits.

## Scope worth keeping

Structured conditions, useful validation, shared server validation, localization, repeaters, and steps all directly support ordinary forms. Immutable editing, document loading and migrations, safe handling of untrusted definitions, accessibility, and stable package boundaries protect those workflows. None should be cut merely because it requires technical implementation work.

Recommended remaining work: complete the approved accessibility audit, decide how to simplify ordinary choice editing and advanced-surface exposure, and clean up contradictory prose. No additional removal or API change is authorized by this review document itself.
