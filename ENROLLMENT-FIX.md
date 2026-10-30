# Enrollment investigation and verified fix

## Actual findings

The saved Windows credential at `%LOCALAPPDATA%\ExamOS\device.dat` decrypted successfully, referenced `http://127.0.0.1:3000`, authenticated to this running backend, and completed a Socket.IO connection. The credential's device record was therefore already enrolled. The running dashboard, configured backend and saved agent URL referred to the same loopback server and persistent database.

The confirmed failure was in the transition from enrollment to connection:

1. The teacher dashboard called authenticated `POST /api/enrollment` and displayed a newly generated 24-character code.
2. The agent called public bootstrap `POST /api/enroll` with that code and a device/student name. The server accepted it, deleted the code row and returned a device credential.
3. The agent then tried Socket.IO with WebSocket first. That ordering did not fall back to polling when the initial WebSocket connection failed.
4. The agent cleared the code field only after the socket connection succeeded. After a connection failure, Retry submitted the already-consumed code again instead of using the credential it had just received.
5. Because the server had deleted the code row, it returned the same generic invalid/expired message for a used code. The agent displayed a generic HTTP 400 exception rather than the backend's explanation. Its `NOT MONITORING` label also did not distinguish a healthy enrollment/connection from monitoring consent.

This exact sequence was reproduced with a real code generated in the actual teacher UI, a visible Windows agent, real HTTP enrollment and SQL device insertion, and a real Socket.IO server accepting polling but rejecting WebSocket. The before-fix report is `artifacts/enrollment-before-fix.txt`. A second test used a real server temporarily refusing the student socket after successful HTTP enrollment, then restored the socket and verified a successful retry with the saved credential.

The original first connection failure on the user's earlier run was not preserved in the old generic error handling, and the current local network accepts WebSocket. A permanently blocked WebSocket on this computer is therefore **not** claimed. The verified enrollment/retry defect is independent of the consent screen; no monitoring consent is needed to enroll or connect.

## Changes

- HTTP enrollment and Socket.IO connection are now distinct stages. A successful HTTP result is cached and written atomically as a Windows DPAPI-encrypted credential; its code field is cleared immediately, even if the socket subsequently fails.
- Retry and later launches use the saved device credential. Recognizing the last accepted code's protected fingerprint also avoids accidentally resubmitting it. This does not redeem a code twice: the backend still rejects every replay.
- The agent starts Socket.IO with polling and upgrades to WebSocket when available. Polling remains a real working transport when WebSocket is unavailable.
- The agent now displays a separate **Connected** / **Disconnected** status. **NOT MONITORING** remains correct until a session and explicit monitoring consent exist.
- Fresh installs default to `http://127.0.0.1:3000`, matching this local deployment. URL validation requires an actual server origin, rejects accidental `/api` or `/student` page paths, and retains mandatory HTTPS and certificate verification for LAN addresses. The teacher code banner shows the exact student server URL.
- Empty/oversized device names are rejected clearly before submission. Code formatting accepts copied whitespace and uppercase hexadecimal safely; no non-hexadecimal characters are accepted.
- Migration `003_enrollment_lifecycle.sql` retains hashed code records with `created_at`, `expires_at` and `used_at`. Claiming a code and inserting its device now happen in one atomic SQL statement. An insertion failure rolls back the claim; concurrent redemptions create exactly one device.
- Used, expired and invalid codes return distinct `ENROLLMENT_USED`, `ENROLLMENT_EXPIRED` and `ENROLLMENT_INVALID` errors. The agent displays those explanations instead of a bare HTTP status. Rate-limited attempts also have a clear explanation.
- The teacher dashboard uses the server-provided deadline, provides a copy button, and marks a code **Already used** when enrollment succeeds. The existing roster refresh and connected-device update remain in place.

Previously deleted used-code rows cannot be reconstructed. The distinct used/expired lifecycle is available for newly issued and retained codes. Existing valid device credentials still reconnect without needing their old code.

## Executed verification

- `tests/enrollment-browser-agent.mjs`: teacher browser login → real dashboard-generated code → visible Windows source agent → actual polling-only server connection → teacher online card → reconnect with the same device ID. The code was visibly marked used, cleared from the agent, and no monitoring started.
- The same test with `EXAMOS_REJECT_FIRST_SOCKET=1`: HTTP enrollment succeeded, the socket initially failed, the accepted code was cleared, and Retry connected with the saved credential once the real server allowed the connection. Only one device record existed.
- `tests/enrollment.test.js`: actual issued-code hash storage and five-minute timestamp interval, whitespace/case normalization, required name, used/expired/wrong-server errors, fresh-code redemption, simultaneous redemption and rollback after a genuine SQL insertion failure.
- `tests/enrollment-real-expiry.mjs`: waited through a real five-minute deadline without editing database timestamps or mocking clocks; the code was rejected afterward and no device was created. See `artifacts/enrollment-real-expiry.txt`.
- `tests/enrollment-live.mjs`: the running workspace dashboard generated a fresh code and the real Windows source agent connected and reconnected successfully. All four pre-existing device records were preserved. Only the new verification device was revoked afterward.
- `tests/enrollment-packaged.mjs`: launched the actual published `Student-Agent/ExamOS-Agent.exe`, not the Python source. A dashboard-issued code enrolled it, the teacher observed it online, and a second EXE launch reused its encrypted credential and the same device ID. Both the polling-only server and the running workspace server passed; no consent was granted or screen previews captured in these enrollment-only tests.
- Existing monitoring/consent, examination, PDF, timer, submission, teacher dashboard and TLS tests are retained. The raw regression results are in the `artifacts/enrollment-*regression*` files.

The live workspace database was backed up under `data/backups/before-enrollment-fix-20261030-162239` before applying migration 003. Tests added two clearly named verification devices to the actual workspace, then revoked only those new devices. Existing devices and the saved user's credential file were preserved; isolated integration tests do not seed production demo records.

## Use the corrected application

1. Refresh **http://127.0.0.1:3000** and sign in normally.
2. Close an older agent window, then launch `Student-Agent/Launch-Student-Agent.cmd` so the new EXE is used.
3. If this Windows user is already enrolled, keep its restored server URL and **leave the code field blank**. Click **Enroll / Connect**, or **Reconnect** after a disconnection. A separate **Connected** label confirms success even when no examination is active.
4. For a new enrollment, click **＋ Enroll a device** in the teacher dashboard and **Copy enrollment code**. In the agent, enter the same server URL shown in that banner, a nonempty device/student label and the new code. Submit within five minutes.
5. Confirm the agent says **Connected** and the dashboard roster shows the named device online. A code is one device only; generate another code for a different device. A used code is not needed for reconnecting an already enrolled agent.
6. Start an examination and grant the existing initial consent only when you want monitoring. The **MONITORING ACTIVE** indicator, **Stop monitoring (Esc)**, question papers, countdown and submission workflow remain separate from enrollment.

The packaged verification mode requires explicit environment-supplied server/code and an isolated credential path. It opens the normal enrollment UI, performs the actual connection without granting monitoring consent, and writes a report containing connection state and device ID, never the token or code. Normal launches behave normally.
