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
let child, exited, timeout;
try {
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
    .fill("Windows integrated examination");
  await teacher.getByLabel("Subject", { exact: true }).fill("Mathematics");
  await teacher.getByLabel("Total marks", { exact: true }).fill("20");
  await teacher
    .getByLabel("Exam duration (minutes)", { exact: true })
    .fill("2");
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
    .selectOption({ label: "Windows integrated examination" });
  await teacher
    .getByLabel("Examination session", { exact: true })
    .selectOption({ label: "Windows PDF acceptance" });
  await teacher
    .getByRole("button", { name: "Assign paper to session", exact: true })
    .click();
  await teacher.getByText("Paper assigned.", { exact: false }).waitFor();
  await teacher.getByRole("button", { name: "Enroll a device" }).click();
  const code = await teacher.locator("code").textContent();
  child = spawn(".venv/Scripts/python.exe", ["tests/windows_exam_bridge.py"], {
    stdio: "inherit",
    env: {
      ...process.env,
      EXAMOS_TEST_URL: f.base,
      EXAMOS_ENROLLMENT_CODE: code,
      EXAMOS_LINK_REPORT: linkReport,
    },
  });
  exited = new Promise((r) => child.on("exit", r));
  timeout = setTimeout(() => child.kill(), 80000);
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
      name: "Windows integrated examination",
      exact: true,
    })
    .waitFor();
  await student.locator('canvas[data-rendered="true"]').waitFor();
  await expect(teacher.locator("#exam-progress")).toContainText("Paper opened");
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
  await student
    .getByRole("button", { name: "Submit examination", exact: true })
    .click();
  await student.getByText("Examination submitted", { exact: true }).waitFor();
  await expect(teacher.locator("#exam-progress")).toContainText("Submitted");
  await teacher.getByRole("link",{name:"Examinations",exact:true}).click();
  await teacher
    .getByRole("button", { name: "End session & stop monitoring" })
    .click();
  assert.equal(await exited, 0);
  await expect(teacher.locator(".device img")).toHaveCount(0);
  console.log(
    "PASS: real teacher UI upload/assignment, real Windows device enrollment/consent and application/screen telemetry, actual agent-generated launch link, student PDF/start/timer/response/submission and teacher progress; session end stopped monitoring.",
  );
} catch (error) {
  const diagnostics = (await f.request("/state", null, f.token)).data;
  console.log(
    "Examination regression diagnostic:",
    JSON.stringify({
      devices: diagnostics.devices,
      sessions: diagnostics.sessions.map((s) => ({
        id: s.id,
        status: s.status,
      })),
    }),
  );
  for (const s of diagnostics.sessions)
    console.log(
      "Session events:",
      JSON.stringify(
        (
          await f.request("/sessions/" + s.id + "/events", null, f.token)
        ).data.map((e) => ({ kind: e.kind, detail: e.detail })),
      ),
    );
  throw error;
} finally {
  clearTimeout(timeout);
  const state = (await f.request("/state", null, f.token)).data;
  for (const s of state.sessions || [])
    if (s.status === "active")
      await f.request("/sessions/" + s.id + "/end", {}, f.token);
  if (child && child.exitCode === null) {
    await Promise.race([exited, new Promise((r) => setTimeout(r, 3000))]);
    if (child.exitCode === null) child.kill();
  }
  await browser.close();
  await f.close();
}
