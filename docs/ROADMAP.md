# Roadmap

The specification in [docs/spec](spec/README.md) is the product contract. This file records execution
order and must not overstate a contract's status.

## Current milestone: release confidence

- Keep package export-map checks and the production browser smoke in CI.
- Complete the ordinary-property accessibility audit in both kits and fix concrete gaps; retain the Tree and panels as the keyboard authoring path.
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
