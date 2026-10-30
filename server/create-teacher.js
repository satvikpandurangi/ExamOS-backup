import { database, migrate, closeDatabase } from "./db.js";
import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";
import { createInterface } from "node:readline/promises";
const rl = createInterface({ input: process.stdin, output: process.stdout });
const email = (await rl.question("Teacher email: ")).trim().toLowerCase();
console.log(
  "Password is read from EXAMOS_TEACHER_PASSWORD (minimum 12 characters).",
);
rl.close();
const password = process.env.EXAMOS_TEACHER_PASSWORD;
if (!email.includes("@") || !password || password.length < 12)
  throw Error("Valid email and password required");
const db = await database();
try {
  await migrate(db);
  await db.query("INSERT INTO teachers VALUES ($1,$2,$3)", [
    randomUUID(),
    email,
    await bcrypt.hash(password, 12),
  ]);
  console.log("Teacher created");
} finally {
  await closeDatabase(db);
}
