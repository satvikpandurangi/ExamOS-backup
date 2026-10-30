# Automatic webcam evidence and incident review

This extends the existing ExamOS webcam stream, detector, authenticated API, PostgreSQL tables and teacher Socket.IO rooms. It does not introduce a second camera stream or replace enrollment, examinations, consent, screen sharing, timers or submission.

## What is implemented

- Sustained phone presence, multiple detected people and no detected person automatically create an incident. Existing technical camera/obstruction observations are preserved. Unusual movement, gaze, interaction and cheating inference are not implemented.
- With snapshot consent, the actual triggering frame becomes a private 320×240 JPEG. Device/student ID, examination attempt ID, session ID, server-aligned UTC detection timestamp, category and available object confidence are retained. Absence/obstruction have no meaningful object-confidence score and show “not available.” Confidence is a detector score, not a probability of cheating.
- Each continuous condition creates one incident. It must clear for two seconds before rearming, and a configurable 10–300-second cooldown must also elapse. Default: 30 seconds. Categories have independent gates.
- A separate, initially unchecked **silent event clip** consent enables a bounded JPEG ring buffer in RAM. Default: approximately five seconds before and five seconds after detection, configurable to 4–20 seconds total. Only an event's frames are encoded to VP8 WebM; no continuous footage or temporary video files are written to disk. The encoder creates no audio stream.
- An immediate `proctor-incident` notification reaches the authenticated owning teacher. The dashboard shows a prominent alert, protected snapshot, student/exam identification, timestamp, confidence and clip availability. The snapshot arrives first; a second notification updates clip availability after the post-event period, encoding, upload and validation.
- **Open incident details** shows the original detection, snapshot, playable silent video, timing/available pre/post coverage and incident timeline. Reviews support **Reviewed**, **False Positive**, and **Requires Investigation**, with comments. Original category, time, confidence and snapshot are not changed by review. Review history is append-only, and the review cache/history write is atomic. Legacy Dismissed records remain supported.
- Snapshot and clip bytes remain in protected database `bytea` columns, extending the existing storage approach. Media is not served from a public directory. Both viewing endpoints require the owning teacher's token; student tokens and other teachers cannot retrieve it. The server fully decodes uploaded WebM in a bounded subprocess and rejects audio, invalid codecs, dimensions, timestamps and size/duration violations. Limits: VP8, 320×240, 2 MB, 100 frames, no other streams.
- Existing retention applies to both media types (1–30 days). Expired access is rejected immediately and bytes are deleted by the server sweep. **Delete evidence** deletes snapshot and clip while retaining the original incident metadata and review history. Institutions must separately apply their retention policy to database backups.

## Try the feature

1. Open `http://127.0.0.1:3000` and sign in with your existing teacher account. Migration `005_incident_clips.sql` has been applied to this workspace after backing up the database. The active “maths” session was ended with the owner's explicit permission; devices and examination history were preserved.
2. Upload/assign a PDF and start a new examination session using the existing workflow. Under **Live Proctoring**, choose retention, cooldown and clip duration; click outside each field to save. Capture settings apply at the next explicit camera consent. A policy change cannot increase an already-consented clip duration or retention, or decrease the student's consented cooldown.
3. Launch `Student-Agent/Launch-Student-Agent.cmd`. Reconnect an enrolled device or redeem a fresh teacher-issued code. Open its assigned examination and press **Start examination**.
4. The student reads the visible notice, opts into camera analysis, then separately selects event snapshots and silent event clips. Clips require both evidence opt-ins. Press **Start camera after starting exam**. The persistent camera indicator appears before camera access. The optional compact panel preserves indicators and the Stop control.
5. To test with a real event, hold a phone clearly in the webcam view for several seconds, or leave the frame for at least five seconds. Actual detection is required; the system does not invent incidents when it does not detect an object/absence. Do not treat a detection as proof of misconduct.
6. The teacher receives the immediate alert. Use **Open latest incident** or **Incident review** in the sidebar, then **Open incident details**. The snapshot is available first. Wait for the post-event period and upload, then play **Silent incident clip**. Save a review comment and status. Subsequent reviews remain in the history.
7. Submit the examination or stop consent. Monitoring stops and buffered/pending clips are discarded; capture never continues just to finish a clip. Previously accepted evidence remains subject to retention/deletion. Starting monitoring again requires fresh explicit consent.

## Actual verification

`artifacts/automatic-evidence-test.json` records the successful user-approved Windows hardware test. This was an actual supported phone detection, not the manual camera-check button and not a fabricated model result:

- Phone detector confidence: **0.842**.
- Actual snapshot and correct enrolled device, session and examination attempt association verified.
- Owning teacher received the Socket.IO incident notification in **22 ms on loopback**. This is one measured test, not a LAN latency guarantee.
- Actual silent VP8 WebM decoded on the server and played in Chromium's teacher incident viewer: **18 frames, 7.25 seconds**, 320×240, no audio stream.
- Actual coverage was **2.378 seconds before / 4.886 seconds after** detection. This early event occurred before the five-second pre-buffer filled. Missing pre-event footage is not generated or repeated to pretend it existed.
- False Positive and Requires Investigation reviews retained the original detection and snapshot unchanged and created two distinct review-history entries.
- Student/no-token/other-teacher evidence access was refused. Expiry denied access immediately; automatic deletion removed both captured media types. All actual test evidence was deleted, and submission released the camera and screen monitoring.

The hardware workflow exercised the native Python Windows agent and real React/Express/SQL/Socket.IO components. Packaging checks separately verify the Windows EXE, visible consent UI, offline detector and VP8 encoder availability. Do not interpret those packaging checks as a separate real-camera test of the packaged EXE.

Additional verification: `npm test` covers the existing six backend integration tests, now also checking clip consent, configuration bounds, immutable detection/review history and rollback when the audit write fails. `tests/evidence_gate_test.py` has three pure timing-rule tests (no camera or generated incidents). The existing PDF/browser and Windows screen-consent regression suites remain available. The positive hardware evidence test never generates dummy snapshots or sample video.

## Setup and limits

- Both agent encoding and server validation use **PyAV 19.0.2**, with bundled FFmpeg libraries. The dependency is installed in this workspace and locked in the agent requirements. `agent/Build-Agent.ps1` packages the updated student executable with its codec dependencies. No paid API or runtime cloud call is involved.
- A separate server installation needs Python 3.12+ and `av==19.0.2` (`server/requirements-media.txt`). Set `EXAMOS_MEDIA_PYTHON` to that Python executable if the server does not use the project's `.venv`. On Windows the default is `.venv/Scripts/python.exe`; on Linux it is `.venv/bin/python`, then `python3`. Missing validation dependencies produce an upload error, not a falsely successful clip.
- Camera, snapshot and clip consent are separate and off initially. Clip consent includes the buffer, duration and retention notice. The application does not obtain institutional approval or certify legal compliance; the deploying institution must approve its use and retention policy before real examinations.
- The ring buffer warms up only after explicit clip consent and camera activation. Early events have less pre-event coverage. CPU/inference timing affects frame rate (at most approximately four samples/second), and a clip's real frame timestamps/coverage are shown. Do not expect smooth 30 fps video or guaranteed exact ten-second duration.
- At most two pending event windows and two encoding/uploads are retained at once. A full queue or codec/storage error is visible to the student; the server marks failed/missing clips unavailable. The snapshot/original incident is not silently reported as a successfully stored clip. Pending clips expire after 45 seconds if they cannot be completed.
- Permission denial, unavailable/disconnected camera, server lease loss, withdrawal and examination completion retain the existing fail-closed behavior. Pending buffers are discarded rather than recording beyond consent/session limits. Already transmitted bytes cannot be recalled; the server rechecks current grant, ownership, consent, active attempt and retention before committing a clip.
- Phone recognition accuracy, multiple-person counts and absence detection are not ground-truth validated by one test. Poor lighting, small/occluded objects, posters and camera angles can cause misses and false positives. Repeated unusual movement is intentionally omitted. No observation or review status automatically determines cheating.
- Current local database mode is persistent PGlite (a PostgreSQL engine), preserving the existing architecture. A separate native PostgreSQL service and multi-device classroom performance were not tested in this change. Evidence is not newly encrypted at rest; protect the database and backups using institutional controls. Existing HTTPS requirements apply on LAN connections.

## Changed project files

| File | Change |
| --- | --- |
| `agent/camera_monitor.py` | Continuous-condition gate, category confidence, detection timestamps, consented ring buffer and incident-linked clip upload |
| `agent/event_clip.py` | New in-memory silent VP8/WebM event encoder |
| `agent/agent.py` | Clip consent/notice, bounded consent settings, upload, evidence errors and codec/UI verification |
| `agent/requirements.txt`, `agent/requirements-lock.txt` | Pin PyAV runtime |
| `server/migrations/005_incident_clips.sql` | Capture settings, attempt association, private clip metadata/bytes and review-history table |
| `server/proctoring.js` | Incident notifications/details, private clip validation/upload/playback, review history, configuration, deletion and expiry |
| `server/media.js`, `server/validate_clip.py`, `server/requirements-media.txt` | Bounded media-validation subprocess and runtime dependency |
| `server/app.js` | Teacher incident/evidence socket events, clip grant cleanup and private blob video CSP |
| `dashboard/src/LiveProctoring.jsx` | Incident details, protected video player, settings, pending review and history |
| `dashboard/src/main.jsx` | Immediate teacher alert and incident navigation |
| `dashboard/src/StudentExam.jsx` | Evidence transparency notice before starting |
| `dashboard/src/style.css` | Pending incident, notification and evidence-view styling |
| `tests/incident-windows.mjs` | Real automatic phone/camera-to-teacher evidence acceptance test |
| `tests/windows_proctor_bridge.py` | Explicit clip-test consent and real-camera test mode |
| `tests/evidence_gate_test.py`, `tests/proctor.test.js` | Timing, authorization, configuration and review audit regression checks |
| `README.md`, `LIVE-PROCTORING.md`, `AUTOMATIC-EVIDENCE.md` | Updated feature, testing and setup documentation |
| `dashboard/dist/`, `Student-Agent/ExamOS-Agent.exe` | Updated compiled application assets and student executable |
| `artifacts/automatic-evidence-test.json`, `artifacts/agent-*.json` | Actual hardware and executable/UI verification results |

Existing executable versions and the pre-migration database are preserved under `data/agent-builds/` and `data/backups/` respectively. The launcher keeps the same path and opens the updated EXE.
