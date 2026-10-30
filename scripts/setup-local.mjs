import { existsSync } from "node:fs";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { randomBytes, randomUUID } from "node:crypto";
import dotenv from "dotenv";
import bcrypt from "bcryptjs";
import { database, migrate, closeDatabase } from "../server/db.js";
if (!existsSync(".env"))
  await writeFile(
    ".env",
    `EXAMOS_LOCAL_DB=1\nJWT_SECRET=${randomBytes(48).toString("hex")}\nHOST=127.0.0.1\nPORT=3000\n`,
  );
Object.assign(process.env, dotenv.parse(await readFile(".env")));
const db = await database();
try {
  await migrate(db);
  const { rows } = await db.query("SELECT count(*) AS n FROM teachers");
  if (Number(rows[0].n) === 0) {
    const password = randomBytes(18).toString("base64url");
    const email = "instructor@examos.local";
    await db.query("INSERT INTO teachers VALUES ($1,$2,$3)", [
      randomUUID(),
      email,
      await bcrypt.hash(password, 12),
    ]);
    await mkdir("data", { recursive: true });
    await writeFile(
      "data/initial-login.txt",
      `ExamOS initial instructor account\nEmail: ${email}\nPassword: ${password}\n\nLocal dashboard: http://127.0.0.1:3000\nKeep this file private. Remove it after recording your password.\n`,
    );
    console.log(
      "Created real instructor account. Credentials: data/initial-login.txt",
    );
  } else console.log("Existing teachers preserved.");
} finally {
  await closeDatabase(db);
}
console.log("Local database migrated. Run npm run dev.");
