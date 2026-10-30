# Contributing to ExamOS

Start with [AGENTS.md](AGENTS.md), the [problem statement](docs/PROBLEM-STATEMENT.md), [requirements](docs/REQUIREMENTS.md), [current status](docs/PROJECT-STATUS.md), and the relevant [roadmap item](docs/ROADMAP.md). Existing setup is documented in [README.md](README.md); checks are consolidated in [docs/TESTING.md](docs/TESTING.md).

## Change workflow

1. Identify the user outcome and applicable `REQ-xx` IDs. Supporting PDF/camera work also cites `EXT-01`/`EXT-02` and the core requirements it serves.
2. Select an existing backlog item or document why the requested work belongs in scope. The roadmap is the default order; an explicit user request can change it.
3. Inspect the current implementation and define observable success/failure cases. For monitoring changes, include consent, end, revoke, disconnect and stale-message behavior.
4. Implement a coherent, reviewable change. Preserve existing teacher/device data, migration history, and working examination flows.
5. Validate the affected behavior with the appropriate checks. Use isolated data; distinguish synthetic protocol tests, real browser tests, native agent tests and physical-device tests.
6. Update requirement/status/roadmap claims when the change affects them, and project memory when a durable decision or next action changes. Documentation spelling/link fixes do not need unrelated status churn.
7. Review the diff for unintended files and private data. Report what passed, what remains untested, and whether the acceptance criteria are met.

## Required change summary

Use this structure in an implementation PR or handoff. For a small change, each field can be a sentence.

```text
Outcome: [concrete user-visible behavior or enabling capability]
Backlog: [for example P0-01]
Requirements: [for example REQ-06, REQ-09, EXT-01]
Acceptance: [observable success and important failure cases]
Changes: [what changed and why]
Validation: [commands/environment and actual results]
Limits: [untested cases, deployment constraints, follow-up]
Documentation: [requirement/status/roadmap updates, or why not needed]
```

## Review checklist

- [ ] The change serves the problem statement and cites stable requirement IDs.
- [ ] Implemented and proposed behavior are clearly separated.
- [ ] Server-side ownership/role checks cover every new HTTP/socket/media/report/control path.
- [ ] Monitoring remains visible, authorized and bounded by the current session and permissions.
- [ ] Capture cannot silently resume after consent withdrawal, lease expiry or reconnection.
- [ ] Technical failures and potential policy alerts remain distinguishable; human review is preserved.
- [ ] Database migrations preserve existing data and can be validated on the intended database engine.
- [ ] Important failure/retry/order/deadline behavior is tested where applicable.
- [ ] UI changes have rendered interaction checks; platform claims have native evidence.
- [ ] Relevant status and acceptance evidence are updated without overstating coverage.
- [ ] No credentials, private keys, database files, captured media or personal student records enter Git or logs.

Mark checklist items not applicable with a short reason; do not run hardware or broad suites for a documentation-only change.

## Data and deployment conventions

- Use the existing numbered SQL migration mechanism. Do not edit an already-applied migration to change a deployed schema; add the next numbered migration.
- Keep local PGlite and native PostgreSQL behavior compatible. A PGlite pass is not evidence of native PostgreSQL acceptance.
- Do not reset an existing database to make setup or a test pass. Use isolated fixtures and exercise upgrades with preserved data.
- Preserve the same-origin backend/dashboard and single-server coordination until a measured requirement justifies an architectural change.
- Do not restart a server running an active examination without authorization for the interruption. The existing guarded restart procedure is described in CURRENT-VERIFICATION.md and the root launch scripts.
- Keep documentation links relative within the repository, so they work on GitHub and in any checkout.

## Completion rule

A backlog item is complete only when its acceptance cases have observed evidence, its affected requirement claims are current, and its remaining limits are explicit. A running UI, green build, or isolated happy-path test is not enough to claim an entire classroom product is ready.
