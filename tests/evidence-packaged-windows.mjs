import { chromium, expect } from "@playwright/test";
import { spawn } from "node:child_process";
import { fixture, actualPaper } from "./exam-fixture.mjs";
import { readFile, mkdir } from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
const persistentDirectory=path.resolve('data/tmp/packaged-evidence-db-'+randomUUID());
const f = await fixture({pollingOnly:true,persistentDirectory});
const http=await import('node:http');
let blockUploads=false, failedUploadRequests=0;
const proxy=http.createServer((req,res)=>{
  const chunks=[];
  req.on('data',b=>chunks.push(b));
  req.on('end',()=>{
    const data=Buffer.concat(chunks);
    if(blockUploads && req.method==='POST' && data.includes(Buffer.from('proctor-event'))){
      failedUploadRequests++;res.writeHead(503);res.end('Temporary test network interruption');return;
    }
    const upstream=http.request(f.base+req.url,{method:req.method,headers:{...req.headers,host:new URL(f.base).host}},reply=>{res.writeHead(reply.statusCode,reply.headers);reply.pipe(res);});
    upstream.on('error',()=>{res.writeHead(502);res.end();});upstream.end(data);
  });
});
await new Promise(r=>proxy.listen(0,'127.0.0.1',r));
const agentBase='http://127.0.0.1:'+proxy.address().port;
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
    transports: ["polling"],
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
  await teacher
    .getByRole("heading", { name: "Dashboard", exact: true })
    .waitFor();
  await teacher
    .getByRole("link", { name: "Examinations", exact: true })
    .click();
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
    path.resolve("Student-Agent/ExamOS-Agent.exe"),
    ["--verify-evidence",linkReport],
    {
      stdio: "inherit",
      env: {
        ...process.env,
        EXAMOS_CONFIG_PATH:linkReport+".device",
        EXAMOS_INCIDENT_TEST: "1",
        EXAMOS_TEST_URL: agentBase,
        EXAMOS_ENROLLMENT_CODE: code,
        EXAMOS_LINK_REPORT: linkReport,
      },
    },
  );
  exited = new Promise((r) => child.on("exit", r));
  timeout = setTimeout(() => child.kill(), 360000);
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
  await teacher
    .getByRole("link", { name: "Live Proctoring", exact: true })
    .click();
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

  await teacher
    .getByRole("link", { name: "Live Proctoring", exact: true })
    .click();
  await expect
    .poll(
      async () =>
        (await f.request("/proctor/live", null, f.token)).data.devices.find(
          (d) => d.online,
        )?.cameraStatus,
      { timeout: 30000 },
    )
    .toBe("active");
  const device = (await f.request("/state", null, f.token)).data.devices.find(
    (d) => d.online,
  );
  // Warm the real, consented buffer; no image/video fixture is generated.
  await new Promise((r) => setTimeout(r, 5500));
  const checkResponse = teacher.waitForResponse(
    (r) =>
      r.url().includes("/devices/" + device.id + "/camera-check") &&
      r.request().method() === "POST",
  );
  await teacher
    .getByRole("button", { name: "Request camera check", exact: true })
    .click();
  const acknowledged = await checkResponse;
  assert.equal(acknowledged.status(), 202);
  const request = (await acknowledged.json()).requestId;
  let snapshot;
  await expect
    .poll(
      async () => {
        const x = (
          await f.request(
            "/proctor/evidence?studentId=" + device.id + "&kind=snapshot",
            null,
            f.token,
          )
        ).data;
        snapshot = x.items.find((a) => a.category === "camera_check");
        return !!snapshot;
      },
      { timeout: 15000 },
    )
    .toBe(true);
  assert.equal(JSON.parse(await readFile(linkReport,'utf8')).packaged,true);
  const detail = (
    await f.request("/proctor/events/" + snapshot.event_id, null, f.token)
  ).data;
  assert.equal(detail.detail.cameraCheckRequestId, request);
  assert.ok(detail.detail.clientEventId);
  const {createHash}=await import('node:crypto');
  assert.equal(snapshot.student_id, device.id);
  assert.equal(snapshot.examination_id, detail.attempt_id);
  assert.equal(snapshot.mime_type, "image/jpeg");
  assert.ok(snapshot.storage_location.endsWith("/evidence"));
  assert.equal(snapshot.capture_time_source, "capture");
  const exact = await f.request(
    "/proctor/evidence/" + snapshot.id + "/content",
    null,
    f.token,
  );
  assert.equal(exact.status, 200);
  assert.equal(exact.headers.get("content-type"), "image/jpeg");
  assert.equal(exact.data.length, snapshot.byte_size);
  assert.equal(createHash('sha256').update(exact.data).digest('hex'),detail.detail.captureSha256);

  assert.deepEqual(
    exact.data,
    (
      await f.request(
        "/proctor/events/" + snapshot.event_id + "/evidence",
        null,
        f.token,
      )
    ).data,
  );
  assert.equal(
    (
      await f.request(
        "/proctor/evidence/" + snapshot.id + "/content",
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
        "/proctor/evidence/" + snapshot.id + "/content",
        null,
        studentToken,
      )
    ).status,
    401,
  );
  assert.equal((await f.request("/proctor/evidence")).status, 401);
  await teacher
    .getByRole("link", { name: "Evidence Centre", exact: true })
    .click();
  const centre = teacher.getByRole("region", { name: "Evidence Centre" });
  await centre.getByLabel("Student", { exact: true }).selectOption(device.id);
  await centre
    .getByLabel("Examination", { exact: true })
    .selectOption(snapshot.session_id);
  await centre
    .getByLabel("Event category", { exact: true })
    .selectOption("camera_check");
  await centre.getByLabel("Search student name or ID").fill(device.id);
  const card = centre.locator('[data-evidence-id="' + snapshot.id + '"]');
  await card.getByRole("img").waitFor();
  await expect
    .poll(() =>
      card
        .getByRole("img")
        .evaluate((i) => i.complete && i.naturalWidth === 320),
    )
    .toBe(true);
  const small = (await card.getByRole("img").boundingBox()).width;
  await card
    .getByRole("button", {
      name: "Enlarge snapshot " + device.name,
      exact: true,
    })
    .click();
  const imageDialog = teacher.getByRole("dialog", { name: "Snapshot viewer" });
  await imageDialog.getByRole("img").waitFor();
  assert.ok((await imageDialog.getByRole("img").boundingBox()).width > small);
  await imageDialog
    .getByRole("button", { name: "Close evidence viewer" })
    .click();
  await teacher.reload();
  await teacher
    .getByRole("heading", { name: "Evidence Centre", exact: true })
    .waitFor();
  await teacher
    .locator('[data-evidence-id="' + snapshot.id + '"]')
    .getByRole("img")
    .waitFor();
  let clip;
  await expect
    .poll(
      async () => {
        clip = (
          await f.request(
            "/proctor/evidence?eventId=" + snapshot.event_id + "&kind=clip",
            null,
            f.token,
          )
        ).data.items[0];
        return !!clip;
      },
      { timeout: 30000 },
    )
    .toBe(true);
  const videoCard = teacher.locator('[data-evidence-id="' + clip.id + '"]');
  await videoCard
    .getByRole("button", { name: "Play actual video recording" })
    .click();
  const videoDialog = teacher.getByRole("dialog", {
      name: "Video recording viewer",
    }),
    video = videoDialog.getByLabel("Silent incident clip");
  await expect
    .poll(() => video.evaluate((v) => v.readyState), { timeout: 15000 })
    .toBeGreaterThanOrEqual(2);
  await video.evaluate((v) => v.play());
  await expect
    .poll(() => video.evaluate((v) => v.currentTime), { timeout: 6000 })
    .toBeGreaterThan(0.4);
  assert.ok(clip.clip_metadata.durationSeconds > 5);
  assert.equal(clip.mime_type, "video/webm");
  assert.equal(clip.clip_metadata.audio, false);
  await videoDialog
    .getByRole("button", { name: "Close evidence viewer" })
    .click();
  blockUploads=true;
  await (await import('node:fs/promises')).writeFile(linkReport.replace(/\.json$/,'.command'),'camera-check');
  await expect.poll(()=>failedUploadRequests,{timeout:15000}).toBeGreaterThan(0);
  const queueDirectory=linkReport+'-evidence';
  await new Promise(r=>setTimeout(r,5000));
  const queueFiles=(await (await import('node:fs/promises')).readdir(queueDirectory)).filter(n=>n.endsWith('.queue'));
  assert.ok(queueFiles.length>0,'Real failed upload must remain in encrypted queue');
  const encrypted=await readFile(path.join(queueDirectory,queueFiles[0]));
  assert.equal(encrypted.includes(Buffer.from('jpeg')),false);

  blockUploads=false;
  await (await import('node:fs/promises')).writeFile(linkReport.replace(/\.json$/,'.command'),'reconnect');
  await expect.poll(async()=> (await f.request('/proctor/evidence?studentId='+device.id+'&kind=snapshot',null,f.token)).data.items.filter(a=>a.category==='camera_check').length,{timeout:40000}).toBe(2);
  const recovered=(await f.request('/proctor/evidence?studentId='+device.id+'&kind=snapshot',null,f.token)).data.items.find(a=>a.id!==snapshot.id && a.category==='camera_check');
  assert.ok(recovered);
  await teacher.getByRole("link", { name: "Dashboard", exact: true }).click();
  const counts = (await f.request("/proctor/summary", null, f.token)).data;
  await expect(
    teacher
      .locator(".vision-stats article")
      .filter({ hasText: "Snapshots captured" })
      .locator("strong"),
  ).toHaveText(String(counts.snapshots_available));
  await expect(
    teacher
      .locator(".vision-stats article")
      .filter({ hasText: "Video recordings" })
      .locator("strong"),
  ).toHaveText(String(counts.videos_available));
  console.log(
    "REAL CAMERA CHECK SAVED AND PLAYED. Hold a phone clearly in view for a genuine detector event if one has not occurred yet.",
  );
  let automatic;
  for (let i = 0; i < 240; i++) {
    automatic = (
      await f.request("/proctor/live", null, f.token)
    ).data.events.find(
      (e) =>
        ["phone_detected", "multiple_people", "no_person_detected"].includes(
          e.category,
        ) && e.has_evidence,
    );
    if (automatic) break;
    await new Promise((r) => setTimeout(r, 500));
  }
  assert.ok(
    automatic,
    "No genuine supported detector event occurred; no event was fabricated.",
  );
  const autoMedia = (
    await f.request("/proctor/evidence?eventId=" + automatic.id, null, f.token)
  ).data.items;
  assert.ok(
    autoMedia.some((a) => a.kind === "snapshot" && a.student_id === device.id),
  );
  await teacher
    .getByRole("link", { name: "Evidence Centre", exact: true })
    .click();
  const originalCard = teacher.locator(
    '[data-evidence-id="' + snapshot.id + '"]',
  );
  await originalCard
    .getByRole("button", { name: "Related incident", exact: true })
    .click();
  await teacher.getByRole("dialog", { name: "Incident details" }).waitFor();
  await teacher
    .getByLabel("Incident review comment")
    .fill("Real capture verification; no misconduct finding.");
  await teacher.getByLabel("Incident review status").selectOption("reviewed");
  await teacher
    .getByRole("button", { name: "Save incident review", exact: true })
    .click();
  await expect(
    teacher.getByRole("dialog", { name: "Incident details" }),
  ).toContainText("reviewed");
  await teacher
    .getByRole("button", { name: "Close incident details", exact: true })
    .click();
  await teacher
    .getByRole("link", { name: "Evidence Centre", exact: true })
    .click();
  await student
    .getByRole("button", { name: "Submit examination", exact: true })
    .click();
  await student.getByText("Examination submitted", { exact: true }).waitFor();
  assert.equal(await exited, 0);
  await f.restart();
  const persisted=await f.request('/proctor/evidence/'+snapshot.id+'/content',null,f.token);
  assert.equal(persisted.status,200);assert.deepEqual(persisted.data,exact.data);
  await teacher.reload();
  await teacher.locator('[data-evidence-id="'+snapshot.id+'"]').getByRole('img').waitFor();
  await teacher
    .locator('[data-evidence-id="' + snapshot.id + '"]')
    .getByRole("button", { name: "Delete evidence", exact: true })
    .click();
  await teacher
    .getByRole("button", { name: "Cancel deletion", exact: true })
    .click();
  assert.equal(
    (
      await f.request(
        "/proctor/evidence/" + snapshot.id + "/content",
        null,
        f.token,
      )
    ).status,
    200,
  );
  await teacher
    .locator('[data-evidence-id="' + snapshot.id + '"]')
    .getByRole("button", { name: "Delete evidence", exact: true })
    .click();
  await teacher
    .getByRole("button", { name: "Confirm delete evidence", exact: true })
    .click();
  await expect(
    teacher.locator('[data-evidence-id="' + snapshot.id + '"]'),
  ).toHaveCount(0);
  assert.equal(
    (
      await f.request(
        "/proctor/evidence/" + snapshot.id + "/content",
        null,
        f.token,
      )
    ).status,
    410,
  );
  assert.equal(
    (
      await f.request(
        "/proctor/evidence/" + clip.id + "/content",
        null,
        f.token,
      )
    ).status,
    200,
    "Deleting a snapshot must not silently delete the separate video",
  );
  await teacher
    .locator('[data-evidence-id="' + clip.id + '"]')
    .getByRole("button", { name: "Delete evidence", exact: true })
    .click();
  await teacher
    .getByRole("button", { name: "Confirm delete evidence", exact: true })
    .click();
  assert.equal(
    (
      await f.request(
        "/proctor/evidence/" + clip.id + "/content",
        null,
        f.token,
      )
    ).status,
    410,
  );
  const audit = (
    await f.request(
      "/sessions/" + snapshot.session_id + "/events",
      null,
      f.token,
    )
  ).data;
  assert.ok(
    audit.some(
      (e) =>
        e.kind === "evidence_viewed" && e.detail.evidenceId === snapshot.id,
    ),
  );
  assert.ok(
    audit.some(
      (e) =>
        e.kind === "evidence_asset_deleted" && e.detail.evidenceId === clip.id,
    ),
  );
  await teacher.goto(f.base);
  await teacher
    .getByRole("heading", { name: "Dashboard", exact: true })
    .waitFor();
  const native = JSON.parse(await readFile(linkReport, "utf8"));
  delete native.url;
  const sourceReceipt=native.uploadReceipts.find(r=>r.id===snapshot.event_id);
  assert.ok(sourceReceipt,'Packaged agent must independently confirm its own upload receipt');
  assert.equal(sourceReceipt.captureSha256,createHash('sha256').update(exact.data).digest('hex'));
  const recoveredDetail=(await f.request('/proctor/events/'+recovered.event_id,null,f.token)).data;
  assert.equal((await f.db.query("SELECT count(*)::int AS n FROM proctor_events WHERE detail->>'clientEventId'=$1",[recoveredDetail.detail.clientEventId])).rows[0].n,1);
  const report = {
    passed: true,
    defaultVisionDashboard: true,
    teacherRequestedRealSnapshot: true,
    requestId: request,
    evidenceId: snapshot.id,
    eventId: snapshot.event_id,
    correctStudentAndExamination: true,
    snapshotMime: snapshot.mime_type,
    videoMime: clip.mime_type,
    storageLocation: snapshot.storage_location,
    actualSnapshotEnlarged: true,
    actualVideoPlayed: true,
    clipMetadata: clip.clip_metadata,
    refreshRetainedEvidence: true,
    persistentDatabaseRestart:true,
    realNetworkFailureRetried:true,
    failedUploadRequests,
    sourceCaptureSha256:detail.detail.captureSha256,
    actualCounters: true,
    genuineAutomaticCategory: automatic.category,
    confidence: automatic.detail.confidence ?? null,
    authorization: true,
    confirmedDeletion: true,
    separateSnapshotAndVideo: true,
    viewAndDeletionAudit: true,
    native,
  };
  await mkdir("artifacts", { recursive: true });
  await (
    await import("node:fs/promises")
  ).writeFile(
    "artifacts/evidence-packaged-e2e.json",
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report, null, 2));
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
  await f.db.query(
    "UPDATE proctor_events SET evidence=NULL,clip=NULL,clip_status='deleted'",
  );
  await browser.close();
  proxy.close();
  await f.close();
  const fs=await import('node:fs/promises');
  // Only this run's isolated files: never the user's device credential or main database.
  const tempRoot=path.resolve('data/tmp')+path.sep;
  for(const target of [persistentDirectory,linkReport+'-evidence']) {
    if(!path.resolve(target).startsWith(tempRoot)) throw Error('Unsafe test cleanup path');
    await fs.rm(target,{recursive:true,force:true});
  }
  await fs.rm(linkReport+'.device',{force:true});
  await fs.rm(linkReport,{force:true});
}

