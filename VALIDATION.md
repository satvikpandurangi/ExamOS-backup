# ExamOS implementation and validation

Historical baseline report. The camera/evidence modules were added later; [CURRENT-VERIFICATION.md](CURRENT-VERIFICATION.md) describes the latest tested scope and takes precedence over this baseline.

The question-paper/student-examination extension is now implemented and migrated in the live workspace. See `QUESTION-PAPERS.md` for its private PDF storage, server timing, device-authenticated student page, exact manual workflow and executed API/browser/Windows acceptance checks. The updated packaged student agent includes **Open examination page**.

Built in this workspace on 30 October 2026. The workspace initially contained only empty `work/` and `outputs/` directories; no existing application files were replaced.

## Implemented

- Responsive React instructor dashboard, Express HTTP API, authenticated Socket.IO transport, visible Windows Tk agent, and PostgreSQL migrations.
- Real teacher login, expiring teacher sessions, hashed random one-use enrollment codes, DPAPI-protected random device credentials, teacher ownership checks and device revocation.
- Examination lifecycle, fresh student consent, visible sharing state, primary-display JPEG previews, foreground executable names, allowlist alerts, persistent event history, and teacher reviews.
- Local stop on consent withdrawal, minimization, or closure; stop notifications on session end, server-side sample rejection, expired-heartbeat enforcement, and a six-second local lease.
- Neutral connection-loss events. No cheating classifier, keylogging, private-message access, password capture, webcam, microphone, or hidden service.
- Persistent embedded PostgreSQL local mode, native PostgreSQL connection/migrations, optional database compose configuration, HTTPS startup, and a local CA/certificate generator.
- Node/Python dependencies installed, built React assets, and standalone Windows agent executable.

## Observed checks

| Check | Observed result |
| --- | --- |
| React production build | Passed with Vite; local bundled assets and no remote fonts/scripts |
| SQL-backed protocol integration | Passed: migration/re-run, login failure/success, unauthorized API access, enrollment replay/expiry, teacher isolation, consent, preview forwarding, rule alerts/reviews, disconnect/reconnect, session end, revocation |
| Unknown process metadata | Technical telemetry event; no allowlist alert |
| Browser workflow in real Chromium | Passed: login, enrollment-code creation, create/end examination, logout, no page exceptions |
| Responsive browser layout | Passed at desktop and 390-pixel mobile width; no horizontal overflow; dashboard screenshots visually inspected |
| Windows native APIs | Tk initialized; Windows DPAPI encryption/decryption round trip passed; primary screen capture succeeded |
| All three components together | Visible Python agent enrolled with a real isolated Express/SQL backend; React in Chromium displayed the actual Windows JPEG preview through Socket.IO |
| Windows consent/session lifecycle | Passed: no pre-consent previews, three real previews, real `python.exe` foreground observation, persisted alert/review, withdrawal stopped sharing, session end stopped sharing and cleared React preview |
| Consent lease gate | Passed: consent, matching session, and unexpired lease all required |
| TLS | Passed: unknown CA rejected, supplied CA accepted for HTTPS and authenticated WSS |
| Persistence/bootstrap | Running setup again preserved the existing teacher and migrated database |
| Node production dependency audit | Reported zero known vulnerabilities at the time of testing |
| Standalone executable | PyInstaller build succeeded; process remained running and exposed the correctly titled consent window during startup smoke check; no connection or capture requested |

The full Windows test uses actual screen content and a real executable name; its test session, instructor and device are isolated fixtures, not product demo data. Captured screen pixels are never written to test artifacts. Browser-only screenshots contain no student screens. The application database is initially empty apart from the real generated instructor account.

## Verification limits and remaining work

- Native PostgreSQL 16 binaries and an existing service were found. The existing service requires unknown credentials; initializing an isolated native cluster stalled in this sandbox. Migrations and SQL operations were exercised with PGlite's real embedded PostgreSQL engine. Native service deployment remains unverified, and is not claimed as completed.
- No second physical Windows machine or school LAN was available. Firewall policy, trusted certificate distribution, actual network partition behavior, and classroom load remain to be tested on that network. TLS transport was exercised locally.
- Packaged executable startup was checked, but computer-use access to its window was rejected because ExamOS was not an approved app. Its packaged visual layout therefore remains unverified. The source agent's visible consent workflow was exercised by the Windows integration test.
- The prototype has no signed installer, password-reset workflow, retention/deletion management UI, immutable review audit trail, pagination beyond the latest 1,000 events, multi-server consent coordination, or resistance to student-side tampering. These limits are documented rather than simulated.
- A partitioned device cannot receive an immediate stop command. It stops under the local six-second lease; reconnecting requires fresh explicit consent. No disconnection is classified as cheating.

## Ready-to-run deliverables

`Start-ExamOS.cmd` or `Start-ExamOS.ps1` builds and starts the local application. The generated instructor login is in `data/initial-login.txt`. `Student-Agent/ExamOS-Agent.exe` runs the Windows agent without Python installation. The source, build scripts, migrations, tests, and LAN configuration are included. No monitoring process is left running after validation.
