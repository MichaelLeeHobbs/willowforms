# Contributing

The specification in `docs/spec` is the product contract. Read the relevant contract before changing
behaviour. Improve an ambiguous contract before implementing it; do not weaken it to fit existing code.

Keep changes focused on one outcome. Update implementation, tests, status text, and public examples
together. Tests should assert observable behaviour and fail when that behaviour is removed.

Before opening a pull request, run:

```bash
pnpm format:check
pnpm audit --audit-level high
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm e2e
pnpm e2e:dist
node scripts/check-dist.mjs
```

Public API changes require an explicit compatibility decision and, once document version 2 exists, a
migration. Security-sensitive reasoning belongs in `docs/THREAT_MODEL.md`; source comments should state
only the current invariant needed to maintain the code.
