# Roadmap

The specification in [docs/spec](spec/README.md) is the product contract. This file records execution
order and must not overstate a contract's status.

## Current milestone: release confidence

- Keep package export-map checks and the production browser smoke in CI.
- Resolve the remaining named `Partial` sections in the specification or explicitly defer them from the
  first release.
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
