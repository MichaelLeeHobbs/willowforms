# Vendored from the maintainer's personal skills

Copied verbatim, not forked, from `~/.claude/skills/steelman`. It lives here because
`docs/build-out/RUN.md` tells the build-out to use it, and a run contract that points at a skill
only one machine has is a contract nobody else can follow.

- Origin: `~/.claude/skills/steelman` on the maintainer's machine. That copy **is** the upstream;
  there is simply no public one to fetch it from.
- Vendored: 2026-08-30
- Author: Michael Hobbs, who also holds the copyright on this repository
- License: MIT, under this repository's [LICENSE](../../../LICENSE). Same author, so there is no
  third-party licence to carry alongside it, unlike `codebase-design`.

## Keeping it in step

The personal copy is the one that moves, and this one goes stale silently when it does, because
nothing fetches. If you change the method, change it there first and copy it here again. Editing
this copy alone leaves the original behind, and the next project to vendor the skill gets the older
method with no sign that it is older.
