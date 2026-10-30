# ExamOS architecture

This document describes the existing application; no additional service is required.

* **Windows student:** Python/Tk, Windows DPAPI enrollment credentials, Socket.IO, OpenCV YOLOX object counts, primary-screen previews, foreground executable names and PyAV silent event clips.
* **Instructor:** React/Vite, hash-based authenticated dashboard routing, private Evidence Centre, examination/paper management and incident review.
* **Backend:** Node.js/Express and Socket.IO on one origin. Teacher operations and device messages are serialized per teacher. Device credentials are random tokens stored hashed in PostgreSQL; teacher login uses bcrypt and expiring JWTs.
* **Database:** numbered transactional migrations in `server/migrations`. Local mode uses persistent PGlite (PostgreSQL engine); dedicated PostgreSQL is supported through `pg`. Production deployment of a dedicated database and multiple server replicas needs separate validation.

## Evidence path

The explicitly consented camera worker validates real frames, encodes JPEG and creates a stable client capture UUID. `agent/evidence_uploads.py` stores a bounded Windows-user-DPAPI encrypted outbox and sends the real base64 JPEG over the existing authenticated `proctor-event` Socket.IO event. The backend validates the device/session/started examination, consent, timestamp and JPEG; actual bytes and the evidence catalog are stored together in PostgreSQL. Private database bytea storage is intentional; there is no publicly served evidence directory.

The existing `POST /api/student/incidents/:id/clip` accepts genuine silent WebM bytes. PyAV/FFmpeg validates video before storage. Clips depend on the snapshot receipt and reference the same server incident. The backend recognizes snapshot capture UUID/hash replays and byte-identical clip replays so a lost acknowledgement does not duplicate an incident. Original detection records remain separate from append-only teacher review.

Authenticated teacher routes under `/api/proctor/evidence` list, serve and delete individual media assets after ownership checks. React fetches protected media into temporary object URLs. Socket.IO notifications refresh the dashboard. Metadata associates evidence with the device/student, session, examination attempt, event, MIME type, capture time, expiry and private database locator.

## Privacy and lifecycle

Screen sharing, camera access, snapshots and silent event clips require visible consent controls. No audio, keylogging, passwords, clipboard, private-message stores or hidden startup service are captured. Capture stops on withdrawal, disconnect/lease expiry, examination completion, minimization or close. Reconnection does not reactivate a camera. Pending evidence can retry only with fresh consent for the same device/server/session and appropriate snapshot/clip permission.

The temporary encrypted outbox is bounded to 24 items and approximately 32 MB, with a maximum 15-minute eligibility lifetime and four automatic attempts with exponential backoff. Manual retry is available. Cleanup runs while the agent is running and at the next startup; a closed application cannot delete files on a powered-off machine. Backend retention independently removes retained media after the configured period. Incomplete clips interrupted before completion are reported as unavailable; no frames are fabricated to fill them. No disconnection or detector event is a confirmed finding of cheating.

The single-server startup ends active examinations on restart, preserving stored history and evidence. HTTPS with a trusted certificate is required for non-loopback LAN access.
