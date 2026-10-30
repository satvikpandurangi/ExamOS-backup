import { chromium, expect } from "@playwright/test";
import { fixture } from "./exam-fixture.mjs";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
const f = await fixture(),
  browser = await chromium.launch({ headless: true }),
  page = await browser.newPage({ viewport: { width: 1440, height: 1050 } }),
  errors = [];
page.on("pageerror", (e) => errors.push(e.message));
try {
  await page.goto(f.base);
  await page.getByLabel("Email", { exact: true }).fill("exam@local.test");
  await page.getByLabel("Password", { exact: true }).fill(f.password);
  await page.getByRole("button", { name: "Sign in to ExamOS" }).click();
  await page.getByRole("heading", { name: "Dashboard", exact: true }).waitFor();
  await expect(page).toHaveURL(/#\/dashboard$/);
  const real = (await f.request("/proctor/summary", null, f.token)).data;
  for (const [label, key] of [
    ["Active examinations", "active_examinations"],
    ["Connected students", "connected_students"],
    ["Cameras active", "active_cameras"],
    ["Pending incidents", "pending_incidents"],
    ["Snapshots captured", "snapshots_available"],
    ["Video recordings", "videos_available"],
  ])
    await expect(
      page
        .locator(".vision-stats article")
        .filter({ hasText: label })
        .locator("strong"),
    ).toHaveText(String(real[key]));
  await expect(
    page
      .getByRole("navigation", { name: "Teacher navigation" })
      .getByRole("link"),
  ).toHaveCount(7);
  assert.equal(await page.locator("aside").count(), 0);
  await mkdir("artifacts", { recursive: true });
  await page.screenshot({
    path: "artifacts/vision-dashboard-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    "Mobile dashboard overflows",
  );
  await page.screenshot({
    path: "artifacts/vision-dashboard-mobile.png",
    fullPage: true,
  });
  await page
    .getByRole("link", { name: "Evidence Centre", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "Evidence Centre", exact: true })
    .waitFor();
  await page
    .getByRole("heading", { name: "No saved evidence matches these filters" })
    .waitFor();
  await page.reload();
  await page
    .getByRole("heading", { name: "Evidence Centre", exact: true })
    .waitFor();
  await expect(page).toHaveURL(/#\/evidence$/);
  await page.getByRole("link", { name: "Examinations", exact: true }).click();
  await page
    .getByRole("heading", { name: "Question Papers", exact: true })
    .waitFor();
  await page.getByRole("link", { name: "Settings", exact: true }).click();
  await page.getByLabel("Evidence retention days").waitFor();
  await page.getByRole("link", { name: "Students", exact: true }).click();
  await page
    .getByRole("heading", { name: "Enrolled students", exact: true })
    .waitFor();
  await page
    .getByRole("link", { name: "Live Proctoring", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "Live Proctoring", exact: true })
    .waitFor();
  await page
    .getByRole("link", { name: "Incident History", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "Incident History", exact: true })
    .first()
    .waitFor();
  await page.goto(f.base);
  await page.getByRole("heading", { name: "Dashboard", exact: true }).waitFor();
  assert.deepEqual(errors, []);
  await writeFile(
    "artifacts/vision-dashboard-test.json",
    JSON.stringify(
      {
        passed: true,
        defaultDashboard: true,
        sevenRoutes: true,
        refreshPersists: true,
        realCounters: true,
        mobileNoOverflow: true,
        noDummyEvidence: true,
      },
      null,
      2,
    ),
  );
  console.log(
    "PASS: new default dashboard, seven real routes, backend counters, empty evidence, role-preserving refresh and responsive layout.",
  );
} finally {
  await browser.close();
  await f.close();
}
