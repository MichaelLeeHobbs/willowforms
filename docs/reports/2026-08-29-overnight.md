# Overnight, 2026-08-28 into 2026-08-29

Written as the work happened. Horizon: 9am Eastern, Saturday 2026-08-29.

## What shipped

### Merged before the handover

- **#19 Style tab.** Per-component CSS, structured controls and a raw field over one string.

### Open on a branch

- **#20 `feat/context`** — host context conditions can read, plus everything below. Rebased onto main
  after #19 landed. CI was green on every gate locally.

## The work

### The merge exposed a bug neither branch could see

`submittedData` came from #19 with a positional `evaluate`; core moved to an options bag in #20. Merged,
it could not read the host's context. That is not a signature mismatch: `submittedData` decides which
answers leave the payload, using `isVisible`, so a different context than the renderer had strips answers
to questions the user really was asked. It is the disagreement `isVisible` exists to prevent, arriving
through an argument list. Fixed, with a test that goes red when the options are not threaded through.

### An effect cannot tell the server what to believe

Copilot caught a sentence in the actions sketch saying a rule evaluates on the server "where the context
is whatever the request supplied", contradicting the security model two files over. Reworded as a limit
rather than a reassurance. Logged.

### The canvas defect is fixed

A component with `renderWhen` set was absent from the canvas DOM: invisible, unselectable there, and
undroppable, because `measureTree` skips what did not render. The tree was the only way to reach it. This
affected every condition in every document and had shipped that way.

`FormRenderer` now takes `revealHidden`. The canvas passes it while editing and never in preview, the
same way the two already disagree about events. Validation is untouched.

Four of the new checks run in a browser, because dropping into a container is resolved from measured
rectangles. Breaking the fix turns three of them red, the drop test among them.

### Two `.gitignore` holes, both found by running things

`.vscode/` was unignored, so a `git add -A` during a conflict resolution swept an editor temp file into a
commit. `apps/demo-server/forms.json` was unignored, so running the demo server dirties the tree and
fails `format:check`.

## Verification

825 unit tests, 62 e2e, lint / format / typecheck / build clean. The context feature was also exercised
end to end through the real demo server in Node: a guest's empty submit accepted, an admin's rejected, a
document reading a path the server does not supply answered with a 500 naming that path, and a payload
claiming `user.role: admin` ignored because the server reads its own context.

## Decision log

See `docs/decisions.md`. Entries added since the handover:

1. Edit mode draws what a condition hides; preview does not.
2. The context an effect writes is the browser's, never the server's.

## Still running

- Steelman on **steps vs repeated scope**. Both briefs are in; the ground-truth agent is still working.
  Decision and reversal cost will be logged in `docs/decisions.md` and noted here.

## Hit the stop-list

Nothing yet.
