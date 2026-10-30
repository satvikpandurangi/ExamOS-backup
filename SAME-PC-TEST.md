# Test the Windows agent and instructor dashboard on one computer

Verified against the current source, launch scripts, local `.env`, and packaged executable location. The local configuration uses loopback HTTP on port 3000 and persistent embedded PostgreSQL; no separate PostgreSQL installation is needed for this test.

1. Double-click `Start-ExamOS.cmd` in the project root. Leave its terminal running. Wait for `ExamOS http://127.0.0.1:3000`, then open `http://127.0.0.1:3000` in your browser. Sign in using the email and password in `data/initial-login.txt`.
2. In the instructor dashboard, click **＋ Enroll a device** at the top right. Copy the value displayed under **One-use enrollment code**. It is generated on the backend by authenticated `POST /api/enrollment`, expires in five minutes, and works once. There is no hardcoded or default enrollment code.
3. Double-click `Student-Agent/ExamOS-Agent.exe`. Python installation is not required for this packaged executable. The window title is **ExamOS — Student consent**. Keep the instructor browser open.
4. Fill the agent's visible fields:

   | Field | Value |
   | --- | --- |
   | Server URL (HTTPS on LAN) | `http://127.0.0.1:3000` |
   | Device / student label | `Same-PC Student` (or another nonempty label) |
   | One-use enrollment code | The code copied from the dashboard |

   The fresh-agent default is now `http://127.0.0.1:3000`; confirm it matches the student server URL shown beside the teacher code. Previously saved enrollments restore their original URL. HTTP is explicitly permitted for loopback addresses. Click **Enroll / Connect**. The code clears as soon as HTTP enrollment succeeds, and the separate **Connected** label confirms the live connection. Use the same server origin on later connections; leave the code blank to reuse the saved credential.
5. In the dashboard, confirm **CONNECTED DEVICES** increases and a **Same-PC Student** card appears with **Awaiting consent**. This indicates a connected socket, not merely a saved enrollment record. Before consent, **No screen shared** and **Monitoring stopped** are expected. The sidebar's **Live connection** refers to the instructor browser's socket, not the student's connection.
6. Under **Start an examination**, enter a name such as `Same-PC test`, leave **Allowed executable names (optional)** blank, and click **Start session →**. The agent should display the examination name. In the agent, click **I consent — start sharing**. Its status becomes red and reads **● MONITORING ACTIVE**. The dashboard card changes to **Sharing**, **CONSENTED NOW** increases, and the card starts showing the actual primary display. Captures occur approximately every two seconds; allow up to five seconds for dashboard state refresh.
7. Keep the agent visible and move it to one side; **do not minimize it**, because minimizing withdraws consent. Keep the dashboard visible alongside another app. Open Notepad, type harmless test text, and leave Notepad in the foreground for at least five seconds. The preview should reflect that text and the card footer should show the foreground executable, usually `Notepad.exe` or `notepad.exe`. Switch to another app and wait again. Check **Event history & review** for `application` events containing the executable names. Returning to the browser changes the foreground app again, so history is useful for verifying the prior app. Only executable names are collected, not window titles or keystrokes.
8. Click **End session & stop monitoring** in the dashboard. The agent must return to **NOT MONITORING**, show no active examination, and the dashboard must remove the preview and show **Monitoring stopped**. You can also test **Stop monitoring (Esc)** in the agent; that stops sharing while leaving the device connected.

## Expected same-computer behavior

- The teacher and student are observing the same primary display, so a preview of the dashboard can show a repeating mirror effect. This is normal, not simulated data.
- The executable may initially be `ExamOS-Agent.exe` or your browser's executable because that is the foreground app. `[unavailable]` means Windows did not permit/read the process metadata; it is a technical event and does not generate an application-rule violation.
- An empty application allowlist intentionally produces no allowlist alerts. To test alerts separately, start a new session with `notepad.exe` allowed, consent again, and foreground another application for several seconds. Alerts require teacher review; they do not classify cheating.
- After successful enrollment, the code field clears and the device credential is saved using Windows DPAPI at `%LOCALAPPDATA%\ExamOS\device.dat`. Later launches restore the URL and name; leave the code blank and press **Enroll / Connect**. Revoked devices or a different server require a new code. Reconnection and each new session require fresh sharing consent.

## If a step fails

- **Cannot open dashboard:** check the launch terminal for errors and confirm it reached the listening message. Do not start a second server against the same local database. The default port is 3000.
- **Enrollment fails:** confirm all three fields, use a fresh code from the currently signed-in teacher, and submit it within five minutes. The agent requires a nonempty device label. A previously used code cannot be reused.
- **Device shows Offline:** enrollment alone is insufficient; the agent must remain running and connected. Generate a new code if its saved credential was revoked.
- **Connected but no preview:** start an examination, accept consent in the agent, keep its window visible, and check for a red monitoring indicator. Verify that a primary-display application actually changes. Previewing a static desktop naturally looks static.
- **New session after restarting the server:** server restart ends the old session intentionally. Start a new session, reconnect if necessary, and consent again.

## Implementation and verification

Relevant code: `server/app.js` (`POST /api/enrollment`, `POST /api/enroll`, authenticated device sockets, state and sample handling), `agent/agent.py` (visible fields, enrollment, consent, capture and executable lookup), and `dashboard/src/main.jsx` (enrollment button, device badges, preview and history).

The isolated combined test was rerun successfully: Chromium rendered real previews received from the Windows source agent through the backend; three real JPEG previews and the actual `python.exe` foreground name were observed, with no frames before consent or after withdrawal/session end. This test runs the Python source agent, not the packaged executable. The packaged executable exists at the path above; its prior startup smoke test is recorded in `VALIDATION.md`.
