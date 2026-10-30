/**
 * Suspicious behavior detection and admin control integration
 * Handles gaze/attention anomalies and admin freeze/end actions
 */

import { randomUUID } from "node:crypto";

export function createSuspiciousBehaviorStore(db) {
  return {
    /**
     * Record a suspicious behavior event from the student agent
     */
    async recordEvent({ sessionId, deviceId, attemptId, category, severity, detail, snapshotId }) {
      const result = await db.query(
        `INSERT INTO suspicious_behavior_events
         (session_id, device_id, attempt_id, category, severity, detail, snapshot_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING *`,
        [sessionId, deviceId, attemptId, category, severity, JSON.stringify(detail), snapshotId]
      );
      return result.rows[0];
    },

    /**
     * Get suspicious events for a session with pagination
     */
    async listBySession(sessionId, { limit = 50, offset = 0, unreviewedOnly = false, category = null } = {}) {
      let query = `
        SELECT e.*, d.name as device_name, t.name as teacher_name,
               e.snapshot_id as snapshot_id
        FROM suspicious_behavior_events e
        JOIN devices d ON e.device_id = d.id
        LEFT JOIN teachers t ON e.teacher_reviewed_by = t.id
        WHERE e.session_id = $1
      `;
      const params = [sessionId];

      if (unreviewedOnly) {
        query += ` AND e.teacher_reviewed = FALSE`;
      }
      if (category) {
        query += ` AND e.category = $${params.length + 1}`;
        params.push(category);
      }

      query += ` ORDER BY e.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
      params.push(limit, offset);

      const result = await db.query(query, params);
      return result.rows;
    },

    /**
     * Get suspicious events for a device
     */
    async listByDevice(deviceId, { limit = 50, offset = 0 } = {}) {
      const result = await db.query(
        `SELECT e.*, d.name as device_name
         FROM suspicious_behavior_events e
         JOIN devices d ON e.device_id = d.id
         WHERE e.device_id = $1
         ORDER BY e.created_at DESC LIMIT $2 OFFSET $3`,
        [deviceId, limit, offset]
      );
      return result.rows;
    },

    /**
     * Get pending (unreviewed) suspicious events count per device for a session
     */
    async pendingCounts(sessionId) {
      const result = await db.query(
        `SELECT device_id, category, COUNT(*) as count
         FROM suspicious_behavior_events
         WHERE session_id = $1 AND teacher_reviewed = FALSE
         GROUP BY device_id, category
         ORDER BY count DESC`,
        [sessionId]
      );
      return result.rows;
    },

    /**
     * Teacher reviews a suspicious event (ignore or flag)
     */
    async review({ eventId, teacherId, review, action }) {
      const validActions = ["ignored", "flagged", "investigating"];
      if (!validActions.includes(action)) {
        throw Object.assign(new Error("Invalid review action"), { status: 400 });
      }

      const result = await db.query(
        `UPDATE suspicious_behavior_events
         SET teacher_reviewed = TRUE,
             teacher_review = $1,
             teacher_reviewed_at = NOW(),
             teacher_reviewed_by = $2,
             action_taken = $3,
             action_taken_at = NOW(),
             action_taken_by = $2
         WHERE id = $4
         RETURNING *`,
        [review, teacherId, action, eventId]
      );

      if (result.rows.length === 0) {
        throw Object.assign(new Error("Event not found"), { status: 404 });
      }

      return result.rows[0];
    },

    /**
     * Get a suspicious event by ID with ownership verification
     */
    async findById(eventId, teacherId) {
      const result = await db.query(
        `SELECT e.*, s.teacher_id, d.name as device_name
         FROM suspicious_behavior_events e
         JOIN sessions s ON e.session_id = s.id
         JOIN devices d ON e.device_id = d.id
         WHERE e.id = $1`,
        [eventId]
      );

      if (result.rows.length === 0) {
        throw Object.assign(new Error("Event not found"), { status: 404 });
      }

      const event = result.rows[0];
      if (event.teacher_id !== teacherId) {
        throw Object.assign(new Error("Forbidden"), { status: 403 });
      }

      return event;
    },

    /**
     * Get recent suspicious events for a teacher's sessions
     */
    async listByTeacher(teacherId, { limit = 100, offset = 0, unreviewedOnly = false } = {}) {
      let query = `
        SELECT e.*, d.name as device_name, s.name as session_name
        FROM suspicious_behavior_events e
        JOIN devices d ON e.device_id = d.id
        JOIN sessions s ON e.session_id = s.id
        WHERE s.teacher_id = $1
      `;
      const params = [teacherId];

      if (unreviewedOnly) {
        query += ` AND e.teacher_reviewed = FALSE`;
      }

      query += ` ORDER BY e.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
      params.push(limit, offset);

      const result = await db.query(query, params);
      return result.rows;
    }
  };
}