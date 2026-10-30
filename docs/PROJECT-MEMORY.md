# Persistent project memory

Last updated: 30 October 2026.

## User intent

ExamOS began as a friend's entry in a 24-hour open hackathon where outside help is allowed. The project owner is taking over development and wants a polished, dependable product beyond the hackathon. The user explicitly requires every progress claim, code change and feature to stay aligned with the supplied problem statement.

The canonical statement is [PROBLEM-STATEMENT.md](PROBLEM-STATEMENT.md). Stable acceptance IDs are in [REQUIREMENTS.md](REQUIREMENTS.md). Future coding sessions are directed here by the root [AGENTS.md](../AGENTS.md). This is persistent repository memory; no account-wide memory service was used.

## Stable facts

- Repository: `https://github.com/sujalkotkar2006-alt/ExamOS.git`.
- Initial reviewed application commit: `300a8eb0ca70a5fe177af754552c137923e673c2`, branch `main`.
- Local checkout for this handoff: `G:\ExamOs`. Documentation and scripts should remain usable from other checkout paths.
- Current architecture: React/Vite teacher dashboard and student page; Express/Socket.IO backend; PostgreSQL or local persistent PGlite; Python/Tk Windows agent.
- The student agent currently depends directly on Windows APIs and DPAPI. Linux support is required and missing. macOS and cloud administration are optional.
- Core monitoring is visible and session-bound. Screen, camera, snapshot and silent-clip permissions are separate; reconnection must not silently resume capture.
- Local device/consent state and teacher serialization live in one server process. Do not assume multiple replicas are supported.
- Source checkouts omit the prebuilt Windows EXE. The included ONNX model is an optional-camera dependency; its upstream license/hash metadata is tracked.
- Existing feature documents include historical claims. Current checkout observations and upstream hardware claims must remain distinguishable.

## Working decisions

These are initial working decisions for the roadmap, not additional user-supplied requirements:

- Evolve the existing working architecture; justify rewrites or new infrastructure through a requirement and evidence.
- Prioritize response reliability, monitoring lifecycle, focused screen viewing, classroom roles, configurable policies, auditing/reports, controls and Linux parity.
- Preserve PDF examination and optional camera/evidence workflows. Additional camera scope comes after missing core capabilities.
- Executable allowlisting cannot establish website or AI-service access within a browser. A future managed-browser integration must declare coverage and collect the minimum authorized metadata.
- Alerts are observations for human review. No automated misconduct verdicts or penalties; technical failures are not policy violations by themselves.
- Do not add hidden monitoring, audio, keylogging, clipboard/private-message access or credential collection. Existing screen capture requires clear notice because screens can expose sensitive content.
- Use a controlled Windows pilot as an intermediate milestone; the initial product still requires Windows and Linux.

## Current handoff

P0-01 is implemented for REQ-06/REQ-09 and EXT-01: one-second idle / five-second maximum autosave, bounded backoff, request IDs, server response revisions, same-tab draft recovery, conflict stop/review and canonical duplicate submission receipts. Recovery uses sessionStorage keyed by device/attempt, expires at the deadline, and is cleared on completion, authentication loss or fresh launch. It does not survive closing the tab, is not encrypted at rest, and is not a late-submission channel. No staff override was added.

Next implementation task: **P0-02 - monitoring lifecycle and native Windows acceptance**. P0-03 retains clean-environment/CI and native PostgreSQL validation work.

Handoff assignment: the project owner asked to publish all work so their friend can continue P0-02 onward while the owner works on a separate area. Keep the requirement IDs and acceptance evidence current, and coordinate changes through the shared repository.

Verification detail and limits live in [PROJECT-STATUS.md](PROJECT-STATUS.md); do not duplicate or promote incomplete checks here.

## Update rules

- Keep durable intent, agreed decisions, important constraints and the next action here.
- Update after a meaningful implementation milestone or user decision; use status/roadmap for detailed results and backlog.
- Separate observed facts, proposed choices and unresolved questions. The user can revise working decisions without changing the original statement.
- Do not store credentials, tokens, student information, captured media, private keys or transient machine diagnostics here.
