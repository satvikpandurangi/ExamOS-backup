import assert from "node:assert/strict";
import { fixture } from "./exam-fixture.mjs";
const f = await fixture();
try {
  const issued = (await f.request("/enrollment", {}, f.token)).data;
  const deadline = new Date(issued.expiresAt).getTime();
  assert.equal(deadline - new Date(issued.serverNow).getTime(), 300000);
  console.log(
    "A real enrollment code was issued for five minutes. Waiting for its actual server deadline; no database timestamps or clocks are modified.",
  );
  while (Date.now() < deadline + 100) {
    const left = deadline + 100 - Date.now();
    await new Promise((r) => setTimeout(r, Math.min(30000, left)));
    if (left > 30000)
      console.log(
        "Actual expiry check: " +
          Math.max(0, Math.ceil((deadline - Date.now()) / 1000)) +
          " seconds left.",
      );
  }
  const expired = await f.request("/enroll", {
    code: issued.code,
    name: "Actual expiry verification student",
  });
  assert.equal(expired.status, 400);
  assert.equal(expired.data.code, "ENROLLMENT_EXPIRED");
  assert.equal(
    (await f.request("/state", null, f.token)).data.devices.length,
    0,
  );
  console.log(
    "PASS: real code rejected after its actual five-minute validity period elapsed; no device was created.",
  );
} finally {
  await f.close();
}
