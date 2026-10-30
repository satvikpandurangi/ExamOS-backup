# Project status and handoff

Last updated: 31 October 2026. Reviewed application source: `300a8eb0ca70a5fe177af754552c137923e673c2` on `main`. P0-01 has subsequently been implemented in the working tree; no release or live deployment has been performed.

## Current product state

A working single-server prototype supports teacher sign-in, device enrollment/revocation, sessions, consented primary-screen previews and foreground executable names, allowlist alerts, private PDF examination delivery, timed attempts, responses, and optional camera evidence/review. It is not yet accepted as the complete Windows/Linux LAN product.

The gaps and completion criteria are tracked in [REQUIREMENTS.md](REQUIREMENTS.md); implementation order is in [ROADMAP.md](ROADMAP.md).

## Independently observed on the initial baseline

| Check                               | Result                   | Scope and limits                                                                                                                                                                                                                       |
| ----------------------------------- | ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Locked Node dependency installation | Passed                   | Local dependencies installed; application lockfile unchanged.                                                                                                                                                                          |
| `npm run build`                     | Passed                   | Vite production dashboard; warning for a roughly 758 KB minified main JS bundle, with a separate roughly 1.26 MB PDF worker.                                                                                                           |
| `npm test`                          | Passed: 6 tests          | Isolated PGlite-backed integration tests cover enrollment lifecycle/concurrency, PDF safety/ownership, exam lifecycle/deadlines, consent/evidence boundaries, and authenticated socket workflow. This was not a native PostgreSQL run. |
| `tests/browser.mjs`                 | Passed                   | Teacher login, enrollment-code creation, session start/end, responsive layout, logout; no page exceptions.                                                                                                                             |
| `tests/vision-dashboard.mjs`        | Passed                   | Seven routes, backend counters, evidence empty state, refresh and mobile overflow checks; no page exceptions.                                                                                                                          |
| `tests/exam-browser.mjs`            | Passed                   | Teacher PDF upload/render/assignment, student launch/PDF/countdown, response save/submit, receipt persistence and teacher response view; desktop/mobile checks; no page exceptions.                                                    |
| ONNX model checksum                 | Matched tracked metadata | `c5c2d13e59ae883e6af3b45daea64af4833a4951c92d116ec270d9ddbe998063`; checksum does not establish detector accuracy.                                                                                                                     |
| Application source after validation | Clean                    | Generated tracked PDF fixture was restored to its original checkout bytes after tests.                                                                                                                                                 |

Environment: Windows host, Node `26.7.0`, npm `11.19.0`. Browser tests used the existing system Chrome in headless mode through the repo's Playwright package. Test scripts were adapted in memory to select Chrome and write screenshots outside the checkout; the tracked scripts were unchanged. These observations do not validate every declared Node version or every browser. Tests checked page exceptions, not a comprehensive console/accessibility audit.

## Not verified here

- Native student-agent execution, packaged EXE, actual screen capture or webcam use. The documented Python 3.13 project environment was not provisioned; the host has Python 3.14 with incomplete agent/media dependencies.
- Linux/macOS agent behavior; Linux is not implemented and macOS is optional.
- A second physical student device, school LAN, real network partitions, certificate rollout or classroom-scale capacity.
- Native PostgreSQL integration across all workflows, backup/restore, installers/signatures, or upgrade acceptance.
- Browser process/crash recovery, native PostgreSQL acceptance of migration 007, and operating-system disk protections were not verified. Recovery deliberately covers same-tab reloads, not closed tabs or browser restarts.
- A comprehensive security audit, accessibility audit, or camera accuracy evaluation.

## Upstream publication evidence

[CURRENT-VERIFICATION.md](../CURRENT-VERIFICATION.md) records the original publication's native Windows/EXE/webcam observations. Those are retained as upstream reports, not relabeled as checks run in this workspace.

Its combined packaged acceptance run was incomplete: no supported automatic detector event was observed in the allotted interval. Later restart-persistence, review/deletion and independent receipt-hash assertions were therefore not reached in that run. Camera reconnection warrants investigation. Source/API or browser success does not close that acceptance gap.

Older [VALIDATION.md](../VALIDATION.md) and feature/fix documents are historical context. Some statements about missing retention UI or review history predate later evidence features; inspect current code and the specific review path before making a claim.

## P0-01 implementation

Requirements: REQ-06, REQ-09, EXT-01. Source: working tree based on `300a8eb`, with migration `007_answer_revisions.sql`.

- Autosave after one idle second or at most five seconds of continuous editing; one in-flight mutation, eight-second HTTP timeout, exponential retry capped at 30 seconds, and truthful pending/saving/retry/conflict states.
- Saves require the current answer revision and a UUID mutation ID. Replays of the last accepted save return its revision; stale writes are rejected. Concurrent/duplicate submits return the same canonical attempt receipt without replacing accepted answers or adding another submission audit.
- Unsent answers are kept in same-origin sessionStorage, keyed by authenticated device and attempt. The storage is not encrypted and shares the same-origin threat boundary as the existing student token. No localStorage or cross-tab shared draft store is introduced. Fresh launches clear old drafts; authentication loss, completion and deadline expiry remove them. Closing a tab ends recovery. Expired storage is purged on the next page refresh when the app is running.
- A revision conflict keeps unsent text visible for copying and stops writes. Choosing the server response explicitly confirms replacement. No post-deadline automatic save or staff late-answer override is introduced; the server's timed submission retains acknowledged answers only.

Validation: production build passed (existing large-bundle warning remains); all eight Node tests passed, including scheduler/in-flight editing/retry identity/conflict and real SQL replay/stale-write/concurrent-submit/deadline checks. Real Chrome browser failure acceptance passed for retry without typing, reload before acknowledgement, lost save acknowledgement, continuous typing, lost submit acknowledgement and completion cleanup. Competing-tab browser conflict and explicit server-response replacement also passed. The existing teacher/student PDF examination browser workflow also passed after implementation, including the teacher response view. Existing native hardware and physical-LAN limits above still apply.

## Event review and individual exam-control increment

User-authorized separate workstream on `feature/incident-review-controls`, based on published P0-01 commit `0178aea`. Maps to REQ-05/06/07/08/09/12 and partial P1-04/P1-05; does not complete the administrator-role or browser-policy roadmap items.

Implemented progress/flag triage, student/session incident filters, existing protected evidence and dismissal workflow, explicit per-attempt pause/resume/end with reasons, replay-safe receipts and atomic state/audit writes. Migration 008 preserves the existing status model and adds pause metadata plus the control ledger. The deadline continues during pause. Student APIs reject paused response/PDF requests, and the student page shows the hold, preserves tab-scoped text, resumes eligible saves, and distinguishes an invigilator-ended attempt. See [EVENT-REVIEW.md](EVENT-REVIEW.md) for the API, timer and monitoring contract.

Observed: production build and all ten Node tests passed with the existing bundle warning. SQL integration tests passed for ownership, replay/conflict, paused API enforcement, unchanged deadlines, student isolation, atomic rollback on audit failure, individual end and timeout. Real system-Chrome workflow passed for progress/filter, protected codec-fixture snapshot rendering, ignore/dismiss, pause across reload, resume and end. The media is explicitly a codec fixture; this is not native webcam, OS-lockdown or actual detector validation. Desktop/mobile overflow checks passed for the teacher controls and paused student page. The P0-01 browser failure suite and existing teacher/student PDF examination browser workflow also passed after this change. Native PostgreSQL and physical-device acceptance remain unverified. No live service was restarted, and this branch has not been pushed by this implementation task.

## Phone/app/window pipeline increment - 31 October 2026

Scope: REQ-05/06/08/09/12 and EXT-02 on the same isolated feature branch. Started assigned-examination application violations now join the proctor incident workflow, with the observed executable. Browser exit events have a ten-second per-category/attempt cooldown. Incident details can request a separately consented camera check linked through migration 009; source observations are preserved and media are not duplicated. These are later camera snapshots, not stored screen previews.

Observed: production build, all ten Node regression tests and the end-to-end browser/SQL/Socket.IO pipeline passed using explicit JPEG codec and DOM-event fixtures: consent rejection, allowed/prohibited apps, window-blur/fullscreen events, protected phone evidence, linked camera snapshot, ignore/dismiss and manual pause/end. This is not real webcam/model inference or physical foreground-window validation. The host still lacks av, win32crypt, requests and socketio Python modules for the full native agent; physical phone-detection acceptance remains pending. See EVENT-REVIEW.md for the repeatable hardware checklist. No live service was restarted and no changes were pushed.

## Next action

P0-02: monitoring lifecycle and native Windows acceptance. Core requirements remain Partial until their complete platform/deployment acceptance is observed; P0-01 does not establish classroom release readiness.

The project owner has assigned continuation from P0-02 onward to their friend and requested publication of the implementation and project documentation. The owner will work on a separate area.

## Future progress entry format

For each meaningful milestone append or replace the relevant current-state section with:

```text
Date / source commit / build hash:
Backlog item:
Requirement IDs:
Changed behavior:
Environment and checks:
Observed results:
Untested cases / remaining limits:
Next action:
```

Keep historical reports attributable to their builds. Never convert a planned check into a passed result.
