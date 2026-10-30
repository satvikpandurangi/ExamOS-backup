import https from "node:https";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawn } from "node:child_process";
import { randomUUID, randomBytes } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { migrate } from "../server/db.js";
import { createApp, hash } from "../server/app.js";
const db = new PGlite();
await migrate(db);
const teacher = randomUUID(),
  token = randomBytes(32).toString("hex");
await db.query("INSERT INTO teachers VALUES ($1,$2,$3)", [
  teacher,
  "tls@test.local",
  "unused-test-hash",
]);
await db.query(
  "INSERT INTO devices(id,teacher_id,name,token_hash) VALUES ($1,$2,$3,$4)",
  [randomUUID(), teacher, "TLS transport test", hash(token)],
);
const { app, attach } = createApp(db, randomBytes(48).toString("hex"));
const server = https.createServer(
    {
      cert: readFileSync("data/tls-test/server.crt"),
      key: readFileSync("data/tls-test/server.key"),
    },
    app,
  ),
  live = attach(server);
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const child = spawn(".venv/Scripts/python.exe", ["tests/tls_client.py"], {
  stdio: "inherit",
  env: {
    ...process.env,
    EXAMOS_TLS_URL: "https://127.0.0.1:" + server.address().port,
    EXAMOS_TLS_CA: resolve("data/tls-test/ca.crt"),
    EXAMOS_TLS_DEVICE_TOKEN: token,
  },
});
const code = await new Promise((r) => child.on("exit", r));
await new Promise((r) => live.close(r));
server.close();
await db.close();
process.exitCode = code ?? 1;
