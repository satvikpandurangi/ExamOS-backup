# Testing and acceptance evidence

Use checks that match the changed behavior. [REQUIREMENTS.md](REQUIREMENTS.md) defines acceptance; [ROADMAP.md](ROADMAP.md) defines missing checks; [PROJECT-STATUS.md](PROJECT-STATUS.md) records what was actually observed.

## Environment

- The existing README calls for Node.js 22+ and npm. The initial handoff was tested with Node 26.7.0/npm 11.19.0; the supported-version matrix still needs CI coverage under P0-03.
- The Windows agent/build instructions target Python 3.13 with Tk and the locked agent dependencies. Python 3.14 on a host is not equivalent evidence for that environment.
- Browser tests require a compatible Playwright Chromium installation. The initial review used system Chrome through an in-memory launch adaptation; the committed tests still launch Playwright's default Chromium.
- Optional server-side clip validation requires Python with `server/requirements-media.txt` installed. `EXAMOS_MEDIA_PYTHON` selects that interpreter when the project `.venv` is not used.
- Linux agent acceptance is future work, not a currently supported test command.

## Default checks

Run from the repository root:

```powershell
npm ci
npm run build
npm test
```

The current Node suite contains ten tests across response synchronization, enrollment, examinations, proctoring and authenticated workflow files. PGlite fixtures are isolated. Leave `TEST_DATABASE_URL` unset for the default embedded-database run. If set, it must identify a dedicated disposable test database: currently the workflow test uses it, while other fixtures still use PGlite. Setting this variable does not establish native PostgreSQL coverage of the whole suite.

The test fixture generator currently rewrites `tests/fixtures/mathematics-question-paper.pdf`. Use a disposable test checkout or preserve its pre-run bytes and restore only test-generated changes afterward. Do not overwrite a pre-existing user edit. P0-03 moves generated fixtures outside tracked source.

## Browser workflows

After building the dashboard and provisioning the matching Playwright browser:

```powershell
node tests/browser.mjs
node tests/vision-dashboard.mjs
npm run test:exam-browser
```

These scripts create isolated application/database fixtures and start their own loopback servers. They do not require a live institution database. They produce local screenshots/reports under ignored `artifacts/`; those artifacts must remain private and untracked. `PLAYWRIGHT_BROWSERS_PATH` can select the installed browser directory as described in the root README.

| Script                       | Observed behavior it checks                                                                               |
| ---------------------------- | --------------------------------------------------------------------------------------------------------- |
| `tests/browser.mjs`          | Teacher login, enrollment code, session start/end, responsive layout, logout                              |
| `tests/vision-dashboard.mjs` | Dashboard identity, routes, real counters, empty evidence, refresh, responsive layout                     |
| `tests/exam-browser.mjs`     | PDF upload/render/assignment, student launch, timer, saved response, submission and teacher response view |

These tests collect page exceptions. They are not a complete accessibility, console-warning, offline-recovery, policy-coverage or security audit. UI changes should add targeted interaction checks for the actual changed behavior and inspect relevant error/console states.

## Agent logic and Windows acceptance

After provisioning the documented Windows Python environment:

```powershell
.venv/Scripts/python.exe tests/gate_test.py
.venv/Scripts/python.exe tests/evidence_gate_test.py
```

These logic tests do not start a camera, but their current import paths require installed Windows/media dependencies. P0-03 separates the pure rules from those dependencies.

The following native scripts launch actual agent/browser processes and may capture the visible desktop. Run them only on the intended test desktop with private content closed and with authorization for that capture:

```powershell
node tests/run-windows.mjs
npm run test:exam-windows
```

Inspect each script's prerequisites before running. Do not automatically run all `*windows*` scripts as part of a routine check: some exercise a real webcam or packaged EXE and have additional consent/environment requirements.

For packaged camera/snapshot/silent-clip acceptance, follow [CURRENT-VERIFICATION.md](../CURRENT-VERIFICATION.md). It requires explicit agreement to visible camera testing and the documented `EXAMOS_CAMERA_TEST_APPROVED` value before running `tests/evidence-packaged-windows.mjs`. A real supported condition must be presented by a person; fabricated detections or media cannot establish detector acceptance. A partial run must remain reported as partial.

## TLS, database and deployment checks

- `tests/tls.mjs` uses test certificates under `data/tls-test` and a hardcoded Windows project Python path. Provision its isolated prerequisites before execution; never reuse private production keys as fixtures.
- Verify a trusted CA succeeds and an untrusted/expired certificate fails. Local HTTPS/WSS results do not replace a two-machine LAN/certificate-distribution test.
- Native PostgreSQL release acceptance must exercise migrations, enrollment, attempts, evidence, concurrency and restore, not just `SELECT 1` or a single workflow test.
- Backup/restore drills and installer/update checks use isolated environments and compare actual preserved records, source/build hashes and permissions.
- Load tests record hardware, topology, connection count, duration, policy settings, distributions and failure behavior. Synthetic sockets are explicitly labeled synthetic; actual capture and local stop require physical-device evidence.

## Check selection

| Change                        | Minimum relevant validation                                                                                      |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Documentation only            | Local links, stable requirement/backlog references, factual consistency, Markdown formatting and diff inspection |
| Backend/session/auth/protocol | Relevant integration and rejection-path tests; full Node suite when shared behavior changes                      |
| Dashboard/student flow        | Production build plus relevant rendered browser interaction and failure cases                                    |
| Agent lifecycle/OS adapter    | Logic tests plus actual native-platform stop/consent/session checks                                              |
| Camera/evidence pipeline      | Protocol tests plus explicitly authorized actual-media/packaged checks for any hardware claim                    |
| Schema/database/deployment    | Migration/upgrade tests on intended engine, backup/restore and relevant end-to-end behavior                      |
| Performance change            | Repeatable before/after measurements under the same declared profile                                             |

## Evidence record

Record date, source commit/build hash, requirement/backlog IDs, environment, exact checks, pass/fail/incomplete result, artifact location and untested limits in PROJECT-STATUS.md. Private media and credentials stay outside committed documentation. Reports containing generated test identities must not be confused with real product data.

## P0-01 response reliability

`npm test` now includes `tests/answer-sync.test.js` (scheduler/retry/order and SQL revision/duplicate/deadline tests). The suite contains ten tests.

Run `node tests/answer-browser.mjs` after building for actual page failure checks. On a host with system Chrome rather than Playwright Chromium, set `EXAMOS_TEST_BROWSER=chrome` in the test process environment. It aborts isolated test HTTP requests, exercises same-tab reload recovery and continuous editing, and checks cleanup and explicit conflict resolution. No camera or live examination is accessed.

Migration 007 adds response revisions and last mutation IDs. Updated save/submit clients must send `revision` and `mutationId`; refresh existing student pages during a planned upgrade outside active examinations. Draft recovery is same-tab sessionStorage only, not encrypted disk persistence or late submission.

## Event review and manual controls

`npm test` includes `tests/exam-controls.test.js` for paused-save retry retention and real SQL-backed controls/audit/ownership/deadline behavior. `node tests/exam-controls-browser.mjs` covers the actual teacher/student flow; set `EXAMOS_TEST_BROWSER=chrome` for installed system Chrome and optionally `EXAMOS_TEST_ARTIFACT_DIR` for private screenshots. The snapshot is a labeled codec fixture, not actual webcam evidence. Migration 008 must be present. See [EVENT-REVIEW.md](EVENT-REVIEW.md) for the exact contract and deployment limits.

## Phone/app/window pipeline

After building, run `node tests/policy-review-browser.mjs` (`EXAMOS_TEST_BROWSER=chrome` selects system Chrome). It creates isolated SQL fixtures and authenticated sockets, exercises phone codec events, executable allowlist samples and synthetic browser exit handlers, then follows the real teacher review/link-snapshot/dismiss/pause/end UI. Consent and ownership rejection paths are asserted. Migration 009 is required. Physical camera/model acceptance is a separate checklist in EVENT-REVIEW.md and must not be inferred from this pass.
