# Current verification — 30 October 2026

This records observed results before repository publication and does not treat earlier source-only tests as executable acceptance.

## Passed

* All six Node database/API/Socket.IO regression tests, including enrollment expiry/single use, question papers, consent boundaries, ownership, review and deletion. Added checks verify capture-ID replay returns the same incident/evidence ID, changed data conflicts and a foreign device ID is rejected.
* Three event gate timing tests.
* Chromium instructor/student examination workflow: actual PDF upload/render/assignment, advancing timer, saved answers and submission status.
* Dashboard route/counter/empty-state/responsive regression.
* Visible native Windows screen-sharing/consent workflow, including Escape/minimize/close, fresh consent, teacher updates and immediate local shutdown.
* Current packaged EXE: on-disk PE32+ x64 GUI validation and actual enrollment interface launch.
* Current packaged EXE, real webcam: teacher-requested JPEG captured, uploaded, stored privately with database metadata, fetched through teacher authentication, displayed/enlarged in Evidence Centre and retained across browser refresh.
* Current packaged EXE: genuine silent WebM (189,186 bytes in the observed run) uploaded, validated, stored and played in the teacher dashboard. This was actual captured video, not a still-image slideshow.
* Actual upload request interrupted through an HTTP proxy returning a network failure. The captured snapshot remained DPAPI-encrypted on disk, then uploaded after reconnection and fresh consent, without adding a second copy of the recovered capture.

## Incomplete

The combined packaged acceptance run did **not** finish successfully: no supported automatic detector event was observed during the allotted interval. It stopped at that assertion before the restart-persistence, review/deletion and final independent agent-receipt hash assertions. Those checks exist in `tests/evidence-packaged-windows.mjs`, but a passing complete run is not claimed. Earlier source/API tests of similar behavior do not establish these checks for this build. Camera reconnection behavior warrants further investigation before classroom deployment.

No new migration was required for the upload repair: capture IDs/hashes use existing incident JSON metadata. The user's existing database was not replaced. The live server may require a guarded restart to load changed backend source; use `Restart-ExamOS.ps1 -CheckOnly` before restarting and never interrupt an active examination without authorization.

## Repeatable checks

Run `npm ci`, `npm run build`, `npm test`, then Windows Python unit checks with `.venv/Scripts/python.exe tests/evidence_gate_test.py`. Browser tests require installing the Playwright Chromium browser and setting `PLAYWRIGHT_BROWSERS_PATH` if using a nondefault location.

Windows hardware acceptance is explicit opt-in: after the student agrees to visible camera/snapshot/silent-clip testing, set `EXAMOS_CAMERA_TEST_APPROVED=visible-camera-snapshots-and-clips` and run `node tests/evidence-packaged-windows.mjs`. It launches the actual published EXE with isolated credentials and an isolated persistent database. A human must present a real supported detection condition. It never fabricates an event or webcam frame. Private test media must be deleted afterward; generated reports and all hardware data are ignored by Git.
