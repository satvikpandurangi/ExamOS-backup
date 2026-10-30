import { database, migrate, closeDatabase } from "./db.js";
const db = await database();
try {
  await migrate(db);
  console.log("Migrations applied");
} finally {
  await closeDatabase(db);
}
