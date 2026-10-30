# Question papers and student examinations

This module extends the existing teacher login, enrolled-device identity, sessions, Socket.IO monitoring, consent controls and PostgreSQL database. No replacement project or simulated exam backend is used.

## Test using your actual dashboard and Windows application

1. The upgraded local server is running at **http://127.0.0.1:3000**. Refresh your dashboard and sign in with the existing instructor account (`data/initial-login.txt` if you still use the initial account). After a future reboot, use `Start-ExamOS.cmd` normally.
2. Click **Question Papers** in the sidebar. Fill **Paper title**, **Subject**, **Total marks**, **Exam duration (minutes)** and **Question paper PDF**. Choose a real PDF and click **Upload question paper**. A real small mathematics paper used for acceptance tests is also available at `tests/fixtures/mathematics-question-paper.pdf`; it is an actual PDF file, not a simulated viewer.
3. Click **Preview PDF** next to the uploaded paper. Confirm the actual pages render, then close the preview. Use **Previous page** / **Next page** for multi-page papers.
4. Create an examination with the existing **Start an examination** form, or choose your existing active examination. For your first manual test, leave the application allowlist empty so the browser and agent do not produce application alerts.
5. Under **Assign a question paper**, choose the uploaded paper and active **Examination session**. Leave the all-devices checkbox selected to include this teacher's currently enrolled devices and any devices enrolled later, or uncheck it and select specific enrolled devices. Click **Assign paper to session**.
6. The default examination window opens immediately on assignment and closes after the configured duration. For an unhurried manual test, configure several minutes when uploading, or set **Opens at** and **Closes at** explicitly when assigning. A late start receives only the remaining window; starting or refreshing never resets the deadline. Assignment cannot change after any student has opened the paper.
7. Close any old student-agent window that lacks the new button. Launch **`Student-Agent/Launch-Student-Agent.cmd`**, which opens the updated `Student-Agent/ExamOS-Agent.exe`. For a new enrollment, generate a code using **＋ Enroll a device** in the teacher dashboard, then enter server URL **`http://127.0.0.1:3000`**, a device/student label, and that code in the agent; click **Enroll / Connect**. An already enrolled device can leave the code blank and reconnect using its saved Windows-encrypted credential.
8. The dashboard should show the device online. If you want screen/application monitoring, click **I consent — start sharing** in the agent and keep it visible. This remains separate from exam access; opening a paper does not silently enable monitoring. Minimizing the agent withdraws monitoring consent.
9. Click the new **Open examination page** button in the connected agent. It opens the ExamOS student page in your default browser using a one-use, one-minute device-bound launch code. The long-lived device credential is never put in the browser URL. Simply typing `/student` in a browser without this handoff does not grant paper access.
10. The student page displays the assigned title, subject, marks and duration and renders the uploaded PDF inside the ExamOS page. If an opening time is in the future, access is withheld until that time. The teacher's **Student examination progress** section should change from **Not opened** to **Paper opened** when the PDF is requested.
11. Click **Start examination**. Confirm the countdown advances. The teacher should see **Taking examination**, the start time and remaining seconds. You can enter an optional text response; it saves after a short pause and shows **Response saved**. Responses are limited to 12,000 characters.
12. Click **Submit examination**. The student receives a timestamped confirmation and receipt ID. The teacher sees **Submitted**, its timestamp/reason, and **View response** for the submitted text. Refreshing the student page keeps the recorded receipt and does not create another attempt.
13. Click **End session & stop monitoring** in the teacher dashboard to finish the session. Student paper access and starts are refused after the session/window ends; existing monitoring stops as before. When the configured closing time arrives, the server ends the session automatically, saves started attempts as timed submissions using their last saved responses, and stops monitoring. Students who never started are not falsely recorded as manual submissions or cheating.
14. Use **Refresh paper audit** to see upload, assignment, opening, start, submission, expiry and deletion records. To inspect a different session's progress, select that session in the existing **Session history** dropdown in **Event history & review**.

## Storage and access controls

- PDF bytes and metadata are stored privately in the existing PostgreSQL database (`question_papers.pdf` is `bytea`), not in a public static folder. Authenticated endpoints stream the original bytes with `Cache-Control: no-store`.
- Only the owning teacher can list, preview, assign or delete a library paper. Students must present an enrolled, non-revoked device identity and can access only the paper authorized for that device and session.
- Student browser credentials are separately scoped to one session and cannot authenticate as teachers. One-use launch codes expire after 60 seconds and cannot be replayed. An older session credential cannot access the paper of a new session.
- Browser authentication lasts eight hours. If it expires during an unusually long examination, open a fresh page from the connected agent; the existing attempt and deadline remain unchanged.
- Uploads are limited to one PDF of at most 10 MB and 500 pages. The server checks filename/MIME, PDF header/EOF, parses the document, and rejects encrypted, malformed, JavaScript/action, embedded-file and other active-content PDFs. The locally bundled PDF.js viewer renders pages without executing PDF actions or annotations.
- All opening, starting, saving and submission requests are checked against server time and session state. Browser countdowns are displays, not authority. Network loss is still a connection event, never a cheating classification.
- Deletion removes a paper from the library. PDFs already used in an examination and their audit references are retained privately for historical integrity. Active sessions must end before their paper can be deleted.
- Text responses are supported. Answer-file uploads, annotation tools, automatic marking, and grades are not part of this module.

## Migration and preserved records

`002_question_papers.sql` adds question papers, assignments, device restrictions, attempts, one-use launches and paper audit tables. The migration runner now discovers numbered migrations and records each version; rerunning migrations preserves data. Existing tables, teacher passwords, enrollments, sessions and monitoring events remain in place.

Before the live upgrade, the existing database was backed up under `data/backups/before-question-papers-20261030-143241/postgres`. After migration and restart, the existing instructor login, one session and two enrolled devices were verified. No test papers or fake student records were seeded into your actual library. Acceptance tests use real SQL records in isolated PostgreSQL engines and real uploaded PDF files.

## Executed verification

- `npm test`: original monitoring/authentication/consent lifecycle plus real multipart PDF upload/download, validation failures, teacher/device isolation, scheduled opening rejection, launch replay rejection, started attempt idempotency, saved responses, submission/receipt, deletion constraints, audit and server-triggered deadline closure.
- `node tests/exam-browser.mjs`: real Chromium teacher login, actual file selection/upload, authenticated PDF preview, assignment, enrollment, student PDF canvas rendering, advancing countdown, response persistence, submission and teacher status/response display.
- `node tests/exam-windows.mjs`: same module integrated with the real visible Windows Python agent, live screen/application monitoring, real enrollment, consent, the actual agent-generated student-page handoff, student PDF/start/timer/submission, and session-end monitoring shutdown.
- Updated one-file Windows EXE built and launched from `Student-Agent`; its packaged UI checks include the new examination button. The combined automated Windows workflow uses the source agent; the packaged EXE's enrollment/examination-button UI and PE format are separately verified by the build.

For Chromium tests, set `PLAYWRIGHT_BROWSERS_PATH` to this project's `data/browsers`. The test PDF and screenshots of the rendered student/teacher pages are in `tests/fixtures` and `artifacts`. Actual desktop screen previews are not saved as test artifacts.

## Deployment limits

The local instance uses the existing embedded PostgreSQL mode. External PostgreSQL deployment and a second physical LAN device remain unverified. Use the existing HTTPS/certificate configuration for LAN clients; loopback HTTP is for same-computer testing. No system firewall or certificate-trust settings were changed. Already delivered PDF pixels cannot be recalled from a disconnected browser; the server refuses subsequent access after the examination closes.
