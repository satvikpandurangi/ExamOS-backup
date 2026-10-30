# ExamOS

Current source publication: see [CURRENT-VERIFICATION.md](CURRENT-VERIFICATION.md) for the latest upload repair and its incomplete packaged acceptance checks. It takes precedence over historical test claims below. See [ARCHITECTURE.md](ARCHITECTURE.md) and [REPOSITORY-DISTRIBUTION.md](REPOSITORY-DISTRIBUTION.md) for component boundaries, private storage and source/binary contents.

Working LAN-first examination prototype: a Windows Python student agent, Express + Socket.IO service, React instructor dashboard, and PostgreSQL schema/migrations. No paid services, hosted dependencies at runtime, or seeded product data.

## Open the local application

The default teacher interface is now **ExamOS Vision**, with seven pages, a real Evidence Centre and consented teacher camera checks. See [EVIDENCE-CENTRE-FIX.md](EVIDENCE-CENTRE-FIX.md) for the observed root cause, migration/API details, actual hardware verification, changed files and guarded restart commands.

Automatic incident snapshots, separately consented silent event clips and append-only teacher review are documented in [AUTOMATIC-EVIDENCE.md](AUTOMATIC-EVIDENCE.md), including the successful real phone/webcam test and all changed files.

The camera and Live Proctoring extension is described in [LIVE-PROCTORING.md](LIVE-PROCTORING.md), including the actual webcam acceptance results, separate camera/snapshot consent, private evidence retention/review, limited Edge examination window, and Windows administrator deployment steps. The default camera is never opened before explicit consent and a started assigned examination.

Enrollment retry/transport handling is fixed. See [ENROLLMENT-FIX.md](ENROLLMENT-FIX.md) for the reproduced cause, five-minute single-use lifecycle, actual EXE/live-workspace verification, and reconnect steps. A code is consumed once during HTTP enrollment; subsequent connections use the saved device credential.

The question-paper and student examination module is implemented. See [QUESTION-PAPERS.md](QUESTION-PAPERS.md) for the exact teacher upload/assignment and Windows-agent-to-student-page workflow, server timing, private PDF storage, and executed acceptance tests.

For the exact Windows same-computer workflow, see [SAME-PC-TEST.md](SAME-PC-TEST.md), including enrollment fields, the loopback server URL, connection indicators, and preview/application checks.

Run `./Start-ExamOS.ps1` from PowerShell. It preserves existing data, builds React, initializes the local embedded PostgreSQL database, and starts the service at **http://127.0.0.1:3000**. Node.js 22+ is required. On a fresh checkout the launcher installs Node dependencies. For webcam clip validation and agent builds, first install Python 3.13, run `py -3.13 -m venv .venv`, then `.venv/Scripts/python.exe -m pip install -r agent/requirements-lock.txt`. The model is included with its upstream license and checksum.

The real initial instructor account is recorded in `data/initial-login.txt`. The password is randomly generated, hashed with bcrypt in the database, and never hardcoded. Keep that file private; remove it after recording the password. Setup does not overwrite existing teachers. Additional teachers can be provisioned locally with `npm run teacher` and a password supplied in `EXAMOS_TEACHER_PASSWORD` (minimum 12 characters).

Start the student app with `./agent/Start-Agent.ps1` (Python 3.13 + Tk required), or use the packaged Windows executable if present in `Student-Agent`. There is no startup task, service, or automatic connection. Enter the server URL, student/device label, and the instructor's enrollment code. On later launches, press Connect to reuse the Windows-encrypted device credential.

For the packaged app, double-click `Launch-Student-Agent.cmd` in this project folder, or `Student-Agent/ExamOS-Agent.exe` directly. `EXE-00.toc` is internal PyInstaller build metadata and cannot launch the app. `agent/Build-Agent.ps1` uses the tracked `agent/ExamOS-Agent.spec`, builds in a separate directory, validates the Windows PE format and the actual packaged enrollment UI, and then publishes the verified EXE to `Student-Agent`. Existing EXEs are preserved under `data/agent-builds`; a running old copy is preserved rather than terminated when publishing its replacement.

Instructor workflow: sign in → Enroll a device → share the one-use code directly → Start session → students explicitly accept consent → live screen/app previews → review alerts/events → End session. Codes expire in five minutes. Devices belong to the teacher that issued the code. Revoke disables further connections; a new enrollment is needed to restore access.

## LAN deployment

The local bootstrap generates a private `.env` for a **single-machine development mode** using persistent PGlite, an embedded PostgreSQL engine. It is real SQL storage, not an in-memory demo. The live application starts empty. For a classroom use a dedicated PostgreSQL service and HTTPS:

1. Provision PostgreSQL 16+ with a dedicated database/user, or use `compose.yaml` after setting `POSTGRES_PASSWORD`. Docker is optional and was not available on this host. The database's port is bound only to server loopback in the compose configuration.
2. Set `.env` `EXAMOS_LOCAL_DB=0`, `DATABASE_URL=postgres://USER:PASSWORD@127.0.0.1:5432/examos`, and a unique `JWT_SECRET` of at least 32 characters. URL-encode special characters in database credentials. Run `npm run migrate`, then provision a teacher with `npm run teacher`. Development and external database contents are separate; switching does not transfer accounts/history.
3. Obtain a certificate trusted by the student machines, or run `.venv/Scripts/python.exe scripts/create-lan-certificate.py --host EXAM-SERVER --host 192.168.1.10` using the actual server name/IP. This creates a private local CA and server certificate under `data/tls`, refuses to overwrite a CA, and performs no system trust changes. Keep both private keys on the instructor host. Distribute only `ca.crt` through a trusted channel. Configure browser trust for this CA through your normal school device-management process.
4. Set `HOST=0.0.0.0`, `TLS_CERT=data/tls/server.crt`, `TLS_KEY=data/tls/server.key`, `PORT=3000`. Start `npm run dev`; it serves the built dashboard and Socket.IO on the same HTTPS port. Plain HTTP binding to LAN addresses is rejected. On agents using this local CA, set `REQUESTS_CA_BUNDLE` to the local path to `ca.crt` before starting the agent; certificate verification is never disabled. Certificates expire after 90 days; arrange renewal.
5. Allow inbound TCP 3000 only on the instructor's private school LAN profile using the administrator's firewall policy. No firewall or machine-wide trust settings are modified by this project. Students use `https://EXAM-SERVER:3000` (or the certificate's IP), not localhost.

The service needs no Internet connection once dependencies are installed. No images, fonts, or scripts are fetched from a CDN. Python requirements and `package-lock.json` describe the dependencies. `npm ci` restores Node dependencies. `agent/requirements-lock.txt` records the tested Windows Python environment.

## Consent and monitoring boundaries

- Each new session requires explicit acceptance in the visible agent. Reconnection never grants consent. The agent does not reconnect automatically.
- Screen sharing includes a primary-display JPEG up to 960×540 every two seconds and the foreground executable basename. Screen content itself can contain private information: students are told to close private content before consenting. Camera access is separately optional, with an additional snapshot opt-in. No window titles, keystrokes, input hooks, message stores, passwords, clipboard or audio are accessed.
- A red, topmost monitoring window identifies sharing. Minimizing the agent withdraws consent; closing it stops sharing and disconnects. The agent remains fully usable outside monitoring.
- Withdrawal stops capture locally before notifying the server. Normal session end sends an immediate stop message, invalidates server consent, rejects subsequent samples, and clears instructor previews. Server restart ends active sessions.
- If the stop message cannot arrive because of a network partition, the client fails closed when its six-second local lease expires (heartbeat calls time out after three seconds). It cannot capture indefinitely while disconnected. Already transmitted packets cannot be recalled. Fresh explicit consent is required after lease expiration.
- The server accepts samples only for the authenticated device owner's active session with current consent and a recent heartbeat. Previews are forwarded transiently and are **not persisted**. Dashboard previews expire after ten seconds or clear on disconnect/end. This is preview streaming, not continuous video recording.
- Application allowlist rules compare executable names case-insensitively. A mismatch produces at most one rule alert per device per 30 seconds. Unknown/unreadable process metadata is a technical telemetry event, not a rule violation. An empty list imposes no application rule.
- Disconnect events are technical connection-loss records. They never determine or label cheating. Every rule alert requires teacher review; there is no automated misconduct classification or penalty.

## Components

| Path                                | Responsibility                                                                                                                |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `server/app.js`                     | Authenticated HTTP API, device/teacher Socket.IO authentication, ownership checks, consent, transient previews, events/review |
| `server/index.js`                   | HTTPS/loopback HTTP startup, migration, restart/shutdown handling                                                             |
| `server/migrations/001_initial.sql` | Teachers, hashed device tokens/enrollment codes, sessions, events, indexes                                                    |
| `dashboard/src`                     | Responsive React instructor interface and live connection handling                                                            |
| `agent/agent.py`                    | Visible Tk Windows consent UI, DPAPI enrollment persistence, screen capture and executable lookup                             |
| `scripts`                           | Local bootstrap and local CA/certificate generation                                                                           |
| `tests`                             | Protocol, browser, Windows end-to-end, consent gate, and TLS verification                                                     |

Teacher HTTP tokens expire after eight hours and live sockets are disconnected at expiry. Browser tokens are held in sessionStorage and cleared on logout. Device credentials are 256-bit random bearer tokens, stored hashed on the server and encrypted under the current Windows user using DPAPI on the student. Enrollment codes are 96-bit random one-use tokens stored only as hashes. Teacher ownership is enforced for devices, sessions, history, reviews, and live preview rooms. Login/enrollment attempts are rate limited. API bodies and Socket.IO frames are bounded.

## Verification

`npm test` runs the SQL-backed protocol lifecycle and ownership tests. `TEST_DATABASE_URL` selects a separate native PostgreSQL **test database**; never point it at production. Otherwise tests run against isolated embedded PostgreSQL. `npm run build` produces the production React assets.

`node tests/browser.mjs` runs real Chromium against an isolated server/database. Set `PLAYWRIGHT_BROWSERS_PATH` to `data/browsers` for the browser downloaded here; otherwise install a matching browser with `npx playwright install chromium`.

`node tests/run-windows.mjs` opens the actual Windows agent, enrolls it with an isolated real backend, launches React in Chromium, and explicitly exercises test consent. It captures the actual primary display locally. It verifies the React dashboard displays those real JPEGs, executable monitoring, rule alerts/review, no pre-consent frames, withdrawal, and session-end shutdown. No captured pixels are saved. Run only on the intended visible test desktop, with private content closed. The script has a 60-second limit and closes the agent afterward.

`.venv/Scripts/python.exe tests/gate_test.py` verifies the consent/session/lease gate. `node tests/tls.mjs` verifies rejection of an untrusted certificate and successful authenticated HTTPS/WSS using the generated CA under `data/tls-test`.

See `VALIDATION.md` for observed results and remaining limitations. Generated test reports and screenshots under `artifacts/` are local-only and excluded from the source repository.

## Prototype limits

Native PostgreSQL service initialization and a second physical LAN device were not validated in this sandbox. Multi-classroom load, certificate rollout, backups, retention/deletion policy, signed installer distribution, password reset, and institutional deployment hardening remain operational work. There is no tamper resistance: a student may stop/alter their own agent, which is not itself a misconduct determination. Only the primary monitor is shared; executable names can be ambiguous and are evidence for review rather than proof. History currently shows the latest 1,000 events per session; review edits overwrite the prior review text. Local development mode supports one server process. Do not run multiple backend replicas without shared device/consent coordination.
