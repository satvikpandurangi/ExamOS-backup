# ExamOS project instructions

## Read before working

1. Read [docs/PROBLEM-STATEMENT.md](docs/PROBLEM-STATEMENT.md). It is the user-supplied product scope.
2. Read [docs/PROJECT-MEMORY.md](docs/PROJECT-MEMORY.md) for persistent project context and decisions.
3. Read [docs/PROJECT-STATUS.md](docs/PROJECT-STATUS.md), [docs/REQUIREMENTS.md](docs/REQUIREMENTS.md), and the relevant item in [docs/ROADMAP.md](docs/ROADMAP.md).
4. For implementation, consult [ARCHITECTURE.md](ARCHITECTURE.md), [CONTRIBUTING.md](CONTRIBUTING.md), and [docs/TESTING.md](docs/TESTING.md).

## Product contract

Build a polished classroom monitoring and examination integrity product for institution-managed computers. The core is authorized teachers/invigilators, lightweight Windows and Linux agents, a grid and focused screen view, encrypted real-time communication, configurable policy alerts, classroom controls, auditability, and efficient LAN operation. macOS and centralized/cloud administration are optional extensions.

Every feature, fix, refactor, and progress claim must identify the applicable `REQ-xx` IDs in REQUIREMENTS.md. Infrastructure work may map to the requirements it enables. Existing PDF exams and camera evidence are supporting extensions; they must not displace missing core requirements. Do not silently widen monitoring scope or rewrite the problem statement.

## Before and after a change

- State the user outcome, requirement IDs, and observable acceptance criteria before implementation.
- Check existing code and verification evidence; distinguish implemented, verified, partial, and planned behavior.
- Make the smallest coherent change that satisfies the outcome and preserves existing workflows.
- Run checks appropriate to the changed behavior. Documentation-only edits need link/content/diff checks, not the full application suite.
- Record what changed, which checks ran, their results, and remaining limits. Update requirements/status/roadmap when their claims change; update project memory when decisions or the next action change.
- Do not mark a requirement complete from a build, a mocked test, or an old report alone. Physical-device, native-platform, native PostgreSQL, and load claims require evidence from those environments.
- Use the change checklist in CONTRIBUTING.md for implementation summaries and reviews. If work has no requirement or supporting outcome, explain its relevance before treating it as roadmap progress.

## Monitoring and integrity boundaries

- Preserve explicit, visible, session-bound monitoring and separate camera/snapshot/clip permissions. Enrollment or reconnection does not grant consent.
- Preserve immediate local stop eligibility on withdrawal and bounded stop on disconnection/lease expiry; fresh consent is required before resuming capture.
- Keep alerts as potential policy observations for human review. Connection failures, detector uncertainty, or application changes must not automatically determine misconduct or impose penalties.
- Do not introduce hidden capture, input-text/key logging, clipboard collection, audio, private-message access, or credential collection. Screen previews can themselves contain sensitive content; preserve the notice and minimization controls.
- Enforce ownership and role permissions on the server for HTTP, sockets, media, controls, and reports. Do not rely on hidden UI controls for authorization.
- Require trusted HTTPS/WSS outside loopback. Keep credentials, databases, evidence, and private test artifacts out of Git and logs.
- Do not interrupt an active examination for a restart or deployment unless the user has authorized that interruption. Use isolated test data for validation.

## Current implementation facts

The current app is React/Vite + Express/Socket.IO + PostgreSQL/PGlite, with a Python/Tk Windows agent. Device/consent coordination is held in one server process. Linux, full role management, focused live-screen viewing, and broad classroom controls remain roadmap work. Preserve this working architecture unless a requirement and measured limitation justify a change.

## Documentation precedence

PROBLEM-STATEMENT.md defines scope; REQUIREMENTS.md defines acceptance and traceability; PROJECT-MEMORY.md records decisions; PROJECT-STATUS.md records the current evidence and next action; ROADMAP.md describes planned work. CURRENT-VERIFICATION.md preserves the upstream publication's hardware verification claims and incomplete checks. Historical feature/fix documents are context, not proof that a newer build passed.

These files provide repository-local persistent memory. Do not claim that they create account-wide or cross-repository memory.
