# Compatibility policy

Formsmith is pre-release software. Until the first published `1.0.0`, public contracts may change, but
changes must be deliberate and documented rather than arriving as incidental refactors.

## Supported platforms

- Node.js 20 and 22 for `@formsmith/core` and server-side validation.
- React 18 and 19 for the renderer, designer, and kits.
- The current and previous major Material UI releases supported by `@formsmith/kit-mui` peer metadata.
- Current evergreen Chromium, Firefox, and Safari for runtime use. Automated browser coverage currently
  gates Chromium; the other engines are compatibility targets, not yet CI gates.

## Change rules

- The document `version` changes only when an existing document needs migration.
- `loadDocument` owns migrations and remains the supported boundary for stored or network input.
- Additive optional fields and new exports are compatible within a pre-release line.
- Removing or renaming a public export, prop, document field, component type, rule, event, or effect must
  include a migration path and a release note.
- A deprecated API remains for at least one minor release after the replacement ships. Runtime warnings
  must be actionable and must not expose form values.
- Kit contract changes land with cross-kit tests in the same change.

The package manifests are the source of truth for engine and peer ranges. The specification describes
behaviour; when either changes, this policy and the relevant contract change together.

## Pre-beta corrections

The shipped kits now use their declared `defaultProps` for omitted properties as well as newly created components. Reset therefore agrees with the inspector. Saved forms that omit properties may gain the declared starter text, labels, or presentation defaults; explicitly authored values are preserved. Both kits default headings to H2, and breadcrumbs receive the default region name `Breadcrumb`. Existing headings with an explicit H5 remain H5. This correction changes runtime fallbacks without rewriting documents or advancing the document version.

The built-in `FileUpload` metadata and renderers were removed before the first npm release, following the approved attachment boundary. This is a documented pre-publication removal; there is no published version to deprecate. The document version remains `1`, and `loadDocument` preserves legacy nodes and the `file` string type.

Hosts that used the old picker should register a custom renderer under `FileUpload` and supply compatible metadata when those nodes remain editable, or explicitly migrate the node to their own attachment component while retaining its `dataKey`. Until a renderer is supplied, the existing missing-component alert identifies the node and shows its validation error. A previous filename is not stored file content: if the host did not persist the bytes separately, the respondent must choose the file again. Do not silently convert a filename into an attachment ID. Custom components report JSON-compatible durable references after the host's upload succeeds.

Legacy `file` fields continue to load and validate as strings. JSON Schema export no longer adds `contentEncoding: base64`: neither the previous filename picker nor core validation established that encoding. Hosts that actually encode bytes must supply their own explicit schema annotation; stored documents and answers are unchanged.
