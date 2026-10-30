import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { fixture } from "./exam-fixture.mjs";
const digest = (value) => createHash("sha256").update(value).digest("hex");
test("dashboard-issued enrollment codes have server deadlines, normalize safely, and retain distinct lifecycle states", async () => {
  const f = await fixture(),
    other = await fixture();
  try {
    const r = f.request,
      t = f.token;
    assert.equal((await r("/enrollment", {})).status, 401);
    const issued = (await r("/enrollment", {}, t)).data;
    assert.match(issued.code, /^[0-9a-f]{24}$/);
    assert.equal(issued.expiresIn, 300);
    assert.equal(
      new Date(issued.expiresAt) - new Date(issued.serverNow),
      300000,
    );
    const stored = (
      await f.db.query("SELECT * FROM enrollments WHERE code_hash=$1", [
        digest(issued.code),
      ])
    ).rows[0];
    assert.ok(stored);
    assert.equal(stored.used_at, null);
    assert.equal(
      new Date(stored.expires_at) - new Date(stored.created_at),
      300000,
    );
    assert.ok(!JSON.stringify(stored).includes(issued.code));
    assert.equal(
      (await r("/enroll", { code: issued.code, name: "" })).data.code,
      "ENROLLMENT_NAME_REQUIRED",
    );
    const enrolled = await r("/enroll", {
      code:
        "  " +
        issued.code
          .toUpperCase()
          .match(/.{1,6}/g)
          .join(" \n") +
        "  ",
      name: "Actual enrollment test student",
    });
    assert.equal(enrolled.status, 200);
    assert.ok(enrolled.data.id && enrolled.data.token);
    assert.equal(
      (await r("/enroll", { code: issued.code, name: "Replay" })).data.code,
      "ENROLLMENT_USED",
    );
    const used = (
      await f.db.query("SELECT used_at FROM enrollments WHERE code_hash=$1", [
        digest(issued.code),
      ])
    ).rows[0];
    assert.ok(used.used_at);
    const expired = (await r("/enrollment", {}, t)).data;
    await f.db.query(
      "UPDATE enrollments SET expires_at=now()-interval '1 second' WHERE code_hash=$1",
      [digest(expired.code)],
    );
    assert.equal(
      (await r("/enroll", { code: expired.code, name: "Expired test" })).data
        .code,
      "ENROLLMENT_EXPIRED",
    );
    const otherServerCode = (
      await other.request("/enrollment", {}, other.token)
    ).data.code;
    assert.equal(
      (await r("/enroll", { code: otherServerCode, name: "Wrong server" })).data
        .code,
      "ENROLLMENT_INVALID",
    );
    const fresh = (await r("/enrollment", {}, t)).data;
    assert.equal(
      (await r("/enroll", { code: fresh.code, name: "New code student" }))
        .status,
      200,
    );
    assert.equal((await r("/state", null, t)).data.devices.length, 2);
    console.log(
      "PASS: real issued codes, hashed storage, five-minute deadline, formatting normalization, required name, single use, expired/used/wrong-server errors, and fresh code after an error.",
    );
  } finally {
    await f.close();
    await other.close();
  }
});
test("concurrent redemption permits exactly one device and device insertion failures do not consume a code", async () => {
  const f = await fixture();
  try {
    const issued = (await f.request("/enrollment", {}, f.token)).data;
    const results = await Promise.all([
      f.request("/enroll", { code: issued.code, name: "Concurrent student A" }),
      f.request("/enroll", { code: issued.code, name: "Concurrent student B" }),
    ]);
    assert.equal(results.filter((r) => r.status === 200).length, 1);
    assert.equal(
      results.find((r) => r.status !== 200).data.code,
      "ENROLLMENT_USED",
    );
    const retry = (await f.request("/enrollment", {}, f.token)).data;
    await f.db.query(
      "ALTER TABLE devices ADD CONSTRAINT enrollment_test_reject_name CHECK (name <> 'Rejected insertion')",
    );
    assert.equal(
      (
        await f.request("/enroll", {
          code: retry.code,
          name: "Rejected insertion",
        })
      ).status,
      500,
    );
    assert.equal(
      (
        await f.db.query("SELECT used_at FROM enrollments WHERE code_hash=$1", [
          digest(retry.code),
        ])
      ).rows[0].used_at,
      null,
    );
    await f.db.query(
      "ALTER TABLE devices DROP CONSTRAINT enrollment_test_reject_name",
    );
    assert.equal(
      (
        await f.request("/enroll", {
          code: retry.code,
          name: "Successful insertion retry",
        })
      ).status,
      200,
    );
    assert.equal(
      (await f.request("/state", null, f.token)).data.devices.length,
      2,
    );
    console.log(
      "PASS: simultaneous real HTTP claims create one device; the single SQL statement rolls back code consumption when device insertion fails.",
    );
  } finally {
    await f.close();
  }
});
