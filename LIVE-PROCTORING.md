# ExamOS camera monitoring and limited examination environment

The subsequent [automatic evidence extension](AUTOMATIC-EVIDENCE.md) adds separate silent clip consent, a bounded pre-event memory buffer, incident notifications/details and append-only review history. Refer to that guide for current evidence settings and tests.

This upgrade extends the existing enrollment, screen monitoring and PDF examination implementation. It uses local OpenCV YOLOX-s inference with a pinned, SHA-256 checked model. Internet access is unnecessary during examinations. No microphone, face identity, gaze, attention, emotion, private messages, input text or clipboard are captured. Screen sharing still requires its original separate consent.

## Try it on this computer

1. The server is available at `http://127.0.0.1:3000`. If stopped, run `Start-ExamOS.ps1` from the project folder. Sign in using your existing teacher account (`data/initial-login.txt` contains the original account if you have not removed it).
2. In **Question Papers**, upload a real PDF with title, subject, marks and duration. Create an examination using **Start session**, then select that session and paper and press **Assign paper to session**. Enrollment may happen before or after assignment when assigning to all devices.
3. Press **Enroll a device**. Launch `Student-Agent/Launch-Student-Agent.cmd` or `Student-Agent/ExamOS-Agent.exe`. Enter `http://127.0.0.1:3000`, a student/device label and the displayed 24-character code. Codes expire after five minutes and can be used once. If already enrolled, leave the code blank and reconnect the saved device.
4. In the visible agent, read the screen-sharing notice and press **I consent — start sharing** if wanted. The teacher should see the actual primary-screen preview and active executable. Consent is never implied by enrollment.
5. Leave **Dedicated Edge examination window — LIMITED lockdown** checked, then press **Open examination page**. Edge opens a separate full-screen, single-tab kiosk window. A new isolated browser profile is used. Windows application switching and security shortcuts remain available. Uncheck the option before opening to use your usual browser instead.
6. On the examination page, optionally consent to recording focus loss/full-screen exits/navigation attempts. This is independent of screen/camera consent. Press **Start examination**. Verify the actual PDF and advancing countdown. Camera cannot start until the assigned examination is started and within its server-enforced time window.
7. Return to the still-visible agent (Alt+Tab is available in limited mode). Select **I consent to local camera analysis of person / phone presence**. Select the separate snapshot checkbox only if you also allow event images to be stored. The displayed maximum retention comes from the teacher's policy. Press **Start camera after starting exam**. The **CAMERA ACTIVE** label appears before camera access; a local live preview then appears. Windows camera privacy settings must permit desktop apps; ExamOS never changes those settings.
Use **Compact monitoring panel** to keep a small, movable status window over the examination. It keeps **MONITORING ACTIVE**, **CAMERA ACTIVE**, **Stop monitoring (Esc)** and the examination button visible. **Restore full consent / camera controls** restores the preview and consent controls; collapsing the panel never changes consent.

8. In the teacher dashboard's **Live Proctoring** section, verify camera status, examination status and LIMITED environment. **Send camera check (consented snapshot only)** sends a real current frame under the explicit label “Student-authorized camera check (not an alert).” It is a pipeline check, not a fabricated suspicious event. Use **View evidence**, a review note, **Reviewed/Dismissed**, and **Save observation review**. **Delete evidence** removes image bytes while retaining the audit event. Set retention between 1 and 30 days; shortening it also caps stored images. Existing consent never grants a longer retention period automatically.
9. Only objectively detected phone/person counts generate camera observations. Sustained phone presence (2 seconds), no person detected (5 seconds), multiple people (3 seconds), and a dark/flat image (3 seconds) have a configurable per-category cooldown (30 seconds by default), plus a two-second clear condition before rearming. No person detected can mean detector failure. A camera check remains available for testing without manufacturing any detection. In limited Edge mode, an actual non-Edge foreground application during separately consented screen monitoring generates an application-switch observation; the agent's own consent window is exempt.
10. Press **Stop camera** to release only the camera. Changing a camera consent checkbox also stops it. Fresh consent and **Start camera** are needed to restart. **Stop monitoring (Esc)**, Escape, minimizing/closing the agent, or **Stop all monitoring** on the examination page stop all monitoring. Connectivity lease expiry also stops sensors; disconnection is a technical event, never a cheating verdict. The browser stop control also closes the owned examination window, so first save any text response; it can be reopened from the agent.
11. Submit from the examination page. Verify the receipt and teacher's submitted status. Screen and camera monitoring stop for that student immediately on the server notification; the owned Edge window closes. Reopen the examination page from the agent if you want to view the receipt again. The server also stops monitoring on individual timeout or teacher session end. Submission cannot be used to resume sensors for the completed examination.

The existing text response autosave and server timer are unchanged. Stopping consent does not submit the examination or destroy answers. Screen previews are transient. Webcam evidence consists of separately opted-in event JPEGs (320×240) and separately consented silent event clips. Continuous footage is not written to disk. All evidence endpoints require the owning teacher's authentication; files have no public URLs. Expired image bytes are swept by the server, and expired evidence access is refused immediately. Audit metadata remains available after image deletion. Existing database backups may contain evidence: school administrators must apply their retention policy to backups too. The server stores private bytea data in PostgreSQL; this prototype does not add database encryption at rest.

## Detection limits and implemented scope

Object presence is not phone usage, identity, interaction, intent or misconduct. YOLOX can miss objects and produce false positives, especially with low light, occlusion, small phones or unusual angles. All observations are marked for review and can be dismissed. This implementation deliberately excludes looking-away, suspicious head/body movement and interaction judgments. No student is automatically classified as cheating.

The Live Proctoring section shows camera **status** and opted-in event snapshots, not a continuous remote webcam feed. The student gets the local live preview. Technical unavailability is visible to both sides. Event clips require a separate opt-in and have no audio. Camera index 0 (the default Windows camera) is used; multi-camera selection is not implemented.

## Windows administrator configuration

This computer reports **CoreSingleLanguage (Home Single Language)**. It cannot run Assigned Access. Its working fallback is explicitly labelled LIMITED; full-screen Edge cannot prevent Alt+Tab, Windows shortcuts or closing the window through Windows. [Microsoft lists the supported Assigned Access editions](https://learn.microsoft.com/en-us/windows/configuration/assigned-access/). The application does not alter Windows policy, install services, suppress Task Manager, or block Ctrl+Alt+Delete.

For a school-owned supported Windows 11 Pro/Enterprise/Education machine, an administrator can provision a dedicated restricted **exam account**. Multi-app Assigned Access is necessary because both the agent and Edge must run. A single-app Edge kiosk alone does not host the Python agent. This is an administrator deployment procedure; **it has not been applied or verified on this Home computer**.

1. Create a dedicated **standard** local account `ExamOSStudent` through Settings → Accounts → Other users. Keep a separate administrator account. Copy the signed/approved ExamOS executable to `C:\Program Files\ExamOS\ExamOS-Agent.exe`; install Edge machine-wide and grant this account ordinary execution permissions. Do not use an administrator account for examinations. The server remains in the instructor account or on the school LAN.
2. Prepare an Assigned Access XML file for the target Windows release. The following Windows 11 22H2+ example allows the two required executables; the actual installed paths and school application-control requirements must be checked on the target image. It does not disable security controls. [Microsoft documents the XML elements and versioned schema](https://learn.microsoft.com/en-us/windows/configuration/assigned-access/configuration-file).

```xml
<?xml version="1.0" encoding="utf-8"?>
<AssignedAccessConfiguration
 xmlns="http://schemas.microsoft.com/AssignedAccess/2017/config"
 xmlns:rs5="http://schemas.microsoft.com/AssignedAccess/201810/config"
 xmlns:v5="http://schemas.microsoft.com/AssignedAccess/2022/config">
 <Profiles>
  <Profile Id="{7E20AE88-686B-47E6-B51A-908969A637CC}" Name="ExamOS examination account">
   <AllAppsList><AllowedApps>
    <App DesktopAppPath="C:\Program Files\ExamOS\ExamOS-Agent.exe"
         rs5:AutoLaunch="true" />
    <App DesktopAppPath="%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" />
   </AllowedApps></AllAppsList>
   <v5:StartPins><![CDATA[{"pinnedList":[]}]]></v5:StartPins>
   <Taskbar ShowTaskbar="false" />
  </Profile>
 </Profiles>
 <Configs><Config>
  <Account>.\ExamOSStudent</Account>
  <DefaultProfile Id="{7E20AE88-686B-47E6-B51A-908969A637CC}" />
 </Config></Configs>
</AssignedAccessConfiguration>
```

3. In the free **Windows Configuration Designer**, create an advanced provisioning project for Windows desktop devices. Open **Runtime settings → AssignedAccess → MultiAppAssignedAccessSettings**, browse to the XML, then export/build a provisioning package. Install that package as administrator on the target device. Sign out and sign in locally as `ExamOSStudent`; this configuration is not an RDP test. [Microsoft's multi-app deployment procedure](https://learn.microsoft.com/en-us/windows/configuration/assigned-access/configure-multi-app-kiosk) and [Configuration Designer setting](https://learn.microsoft.com/en-us/windows/configuration/wcd/wcd-assignedaccess) describe this workflow.
4. On that image, test executable allowlisting, PyInstaller's temporary unpacked libraries, Edge child processes, local CA trust, camera privacy permission, the consent Stop button, PDF rendering, Alt+Tab, Windows keys, end/submission, and Ctrl+Alt+Delete → Sign out. School application-control policy may need an approved signed build; this prototype EXE is unsigned. Do not label the machine fully locked down until the target-device acceptance tests pass. ExamOS continues reporting OS lockdown as **not verified** rather than trusting a client flag.
5. Use the restricted account only during authorized examinations. After submission the agent releases camera/screen and closes its Edge instance; the student can sign out through Windows security and return to their normal account. Assigned Access remains an account policy until an administrator removes its provisioning package under Settings → Accounts → Access work or school → Add or remove a provisioning package. ExamOS does not silently remove or reapply system policy at session boundaries.

Edge's shipped command-line mode uses `--kiosk`, `--edge-kiosk-type=fullscreen`, and a separate `--user-data-dir`. These are [Microsoft's documented Edge kiosk options](https://learn.microsoft.com/en-us/deployedge/microsoft-edge-configure-kiosk-mode). They are not proof that Assigned Access is enabled. No registry edits or system security shortcut changes are required by ExamOS.

## Verification and build

- `npm test`: actual SQL migrations, teacher/device authentication, real enrollment code lifecycle, real PDF upload/assignment, server deadlines, privacy/ownership, separately consented evidence, review/deletion/expiry, Socket.IO notifications, and completion boundaries. Small codec test images in unit tests are labelled fixtures; they are not the hardware acceptance test.
- `node tests/exam-browser.mjs`: teacher upload/assignment and real PDF renderer/student timer/autosave/submission regression.
- `node tests/run-windows.mjs`: real Windows screen/foreground monitoring, consent, Escape/minimize/close stop, event review and session end. Does not activate a webcam.
- `tests/proctor-windows.mjs` with explicit `EXAMOS_CAMERA_TEST_APPROVED=visible-camera-and-temporary-snapshots`: requires the actual participant's permission before running. It opens the real visible agent and camera, checks fresh consent/withdrawal/reopen, uploads actual camera-check evidence, tests the teacher evidence viewer/review/deletion, opens real Edge kiosk, creates a clearly labelled foreground test application and checks submission stops sensors. All test evidence is deleted. The report is `artifacts/real-webcam-test.json`; no private camera image is saved in that report.
- `agent/Build-Agent.ps1`: installs locked Python dependencies, verifies the offline model checksum, builds a one-file Windows GUI application in an isolated staging directory, checks PE headers, launches its real enrollment UI, preserves the old EXE, and publishes `Student-Agent/ExamOS-Agent.exe`. It launches and checks the published file too. Build reports are under `artifacts/agent-*.json` and `data/agent-builds/`.

The webcam acceptance report records actual observed categories, not detector accuracy. Earlier camera runs emitted person-count observations, but no ground-truth accuracy study was performed. The hardware test proves capture, consent and evidence transport, not detection accuracy. Phone detection accuracy, camera obstruction/disconnection hardware behavior and supported Windows Assigned Access remain subject to target-machine acceptance; the camera/consent/evidence pipeline is exercised with real hardware separately from those unproven accuracy claims.
