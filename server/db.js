import "dotenv/config";
import pg from "pg";
import { readFile, mkdir, readdir } from "node:fs/promises";
import path from "node:path";
export async function migrate(db) {
  const client = db instanceof pg.Pool ? await db.connect() : db;
  try {
    await client.query("BEGIN");
    await client.query(
      "CREATE TABLE IF NOT EXISTS migrations(version text PRIMARY KEY)",
    );
    const files = (await readdir(new URL("./migrations/", import.meta.url)))
      .filter((f) => /^\d+_.*\.sql$/.test(f))
      .sort();
    for (const file of files) {
      const version = file.split("_")[0];
      const { rows } = await client.query(
        "SELECT version FROM migrations WHERE version=$1",
        [version],
      );
      if (rows.length) continue;
      const sql = await readFile(
        new URL("./migrations/" + file, import.meta.url),
        "utf8",
      );
      for (const statement of sql.split(";").filter((s) => s.trim()))
        await client.query(statement);
      await client.query("INSERT INTO migrations VALUES ($1)", [version]);
    }
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    if (client !== db) client.release();
  }
}
export async function database() {
  if (process.env.EXAMOS_LOCAL_DB === "1") {
    const { PGlite } = await import("@electric-sql/pglite");
    const directory = process.env.EXAMOS_DATA_DIR || "data/postgres";
    await mkdir(path.dirname(directory), { recursive: true });
    return new PGlite(directory);
  }
  if (!process.env.DATABASE_URL) throw Error("DATABASE_URL required");
  return new pg.Pool({ connectionString: process.env.DATABASE_URL });
}
export async function closeDatabase(db) {
  if (db.close) await db.close();
  else await db.end();
}
