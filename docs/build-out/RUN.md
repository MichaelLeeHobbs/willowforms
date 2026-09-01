# The run contract

Addressed to the agent doing the build-out, not to a reader of the repository.

You are working through `docs/build-out/queue.md`, in order. The queue is frozen. Read this file first,
at the start of every session that resumes the run.

This is the **third** remediation run.

- The first closed 402 of 428 findings. Digest: `docs/reports/2026-08-30-review-remediation.md`.
- The second closed the 2026-08-30 second pass. Digest: `docs/reports/2026-08-31-second-pass-remediation.md`.
  Its most useful page is the reconciliation section at the end of `docs/reviews/2026-08-30-second-pass.md`,
  which is about how the first run failed rather than about the code. Read it.
- This one works `docs/reviews/2026-08-31-deep-review.md`, committed by item 0. 416 findings, 179 files.

## What is different this time, and why

The second run bundled its 33 items into 7 pull requests. Copilot posted zero comments on two of them and
one comment on a 96-file, 2958-line one. It did not review them; it looked at them and gave up, and they
merged anyway with a bot's name attached. That is worse than no review, because it reads as reviewed.

So the shape of this run is: **one pull request per queue item, at most 12 changed files and 500 changed
lines, merged into `main` only after a Copilot review has been read and every finding answered.**

There is no long-lived run branch. Each item cuts from an updated `origin/main` and merges back. One open
pull request at a time.

`git diff --stat main...HEAD` before every `gh pr create`. Over budget means the item ships as two or
three pull requests. That is not editing the queue — splitting how an item is delivered is allowed and
expected; adding an item, dropping one, or merging two into one PR is not.

## Answering Copilot

Per the working agreement, and it is load-bearing here:

1. Wait for the review. CI green is necessary and not sufficient.
2. Read every finding. Fix it or refute it in a reply on its own thread. Never merge past an unanswered one.
3. After pushing fixes, **re-request the reviewer**:
   `gh api -X POST repos/:owner/:repo/pulls/N/requested_reviewers -f "reviewers[]=copilot-pull-request-reviewer[bot]"`.
   Commenting `@copilot, please review updates` only re-checks findings already open — it will say
   "all resolved" while ignoring everything pushed since. Only the re-request looks at new code.
4. A re-review sometimes re-raises a finding you already fixed, against the commit that fixed it, at the
   line the fix now occupies. Read the code at that line before touching it, and reply with what is there
   rather than fixing it twice.
5. Copilot is often wrong about this codebase's deliberate choices. Refuting a finding is a normal outcome
   and the reply is the deliverable. Record anything it caught that the deep review missed in
   `docs/build-out/found.md`, and anything it caught that a _guard_ should have caught as a test.

## Authority

Michael has delegated design authority and has not read this code. A question about implementation is one
he cannot answer better than you. Decide, log it in `docs/decisions.md`, continue.

Three calls are already made. Do not reopen them:

- The review is committed to `docs/reviews/` unmodified, so its line citations stay resolvable.
- One pull request per item, merged into `main`, inside the size budget.
- The queue's order. Item 1 is the lint gate first because every later PR's CI is honest only after it.

Four calls the review leaves open are yours, and each is named in the queue. Log the cost, not just the
choice.

- **Item 3** — whether `KeyField` is repaired with a `key` on the panel, a re-sync guard, or both. The
  review argues the key is the one that also protects the ninth editor nobody has written yet.
- **Item 7** — whether the ReDoS guard learns to detect alternation, or the limit is documented honestly
  with advice for a deployer. Form authors and deployers are different people here.
- **Item 18** — what renaming a key means. `docs/build-out/found.md` sets out four defensible answers and
  says choosing between them changes what a key _is_. That entry is now in scope; delete it when you pick.
- **Item 22** — the `documentIndex` finding the review left BLOCKED. Work the `withHidden()` fixture's
  indices through `removeNode` then `insertNode` by hand and settle whether `dnd.test.ts:302` pins a wrong
  value, before changing either. Do not write CONFIRMED for something you reasoned about and did not
  compute; that is the discipline the review's own lead applied here.

## Stop only for these five

1. It spends money or publishes anything. npm, making the repo public, a paid API.
2. It touches state outside this repo. Global config, another repo, a deployed service.
3. The spec contradicts itself and both readings are real product choices.
4. You are blocked on access you do not have.
5. You would destroy Michael's work rather than your own: his commits, his branch, a file he wrote.

Everything else is yours, including choices that feel large. Breaking changes are free in an unpublished
library. The rule elsewhere about a second look at anything hard to undo is calibrated for production
repos and does not apply here.

## No background work

Not a watcher, not a subagent that outlives the turn, not a background shell. Background work makes the
goal skip its evaluation for that turn, and idle check-ins are capped, so a run parked on CI dies quietly.

Check gates inline at the top of a turn. If the open PR's CI or Copilot review is not ready, do not spin:
spend the turn reading the next item's findings against the current source and writing its plan into the
turn's output, then check again at the top of the next turn. A turn that advances the record is not an
idle turn.

Subagents that finish inside the turn are fine. For a real either/or, call the Skill tool with
`steelman`; for an open-ended shape question, `codebase-design` and its `DESIGN-IT-TWICE.md`.

## Writing the tests

Read `.claude/skills/write-tests/SKILL.md` before writing one. It is the list of ways a test here has
passed while proving nothing, each taken from a real incident in this repository — and roughly a third of
this review's findings are new entries in that same list.

The review hands you most tests' specifications for free. Wherever a finding says "delete this guard and
the suite stays green", that sentence _is_ the test: delete the guard, watch the new test go red, restore
the guard, watch it go green. Do that literally rather than trusting the reasoning. Several findings in
this review are the second or third time the same guard has been asserted into existence without ever
being executed.

Two traps specific to this run:

- **A test that cannot run must fail, not pass.** No probe-and-skip, no early return because a dependency
  is missing. Item 45 exists because a guard reports success having compared zero pairs.
- **jsdom has no layout engine.** Geometry, selection frames and focus order go to `e2e/`. A jsdom test
  that appears to check any of those is checking something else.

## Going idle before the queue is empty is a failure, even a tidy one

Finishing an item is a reason to start the next one. Never a reason to stop.

Keep the record current as you go: the queue's checkmarks and **Run status**, `docs/decisions.md`,
`docs/build-out/found.md`, and `docs/build-out/triage.md` for anything you decide not to fix.

## Where the resume pointer lives

`CLAUDE.md` carries a stable one-line pointer at `docs/build-out/queue.md`; the queue's **Run status**
block carries the mutable half. The last run's contract claimed the opposite and was wrong about its own
mechanism, which is finding `RUN.md:161-164` in this review. Item 53 removes the `CLAUDE.md` pointer when
the run closes.
