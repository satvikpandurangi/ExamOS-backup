import { randomBytes, randomUUID, createHash } from "node:crypto";
const digest = (value) => createHash("sha256").update(value).digest("hex");
export const normalizeEnrollmentCode = (value) =>
  typeof value === "string" ? value.replace(/\s/g, "").toLowerCase() : "";
export function enrollmentHandlers({ db, emit, onEnrolled }) {
  const reject = (res, code, error) => res.status(400).json({ code, error });
  return {
    async issue(req, res) {
      const code = randomBytes(12).toString("hex"),
        codeId = digest(code);
      const result = await db.query(
        "INSERT INTO enrollments(code_hash,teacher_id,expires_at) VALUES ($1,$2,now()+interval '5 minutes') RETURNING expires_at,now() AS server_now",
        [codeId, req.teacher],
      );
      res.json({
        code,
        codeId,
        expiresIn: 300,
        expiresAt: result.rows[0].expires_at,
        serverNow: result.rows[0].server_now,
      });
    },
    async enroll(req, res) {
      const code = normalizeEnrollmentCode(req.body.code),
        name = typeof req.body.name === "string" ? req.body.name.trim() : "";
      if (!name || name.length > 80)
        return reject(
          res,
          "ENROLLMENT_NAME_REQUIRED",
          "Enter a device/student name of 1–80 characters.",
        );
      if (!/^[0-9a-f]{24}$/.test(code))
        return reject(
          res,
          "ENROLLMENT_INVALID",
          "Invalid enrollment code. Copy the complete 24-character code from the teacher dashboard.",
        );
      const codeId = digest(code),
        token = randomBytes(32).toString("hex"),
        id = randomUUID();
      // One database statement: claiming the code and creating the device either both succeed or both roll back.
      const result = await db.query(
        `WITH claimed AS (
    UPDATE enrollments SET used_at=now() WHERE code_hash=$1 AND used_at IS NULL AND expires_at>now() RETURNING teacher_id
   ) INSERT INTO devices(id,teacher_id,name,token_hash) SELECT $2,teacher_id,$3,$4 FROM claimed RETURNING id,teacher_id`,
        [codeId, id, name, digest(token)],
      );
      if (!result.rows.length) {
        const row = (
          await db.query(
            "SELECT used_at,expires_at<=now() AS expired FROM enrollments WHERE code_hash=$1",
            [codeId],
          )
        ).rows[0];
        if (row?.used_at)
          return reject(
            res,
            "ENROLLMENT_USED",
            "This enrollment code has already been used. Reconnect an already enrolled agent with the code field blank, or generate a new code for a different device.",
          );
        if (row?.expired)
          return reject(
            res,
            "ENROLLMENT_EXPIRED",
            "This enrollment code expired after five minutes. Generate a fresh code in the teacher dashboard.",
          );
        return reject(
          res,
          "ENROLLMENT_INVALID",
          "Invalid enrollment code for this server. Check the server URL and copy a newly generated teacher code.",
        );
      }
      const teacher = result.rows[0].teacher_id;
      onEnrolled(teacher, { deviceId: id, name, codeId });
      emit(teacher);
      res.json({ id, token });
    },
  };
}
