# Roadmap

The specification in [docs/spec](spec/README.md) is the product contract, under any Accepted row in [docs/srs](srs/README.md). This file records execution
order and must not overstate a contract's status.

## Current milestone: release confidence

- Keep package export-map checks and the production browser smoke in CI.
- Complete the ordinary-property accessibility audit in both kits and fix concrete gaps; retain the Tree and panels as the keyboard authoring path.
- Built-in file inputs have been removed with compatibility coverage. Host-configured custom components own attachment workflows through the existing kit interface; see the [replacement path](COMPATIBILITY.md#pre-beta-corrections).
- Publish only after [RELEASING.md](RELEASING.md) passes from a clean commit.

## Recovery work completed

- Removed obsolete build-out logs, exact test-count maintenance, and incident-history comments.
- Enforced submitted value types and bounded regular-expression evaluation.
- Added the canonical `loadDocument(unknown)` version and normalization boundary.
- Completed repeater item controls, row addressing, validation rules, localized messages, and controlled
  conditional step navigation.
- Implemented events, built-in effects, host-sandboxed code actions, and both authoring surfaces.
- Documented the trust model, contribution path, compatibility policy, and release procedure.
- Added dependency updates, export-map verification, and a production-bundle browser smoke.

Changes advance only when implementation, regression coverage, specification status, and public
documentation agree.

## Scope decisions

The [product principles](spec/README.md#product-principles) govern additions. Richer expression tooling and direct canvas keyboard selection are removed from product scope. Generic HTML attribute passthrough is replaced by specific accessibility requirements expressed through ordinary properties; existing expressions and keyboard authoring remain supported.

Further approved boundaries keep import/export to versioned WillowForms JSON, retain the existing schema projection as an optional developer utility, and exclude schema import and archives. Catalogue additions need concrete form tasks; tooltips remain an uncommitted idea. Step state belongs to the host without prescribing a router, and third-party kit obligations are separate from reference-kit presentation choices.

Attachments belong to host-configured custom or community components, using ordinary package dependencies and the existing kit interface. There is no plugin marketplace, dynamic loader, or upload backend commitment.

The remaining [specification scope review](SPEC_SCOPE_REVIEW.md) proposals concern ordinary authoring and advanced surfaces. They are not additional implementation commitments until decided.
