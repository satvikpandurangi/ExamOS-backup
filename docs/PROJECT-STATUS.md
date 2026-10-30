# Project status and handoff

Last updated: 31 October 2026. Reviewed application source: `300a8eb0ca70a5fe177af754552c137923e673c2` on `main`. P0-01 is included in handoff `0178aea`. Current continuation is on a feature branch; no shared-main merge or live deployment has been performed.

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

- Full packaged-agent monitoring and current-build webcam acceptance. The continuation did exercise the native Python Windows screen agent and rebuild/launch the EXE as recorded below; those are distinct checks.
- Linux/macOS agent behavior; Linux is not implemented and macOS is optional.
- A second physical student device, school LAN, real network partitions, certificate rollout or classroom-scale capacity.
- Native PostgreSQL deployment/restore, installers/signatures and full upgrade acceptance. Nine isolated Node tests and response/examination browsers now also passed on native PostgreSQL 16.15; this does not validate native video storage/restore or production deployment.
- Browser process/crash recovery, upgrade from a populated pre-007 native database, and operating-system disk protections were not verified. Recovery deliberately covers same-tab reloads, not closed tabs or browser restarts.
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

## P0-02 continuation: native Windows lifecycle (partial acceptance)

Requirements: REQ-01, REQ-03, REQ-06, REQ-09, REQ-10. Based on handoff `0178aea`, with source committed alongside this entry. Windows 11 build 26200, Python 3.13.18, Node 26.13.0/npm 11.20.0; one physical computer, isolated loopback backend/database and device credentials. No live examination was interrupted. Camera access was not requested in these checks.

Changes: stale socket callbacks/heartbeat results cannot update a replacement agent connection; lease deadlines use request time instead of delayed receipt time; heartbeat acknowledgement reports actual server consent. Disconnect clears the old server connection's consent immediately, pending samples recheck the owning socket before forwarding, and delayed cleanup cannot clear a replacement connection. Teacher transport loss clears displayed previews. Network failures use a non-blocking visible status, allowing reconnect; native screen handles are released before slow network shutdown. Shutdown drains queued lifecycle database work before closing storage.

Observed acceptance:

- Native visible Python agent, actual Windows MSS frames and foreground executable queries, real teacher React dashboard and backend: no capture before consent; single stop/Escape/minimize/close, late real consent acknowledgement, rapid pending-consent cancellation, actual configured examination-window expiry, device revocation and rejected revoked credential, manual reconnect with no capture before fresh consent, and duplicate-connection replacement all passed. Seventeen real screen previews were delivered; no screen pixels were saved as artifacts.
- Five local stop calls returned in 0.876–1.372 ms. Under actual dropped/held loopback HTTP traffic, eligibility stop was observed after 4.721 s (100 ms sampling; six-second lease plus 0.75 s tolerance). First successful native MSS close was recorded at 4.667 s. An earlier run retained handles for 12.404 s while disconnect blocked; this was repaired and retested. Resource closure and observed eligibility timing are separate measurements.
- Additional actual Windows timing case: a real negative heartbeat reply was held while a new explicit grant completed; releasing that old reply did not cancel the newer grant. Pure renewal tests also reject renewal of an already-expired camera/screen lease. Camera hardware expiry itself remains untested in this batch.
- A deterministic protocol barrier held a sample during its real database write, replaced the connection and confirmed that no stale preview was forwarded. Unknown foreground metadata produced a technical event, not a rule alert. This metadata case was protocol-level, not a claim that a native protected process was successfully inspected.
- Trusted loopback HTTPS, authenticated polling and WSS passed; untrusted and expired certificates were rejected. Test certificates were generated under ignored temporary paths and no system trust was installed.
- Rebuilt `Student-Agent/ExamOS-Agent.exe`: on-disk PE32+ x64 validation and actual packaged enrollment UI passed. EXE SHA-256: `33f3d29dcd92877e2fc8514ba79f42a4e13733863cd075c4b48693e654131942`; tested native source `agent/agent.py` SHA-256: `57f9f21ffa2e605878012b064964ca0c1eb5227e0c17680b954442b6a9ef4da3`. The full lifecycle script ran the Python source, not this EXE.

Private evidence: `data/tmp/p0-02-stale-heartbeat.log`, native PostgreSQL and browser logs, and `data/agent-builds/...` are ignored and not uploaded. Exact machine paths and runtime identities are intentionally omitted here.

Open acceptance: the owner confirmed only one Windows computer is available. A second physical Windows device over the LAN/trusted HTTPS, real LAN partition, actual backend-process restart while the native agent is active, complete packaged lifecycle, and the upstream camera reconnection/detector acceptance remain open. P0-02 and the core requirements remain Partial; neither source screen success nor TLS loopback success closes these gaps.

## P0-03: reproducible regression foundation (implemented)

Requirements: REQ-01, REQ-06, REQ-09, REQ-10, REQ-11. Pure consent/cooldown modules now import without Windows/media dependencies; six pure Python tests now pass. Generated PDF bytes no longer overwrite the tracked fixture. All database fixtures can opt into a dedicated native `examos_test...` database with explicit disposable-test consent, and each fixture owns/cleans its own random schema.

Nine Node tests passed on both PGlite and a freshly initialized isolated PostgreSQL **16.15** Windows cluster, including migration 007, enrollment concurrency, response revisions/duplicate submissions, PDF attempts and proctor authorization. All fixture schemas were dropped after completed tests. P0-01 failure/recovery and existing exam browser workflows also passed against that native database. These tests use explicitly identified codec fixtures for media API checks, not actual webcam evidence. Remote CI passed all five jobs on `f09820a`: Node 22/24 on Windows and Ubuntu (build, nine PGlite-backed Node tests, five pure Python tests, clean tracked source), plus PostgreSQL 17 on Ubuntu with the Node suite and four browser workflows. Evidence: https://github.com/sujalkotkar2006-alt/ExamOS/actions/runs/41106830443 . These are CI/SQL/browser checks, not native sensor or Linux agent acceptance.

A fresh detached Windows checkout of `f09820a` passed locked `npm ci`, build and nine tests using separately downloaded/checksummed Node **24.22.2**. A fresh Python **3.13.18** virtual environment installed all locked Windows agent dependencies, passed `pip check` and launched the actual source enrollment UI without connecting/capture. The opt-in `tests/clean-bootstrap.mjs` also exercised the real generated account, authentication rejection, new local database and actual `server/index.js` process restart; the account/history survived and the old session ended. This did not run an active native screen agent during the process restart.

The CI workflow now retains clean bootstrap as a regression gate. Node 24 is the `.nvmrc` default; Node 22/24 are the declared CI matrix, while Node 26.13.0 was also tested locally. Python 3.13 is the Windows build target. No hardware tests run automatically in CI. Local PostgreSQL 16 fixture-schema count returned to zero after tests; no migration was applied to the operational database. Native media restore, actual Linux capture and deployment/load gates remain P1/P2 work.

## P1-01: focused primary screens and triage (software implemented; physical acceptance partial)

Requirements: REQ-02, REQ-04, REQ-09. Existing server authorization, device consent and session binding are reused. The screen grid now opens a selected device in a native modal dialog, preserving its identity while frames update. It shows primary-screen scope, examination/session/device, executable metadata and local receipt age. It clears image content on withdrawal, end, disconnect, expiry or invalid image decode; later valid frames recover. Search by student/device, all/sharing/offline/attention filters and name/attention ordering are provided. Attention describes technical/consent state, never a misconduct verdict. Camera snapshots are not used for this view.

Acceptance observed on 31 October 2026: the actual Windows source agent delivered seven real screen previews in the existing native workflow; React displayed that device in the focused view and removed the image on withdrawal. The native stop/session/minimize/close checks remained passing. Separate browser fixtures used two explicitly labeled protocol/codec devices, not two physical computers, to verify correct identity/session, new frames without selection loss, ten-second expiry, malformed-frame rejection/recovery, consent/end/disconnect clearing, filters/search, Escape/focus return, left/right navigation and 390px layout. The focused browser also passed using the isolated native PostgreSQL 16 fixture backend; dashboard route/counter regression passed. All five CI jobs also passed on feature commit `390b9a7`, including the new focused-screen browser and actual clean bootstrap/restart checks (run https://github.com/sujalkotkar2006-alt/ExamOS/actions/runs/41108683608). The subsequent lease guard adds an additional pure test and native delayed-heartbeat acceptance; its final-head CI is recorded in the PR checks. Desktop/mobile fixture screenshots were inspected and remain ignored. No actual student screen was written to a screenshot artifact.

Open: two physical devices simultaneously visible, LAN/classroom latency/capacity, comprehensive accessibility audit and future classroom-role integration. The P1-01 software can be reviewed, but multi-device physical acceptance and the product release gate remain open.

## Next action

Coordinate review/merge of this feature branch before shared-main changes. Next dependency-ordered software work is P1-03 classroom roles/account lifecycle, then P1-04 audit/reports, followed by policy/commands and Linux parity. Finish the open P0-02 physical/packaged/active-agent restart and P1-01 multi-device acceptance when access is available. Do not mark the Windows/Linux release gate accepted from these single-host/CI results.

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
