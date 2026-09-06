# Security policy

FormSmith is pre-release software. Do not report suspected vulnerabilities in a public issue.

Report them through GitHub's private vulnerability reporting for this repository. Include the affected
package and commit, the trust boundary involved, reproduction steps, and expected impact. Maintainers
will acknowledge a report within five business days and coordinate disclosure after a fix is available.

The supported security baseline is the latest commit on `main`. No npm release is supported yet.

Form documents are data, but they may contain computed expressions and code actions. FormSmith does not
execute those expressions by default. A host that supplies an evaluator owns its isolation, resource
limits, and server-side parity. See [the threat model](docs/THREAT_MODEL.md).
