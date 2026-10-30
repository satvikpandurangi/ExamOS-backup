import { chromium, expect } from "@playwright/test";
import { spawn } from "node:child_process";
import { fixture, actualPaper } from "./exam-fixture.mjs";
import { readFile, mkdir } from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
const f = await fixture();
await actualPaper();
await mkdir("data/tmp", { recursive: true });
const linkReport = path.resolve("data/tmp/exam-link-" + randomUUID() + ".json");
const browser = await chromium.launch({ headless: true });
const teacher = await browser.newPage({
  viewport: { width: 1440, height: 1000 },
});
let child, exited, timeout, socket;
const notifications = [];
if (
  process.env.EXAMOS_CAMERA_TEST_APPROVED !==
  "visible-camera-snapshots-and-clips"
)
  throw Error("Explicit real camera and temporary snapshot approval required");
try {
  const { io } = await import("socket.io-client");
  socket = io(f.base, {
    auth: { role: "teacher", token: f.token },
    transports: ["websocket"],
  });
  await new Promise((resolve, reject) => {
    socket.on("connect", resolve);
    socket.on("connect_error", reject);
  });
  socket.on("proctor-incident", (event) =>
    notifications.push({ ...event, receivedAt: Date.now() }),
  );
  await teacher.goto(f.base);
  await teacher.getByLabel("Email", { exact: true }).fill("exam@local.test");
  await teacher.getByLabel("Password", { exact: true }).fill(f.password);
  await teacher.getByRole("button", { name: "Sign in to ExamOS" }).click();
  await teacher.getByRole("heading",{name:"Dashboard",exact:true}).waitFor();
  await teacher.getByRole("link",{name:"Examinations",exact:true}).click();
  await teacher
    .getByRole("heading", { name: "Question Papers", exact: true })
    .waitFor();
  await teacher
    .getByLabel("Paper title", { exact: true })
    .fill("Real webcam integrated examination");
  await teacher.getByLabel("Subject", { exact: true }).fill("Mathematics");
  await teacher.getByLabel("Total marks", { exact: true }).fill("20");
  await teacher
    .getByLabel("Exam duration (minutes)", { exact: true })
    .fill("5");
  await teacher
    .getByLabel("Question paper PDF", { exact: true })
    .setInputFiles("tests/fixtures/mathematics-question-paper.pdf");
  await teacher
    .getByRole("button", { name: "Upload question paper", exact: true })
    .click();
  await teacher
    .getByText("Question paper uploaded.", { exact: true })
    .waitFor();
  await teacher
    .getByLabel("Examination name", { exact: true })
    .fill("Windows PDF acceptance");
  await teacher
    .getByRole("button", { name: "Start session", exact: false })
    .click();
  await teacher
    .getByLabel("Assign paper", { exact: true })
    .selectOption({ label: "Real webcam integrated examination" });
  await teacher
    .getByLabel("Examination session", { exact: true })
    .selectOption({ label: "Windows PDF acceptance" });
  await teacher
    .getByRole("button", { name: "Assign paper to session", exact: true })
    .click();
  await teacher.getByText("Paper assigned.", { exact: false }).waitFor();
  await teacher.getByRole("button", { name: "Enroll a device" }).click();
  const code = await teacher.locator("code").textContent();
  child = spawn(
    ".venv/Scripts/python.exe",
    ["tests/windows_proctor_bridge.py"],
    {
      stdio: "inherit",
      env: {
        ...process.env,
        EXAMOS_INCIDENT_TEST: "1",
        EXAMOS_TEST_URL: f.base,
        EXAMOS_ENROLLMENT_CODE: code,
        EXAMOS_LINK_REPORT: linkReport,
      },
    },
  );
  exited = new Promise((r) => child.on("exit", r));
  timeout = setTimeout(() => child.kill(), 240000);
  let link;
  for (let i = 0; i < 200; i++) {
    try {
      link = JSON.parse(await readFile(linkReport, "utf8")).url;
      break;
    } catch {
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  assert.ok(link, "Agent did not produce examination link");
  await teacher.getByRole("link",{name:"Live Proctoring",exact:true}).click();
  await teacher.locator(".device img").waitFor({ timeout: 15000 });
  await expect(teacher.locator(".device")).toContainText("Sharing");
  const studentContext = await browser.newContext();
  const student = await studentContext.newPage();
  await student.goto(link);
  await student
    .getByRole("heading", {
      name: "Real webcam integrated examination",
      exact: true,
    })
    .waitFor();
  await student.locator('canvas[data-rendered="true"]').waitFor();
  await expect(teacher.locator("#exam-progress")).toContainText("Paper opened");
  await student.getByRole("checkbox").check();
  await student
    .getByRole("button", { name: "Start examination", exact: true })
    .click();
  await student.getByRole("timer").waitFor();
  const before = await student.getByRole("timer").textContent();
  await student.waitForTimeout(2200);
  assert.notEqual(await student.getByRole("timer").textContent(), before);
  await expect(teacher.locator("#exam-progress")).toContainText(
    "Taking examination",
  );
  await student
    .getByLabel("Your text response (optional)")
    .fill("1. x = 6\n2. Area = 40 cm²");
  const supported = new Set([
    "phone_detected",
    "multiple_people",
    "no_person_detected",
  ]);
  let incident;
  for (let i = 0; i < 240; i++) {
    const live = (await f.request("/proctor/live", null, f.token)).data;
    incident = live.events.find(
      (e) => supported.has(e.category) && e.has_evidence,
    );
    if (incident) break;
    if (child.exitCode !== null)
      throw Error("Native camera test exited before an actual detection");
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  assert.ok(
    incident,
    "No supported real detector event occurred. A participant must hold a phone visibly or leave the frame; no events are fabricated.",
  );
  const device = (await f.request("/state", null, f.token)).data.devices[0];
  assert.equal(incident.device_id, device.id);
  const notification = notifications.find((n) => n.id === incident.id);
  assert.ok(notification, "No immediate teacher Socket.IO notification");
  assert.equal(notification.device_id, device.id);
  assert.equal(notification.attempt_id, incident.attempt_id);
  assert.ok(
    notification.receivedAt - new Date(notification.observed_at) < 3000,
    "Incident notification exceeded three seconds on loopback",
  );
  await teacher.getByRole("link",{name:"Incident History",exact:true}).click();
  const panel = teacher.getByRole("region", { name: "Live Proctoring" });
  const card = panel.locator('[data-incident-id="' + incident.id + '"]');
  await card
    .getByRole("button", { name: "Open incident details", exact: true })
    .click();
  const dialog = teacher.getByRole("dialog", { name: "Incident details" });
  await dialog
    .getByRole("img", { name: "Consented incident snapshot" })
    .waitFor();
  assert.ok(
    await dialog
      .getByRole("img")
      .evaluate((img) => img.complete && img.naturalWidth === 320),
  );
  const video = dialog.getByLabel("Silent incident clip");
  await video.waitFor({ timeout: 30000 });
  await expect
    .poll(() => video.evaluate((v) => v.readyState), { timeout: 15000 })
    .toBeGreaterThanOrEqual(2);
  await video.evaluate((v) => v.play());
  await expect
    .poll(() => video.evaluate((v) => v.currentTime), { timeout: 6000 })
    .toBeGreaterThan(0.3);
  let detail = (
    await f.request("/proctor/events/" + incident.id, null, f.token)
  ).data;
  assert.equal(detail.has_clip, true);
  assert.equal(detail.clip_metadata.audio, false);
  assert.ok(
    detail.clip_metadata.preEventSeconds > 0 &&
      detail.clip_metadata.postEventSeconds > 0,
  );
  assert.equal(
    (
      await f.request(
        "/proctor/events/" + incident.id + "/clip",
        null,
        f.otherToken,
      )
    ).status,
    404,
  );
  const studentToken = await student.evaluate(() =>
    sessionStorage.getItem("examos-student-token"),
  );
  assert.equal(
    (
      await f.request(
        "/proctor/events/" + incident.id + "/clip",
        null,
        studentToken,
      )
    ).status,
    401,
  );
  assert.equal(
    (await f.request("/proctor/events/" + incident.id + "/clip")).status,
    401,
  );
  const original = (
    await f.db.query(
      "SELECT category,observed_at,detail,evidence FROM proctor_events WHERE id=$1",
      [incident.id],
    )
  ).rows[0];
  await dialog
    .getByLabel("Incident review comment")
    .fill("Actual webcam test; detector output needs human context.");
  await dialog
    .getByLabel("Incident review status")
    .selectOption("false_positive");
  await dialog
    .getByRole("button", { name: "Save incident review", exact: true })
    .click();
  await expect(dialog).toContainText("false_positive");
  await dialog
    .getByLabel("Incident review comment")
    .fill("Second reviewer action for audit verification.");
  await dialog
    .getByLabel("Incident review status")
    .selectOption("requires_investigation");
  await dialog
    .getByRole("button", { name: "Save incident review", exact: true })
    .click();
  await expect(dialog).toContainText("requires_investigation");
  detail = (await f.request("/proctor/events/" + incident.id, null, f.token))
    .data;
  assert.equal(detail.reviews.length, 2);
  const after = (
    await f.db.query(
      "SELECT category,observed_at,detail,evidence FROM proctor_events WHERE id=$1",
      [incident.id],
    )
  ).rows[0];
  assert.deepEqual(
    after,
    original,
    "A review overwrote original evidence/detection",
  );
  await dialog
    .getByRole("button", { name: "Close incident details", exact: true })
    .click();
  // Inspect real clip metadata, then test expiry/deletion on the actual captured evidence.
  const clipMetadata = detail.clip_metadata;
  await f.db.query(
    "UPDATE proctor_events SET evidence_expires_at=now()-interval '1 second' WHERE id=$1",
    [incident.id],
  );
  assert.equal(
    (await f.request("/proctor/events/" + incident.id + "/clip", null, f.token))
      .status,
    404,
  );
  await new Promise((resolve) => setTimeout(resolve, 1300));
  const expired = (
    await f.db.query("SELECT evidence,clip FROM proctor_events WHERE id=$1", [
      incident.id,
    ])
  ).rows[0];
  assert.equal(expired.evidence, null);
  assert.equal(expired.clip, null);
  await student
    .getByRole("button", { name: "Submit examination", exact: true })
    .click();
  await student.getByText("Examination submitted", { exact: true }).waitFor();
  assert.equal(await exited, 0);
  const native = JSON.parse(await readFile(linkReport, "utf8"));
  delete native.url;
  const observations = (await f.request("/proctor/live", null, f.token)).data
    .events;
  for (const e of observations)
    if (e.has_evidence || e.has_clip)
      await f.request(
        "/proctor/events/" + e.id + "/delete-evidence",
        {},
        f.token,
      );
  const remaining = (
    await f.db.query(
      "SELECT count(*)::integer AS n FROM proctor_events WHERE evidence IS NOT NULL OR clip IS NOT NULL",
    )
  ).rows[0].n;
  assert.equal(remaining, 0);
  const report = {
    passed: true,
    automaticDetection: true,
    category: incident.category,
    confidence: incident.detail.confidence ?? null,
    correctStudentAndExam: true,
    realSnapshot: true,
    realWebMClipPlayed: true,
    clipMetadata,
    notificationDelayMs:
      notification.receivedAt - new Date(notification.observed_at),
    immutableDetectionVerified: true,
    appendOnlyReviewHistoryVerified: true,
    evidenceAuthorizationVerified: true,
    retentionDeletionVerified: true,
    remainingTestEvidence: remaining,
    native,
  };
  await mkdir("artifacts", { recursive: true });
  await (
    await import("node:fs/promises")
  ).writeFile(
    "artifacts/automatic-evidence-test.json",
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  console.log(
    "Incident diagnostics:",
    JSON.stringify(
      (await f.request("/proctor/live", null, f.token)).data.events,
    ),
  );
  throw error;
} finally {
  clearTimeout(timeout);
  socket?.disconnect();
  const state = (await f.request("/state", null, f.token)).data;
  for (const s of state.sessions || [])
    if (s.status === "active")
      await f.request("/sessions/" + s.id + "/end", {}, f.token);
  if (child && child.exitCode === null) {
    await Promise.race([exited, new Promise((r) => setTimeout(r, 3000))]);
    if (child.exitCode === null) child.kill();
  }
  // Even a failed test must delete any actual test evidence.
  await f.db.query(
    "UPDATE proctor_events SET evidence=NULL,clip=NULL,clip_status='deleted'",
  );
  await browser.close();
  await f.close();
}
