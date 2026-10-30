import http from "node:http";
import { spawn } from "node:child_process";
import { randomUUID, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { PGlite } from "@electric-sql/pglite";
import { migrate } from "../server/db.js";
import { createApp } from "../server/app.js";
import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
const db = new PGlite();
await migrate(db);
const email = "validation@examos.local",
  password = randomBytes(24).toString("hex");
await db.query("INSERT INTO teachers VALUES ($1,$2,$3)", [
  randomUUID(),
  email,
  await bcrypt.hash(password, 4),
]);
const { app, attach } = createApp(db, randomBytes(48).toString("hex"));
const server = http.createServer(app),
  live = attach(server);
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const url = "http://127.0.0.1:" + server.address().port;
console.log(
  "Real Windows integration test server ready. Visible agent will open.",
);
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.goto(url);
await page.getByLabel("Email", { exact: true }).fill(email);
await page.getByLabel("Password", { exact: true }).fill(password);
await page.getByRole("button", { name: "Sign in to ExamOS" }).click();
await page
  .getByRole("heading", { name: "Dashboard", exact:true })
  .waitFor();
await page.getByRole("link",{name:"Live Proctoring",exact:true}).click();
const child = spawn(".venv/Scripts/python.exe", ["tests/windows_workflow.py"], {
  stdio: "inherit",
  env: {
    ...process.env,
    EXAMOS_TEST_URL: url,
    EXAMOS_TEST_LOGIN: JSON.stringify({ Email: email, Password: password }),
  },
});
const timeout = setTimeout(() => child.kill(), 90000);
const exited = new Promise((r) => child.on("exit", r));
let browserError;
try {
  await page.locator(".device img").waitFor({ timeout: 25000 });
  assert.ok(
    (await page.locator(".device img").getAttribute("src")).startsWith(
      "data:image/jpeg;base64,/9j/",
    ),
  );
  console.log(
    "PASS: React dashboard displayed the real Windows agent preview over Socket.IO.",
  );
  await expect(page.locator(".device img")).toHaveCount(0, { timeout: 15000 });
  await expect(page.locator(".device")).toContainText("Monitoring stopped");
  await page.getByRole("link",{name:"Incident History",exact:true}).click();
  await expect(page.locator("#review")).toContainText("consent withdrawn");
  console.log(
    "PASS: teacher preview cleared, stopped status displayed, and consent withdrawal recorded while device remained connected.",
  );
} catch (e) {
  browserError = e;
}
const code = await exited;
clearTimeout(timeout);
assert.equal(
  await page.locator(".device img").count(),
  0,
  "Preview must clear after session end",
);
await browser.close();
await new Promise((r) => live.close(r));
server.close();
await db.close();
process.exitCode = code ?? 1;
if (browserError) throw browserError;
