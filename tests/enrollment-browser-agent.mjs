import { chromium, expect } from "@playwright/test";
import { spawn } from "node:child_process";
import { readFile, mkdir,writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { fixture } from "./exam-fixture.mjs";
const baseline = process.env.EXAMOS_EXPECT_BASELINE_FAILURE === "1";
const f = await fixture({ pollingOnly: true });
let rejectStudent=process.env.EXAMOS_REJECT_FIRST_SOCKET==='1';
if(rejectStudent)f.live.use((socket,next)=>socket.device&&rejectStudent?next(Error('Temporary connection rejection during enrollment verification')):next());
await mkdir("data/tmp", { recursive: true });
const reportFile = path.resolve(
  "data/tmp/enrollment-" + randomUUID() + ".json",
);
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
let child;
try {
  await page.goto(f.base);
  await page.getByLabel("Email", { exact: true }).fill("exam@local.test");
  await page.getByLabel("Password", { exact: true }).fill(f.password);
  await page.getByRole("button", { name: "Sign in to ExamOS" }).click();
  await page
    .getByRole("heading", { name: "Your examination, in view." })
    .waitFor();
  await page.getByRole("button", { name: "Enroll a device" }).click();
  await page.locator("code").waitFor();
  const code = await page.locator("code").textContent();
  assert.match(code, /^[0-9a-f]{24}$/);
  child = spawn(
    ".venv/Scripts/python.exe",
    ["tests/enrollment-agent-driver.py"],
    {
      stdio: "inherit",
      env: {
        ...process.env,
        EXAMOS_TEST_URL: f.base,
        EXAMOS_ENROLLMENT_CODE: code,
        EXAMOS_ENROLLMENT_REPORT: reportFile,
      },
    },
  );
  const timeout = setTimeout(() => child.kill(), 35000);
  const exited = new Promise((r) => child.on("exit", r));
  if(rejectStudent){
    let interim;
    for(let i=0;i<250;i++){try{interim=JSON.parse(await readFile(reportFile,'utf8'));if(interim.phase)break;}catch{}await new Promise(r=>setTimeout(r,50));}
    assert.equal(interim?.phase,'saved_after_connection_failure');assert.equal(interim.codeClearedAfterFailedConnection,true);
    rejectStudent=false;await writeFile(reportFile+'.retry','Socket connection available again');
  }
  if (!baseline) {
    await expect(page.locator(".device")).toContainText(
      "Enrollment verification student",
    );
    await expect(page.locator(".device")).toContainText("Awaiting consent");
    await expect(page.locator('code')).toHaveText('Already used');
    await expect(page.locator(".stats").first()).toContainText("1");
  }
  const exitCode = await exited;
  clearTimeout(timeout);
  const report = JSON.parse(await readFile(reportFile, "utf8"));
  console.log(JSON.stringify(report, null, 2));
  assert.equal(exitCode, 0);
  assert.equal(report.passed, true);
  const records = (await f.request("/state", null, f.token)).data.devices;
  assert.equal(
    records.length,
    1,
    "A connection retry must never create a second device",
  );
  console.log(
    baseline
      ? "REPRODUCED: real HTTP enrollment succeeded, WebSocket-first connection failed, and retry incorrectly reused the consumed code."
      : "PASS: teacher dashboard code -> actual Windows agent -> polling-only real server connection -> teacher online device -> reconnect with original saved credential; no monitoring started.",
  );
} finally {
  if (child && child.exitCode === null) child.kill();
  await browser.close();
  await f.close();
}
