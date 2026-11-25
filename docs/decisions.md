# Current architectural decisions

This file records decisions that constrain future work. Historical implementation discussion remains
available in Git history.

## Product contract

The files in `docs/spec` define intended behaviour, except where an Accepted row in `docs/srs` says otherwise: the row wins. Status labels describe implementation state. A
change that alters intended behaviour updates the specification explicitly; implementation convenience
alone is not a reason to weaken the contract.

## Package boundaries

- Core has no React or component-library dependency and runs in Node.
- Designer chrome has no component-library dependency.
- Kits implement rendering and metadata without changing core or designer.
- Designer CSS does not style kit-owned elements.

## Document ownership

The component tree is the source of truth. Core owns document loading, migrations, structural
validation, normalization, immutable tree operations, and server-capable validation.

Invalid imported documents remain recoverable, but ordinary runtime code receives a canonical document.
Recovery is an explicit designer state rather than a requirement that every subsystem operate over
arbitrary values.

## Identity and data

Component `key` identifies a node. `dataKey` identifies submitted data and may repeat. Errors remain
keyed by component identity, with row addresses for repeated scope. Host context is separate from
submitted data and is never trusted when supplied by a request.

## Author-controlled code

Core provides no evaluator. Hosts that enable computed expressions, custom rules, or code actions own
the sandbox, resource limits, and client/server parity. Actions return a closed list of effects; they do
not receive direct host capabilities.

## Compatibility

Document formats use ordered string versions and total migrations. Public package APIs receive an
explicit compatibility decision before release. Removed or renamed public behaviour requires a
deprecation or migration once consumers can depend on it.

## Delivery

Changes should have one coherent outcome. Implementation, tests, specification status, examples, and
security documentation move together. Exact test totals and other vanity metrics are not maintained.
